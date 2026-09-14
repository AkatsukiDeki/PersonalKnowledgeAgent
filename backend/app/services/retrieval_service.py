import re
import uuid
import logging
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..core.profiler import LatencyProfiler
from ..db.models import (
    Chunk,
    Claim,
    ClaimRelation,
    ConversationMemory,
    Decision,
    Pattern,
    Source,
    Subject,
    TimelineEvent,
)
from ..knowledge.embeddings.factory import get_embedding_provider
from ..knowledge.graph_traversal import GraphTraversalEngine
from ..knowledge.query_condenser import rewrite_query
from ..knowledge.reranker import rerank_service
from ..knowledge.retrieval import hybrid_search
from ..schemas.chat import ChatRequest
from ..schemas.profiles import ExecutionProfile

logger = logging.getLogger(__name__)


def build_citation_dict(item: dict) -> dict:
    mi = item.get("metadata_info") or {}
    text_val = item["text_content"]

    media_type = mi.get("media_type")
    start_time = mi.get("start_time")
    end_time = mi.get("end_time")
    source_title = item.get("source_title")

    if start_time is None:
        match = re.search(r"\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]", text_val[:200])
        if match:
            m, s = int(match.group(1)), int(match.group(2))
            start_time = float(m * 60 + s)
            if not media_type:
                media_type = "audio"

    return {
        "chunk_id": str(item["chunk_id"]),
        "source_id": str(item["source_id"]),
        "text_snippet": text_val[:150] + "..." if len(text_val) > 150 else text_val,
        "score": round(float(item.get("rrf_score", item.get("score", 0.0))), 4),
        "media_type": media_type,
        "start_time": start_time,
        "end_time": end_time,
        "source_title": source_title,
    }


async def _build_context_and_check_evidence(
    db: AsyncSession,
    payload: ChatRequest,
    intent: str,
    profiler: LatencyProfiler,
    profile: ExecutionProfile,
):
    profiler.start_stage("02_query_condense")

    if not profile.retrieval_enabled:
        return True, [], payload.query, intent

    is_success, search_query = await rewrite_query(payload.query, payload.history)

    if intent in ("ANALYTICAL", "TEMPORAL"):
        min_sim = settings.ANALYTICAL_MIN_TOP1_SIMILARITY
    else:
        min_sim = settings.FACTUAL_MIN_TOP1_SIMILARITY

    profiler.start_stage("03_l1_retrieval")
    candidate_limit = (
        profile.max_chunks * 2
        if getattr(profile, "reranking_enabled", False)
        else profile.max_chunks
    )
    l1_chunks = await hybrid_search(
        db=db,
        original_query=payload.query,
        search_query=search_query,
        scope_folder=payload.scope_folder,
        limit=candidate_limit,
        include_history=False,
        profiler=profiler,
    )

    if getattr(profile, "reranking_enabled", False) and l1_chunks:
        l1_chunks = rerank_service.rerank(payload.query, l1_chunks, top_n=profile.max_chunks)
        l1_chunks = [c for c in l1_chunks if c.get("rerank_score", 0.0) > 0.01]

    for r in l1_chunks:
        if not r["text_content"].startswith("[L1 CHUNK]"):
            r["text_content"] = f"[L1 CHUNK] {r['text_content']}"

    attached_chunks_list = []
    if payload.attached_source_ids:
        src_stmt = select(Source).where(Source.id.in_(payload.attached_source_ids))
        src_res = await db.execute(src_stmt)
        sources = src_res.scalars().all()
        for src in sources:
            content = src.content or src.raw_content
            if not content:
                chunk_stmt = (
                    select(Chunk.text_content)
                    .where(Chunk.source_id == src.id)
                    .order_by(Chunk.start_time.asc().nulls_last())
                    .limit(50)
                )
                chunk_res = await db.execute(chunk_stmt)
                chunk_texts = chunk_res.scalars().all()
                content = "\n".join(chunk_texts)

            content = content or ""
            if len(content) > 10000:
                content = content[:10000] + "... (truncated)"

            attached_chunks_list.append(
                {
                    "chunk_id": str(uuid.uuid4()),
                    "source_id": str(src.id),
                    "text_content": f"=== [ATTACHED FILE: {src.title}] ===\n{content}",
                    "score": 1.0,
                    "rrf_score": 1.0,
                    "is_pattern": False,
                }
            )

    if payload.learning_context and payload.learning_context.get("subject_id"):
        try:
            subject_id = payload.learning_context["subject_id"]
            subj_stmt = (
                select(Subject)
                .options(selectinload(Subject.sources))
                .where(Subject.id == subject_id)
            )
            subj_res = await db.execute(subj_stmt)
            subject = subj_res.scalar_one_or_none()
            if subject:
                subject_source_ids = {str(s.id) for s in subject.sources}
                for chunk in l1_chunks:
                    if chunk.get("source_id") in subject_source_ids:
                        chunk["rrf_score"] = float(chunk.get("rrf_score", 0)) * 1.5

                l1_chunks.sort(key=lambda x: float(x.get("rrf_score", 0)), reverse=True)

                l1_chunks.insert(
                    0,
                    {
                        "chunk_id": str(uuid.uuid4()),
                        "source_id": str(uuid.uuid4()),
                        "text_content": (
                            f"[TUTOR CONTEXT] Active Subject: {subject.title}. "
                            "Please focus your explanations on this domain and act as a mentor."
                        ),
                        "score": 2.0,
                        "rrf_score": 2.0,
                        "is_pattern": False,
                    },
                )
        except Exception as e:
            logger.warning(f"Failed to apply learning_context boost: {e}")

    l2_claims = []
    l3_patterns = []
    l4_timeline = []
    graph_context = []

    profiler.start_stage("04_vector_enrichment")
    provider = get_embedding_provider()
    query_emb = None
    try:
        query_emb = await provider.embed_query(search_query)
    except Exception as e:
        logger.warning(f"Failed to embed query for ML Enrichment: {e}")

    if query_emb and len(query_emb) == settings.EMBEDDING_DIMENSION:
        dec_stmt = (
            select(Decision, Decision.embedding.cosine_distance(query_emb).label("distance"))
            .where(Decision.embedding.is_not(None))
            .order_by(Decision.embedding.cosine_distance(query_emb))
            .limit(profile.max_chunks)
        )
        dec_res = await db.execute(dec_stmt)
        for dec, dist in dec_res.all():
            sim = 1.0 - float(dist)
            if sim < 0.45:
                continue
            score_multiplier = 1.5 if dec.status == "active" else 0.1
            final_sim = sim * score_multiplier
            l2_claims.append(
                {
                    "chunk_id": str(dec.id),
                    "source_id": str(dec.memory_id),
                    "text_content": (
                        f"=== [DECISION ({dec.status})] ===\n"
                        f"Decision: {dec.decision}\n"
                        f"Rationale: {dec.rationale}\n"
                        f"Alternatives: {', '.join(dec.alternatives)}"
                    ),
                    "similarity": final_sim,
                    "rrf_score": final_sim,
                    "is_pattern": True,
                }
            )

        mem_stmt = (
            select(
                ConversationMemory,
                ConversationMemory.embedding.cosine_distance(query_emb).label("distance"),
            )
            .where(ConversationMemory.embedding.is_not(None))
            .order_by(ConversationMemory.embedding.cosine_distance(query_emb))
            .limit(max(1, profile.max_chunks // 2))
        )
        mem_res = await db.execute(mem_stmt)
        for mem, dist in mem_res.all():
            sim = 1.0 - float(dist)
            if sim < 0.3:
                continue
            attempts_text = (
                ", ".join(mem.attempts) if isinstance(mem.attempts, list) else mem.attempts
            )
            l2_claims.append(
                {
                    "chunk_id": str(mem.id),
                    "source_id": str(mem.conversation_id),
                    "text_content": (
                        f"=== [CONVERSATION MEMORY] ===\n"
                        f"Problem: {mem.problem}\n"
                        f"Attempts: {attempts_text}\n"
                        f"Outcome: {mem.outcome}"
                    ),
                    "similarity": sim,
                    "rrf_score": sim,
                    "is_pattern": True,
                }
            )

    profiler.start_stage("05_graph_and_deep_retrieval")
    chunk_ids = [r["chunk_id"] for r in l1_chunks]
    parent_scores = {
        chunk["chunk_id"]: float(chunk.get("rrf_score") or chunk.get("score") or 0.0)
        for chunk in l1_chunks
    }

    if chunk_ids and profile.graph_expansion:
        claims = (
            (
                await db.execute(
                    select(Claim)
                    .where(Claim.chunk_id.in_(chunk_ids), Claim.is_active == True)
                    .limit(5)
                )
            )
            .scalars()
            .all()
        )
        claim_ids = [c.id for c in claims]
        for c in claims:
            parent_score = parent_scores.get(c.chunk_id, 0.01)
            l2_score = parent_score * 0.85
            l2_claims.append(
                {
                    "chunk_id": str(c.id),
                    "source_id": str(c.source_id),
                    "text_content": f"=== [L2 УТВЕРЖДЕНИЕ] ===\n{c.content}",
                    "score": l2_score,
                    "rrf_score": l2_score,
                    "is_pattern": True,
                }
            )

        if claim_ids:
            relations = (
                (
                    await db.execute(
                        select(ClaimRelation)
                        .where(
                            (ClaimRelation.source_claim_id.in_(claim_ids))
                            | (ClaimRelation.target_claim_id.in_(claim_ids))
                        )
                        .limit(5)
                    )
                )
                .scalars()
                .all()
            )
            for r in relations:
                source_claim_score = next(
                    (
                        float(c["rrf_score"])
                        for c in l2_claims
                        if c["chunk_id"] == str(r.source_claim_id)
                    ),
                    0.01,
                )
                target_claim_score = next(
                    (
                        float(c["rrf_score"])
                        for c in l2_claims
                        if c["chunk_id"] == str(r.target_claim_id)
                    ),
                    0.01,
                )
                relation_score = max(source_claim_score, target_claim_score) * 0.7

                l4_timeline.append(
                    {
                        "chunk_id": str(r.id),
                        "source_id": str(r.source_claim_id),
                        "text_content": f"=== [L4 СВЯЗЬ: {r.relation_type}] ===\n{r.evidence_summary}",
                        "score": relation_score,
                        "rrf_score": relation_score,
                        "is_pattern": True,
                    }
                )

            traversal_engine = GraphTraversalEngine(db)
            graph_context_text = await traversal_engine.traverse_from_claims(
                claim_ids, max_depth=2, limit_neighbors=5
            )
            if graph_context_text:
                graph_context.append(
                    {
                        "chunk_id": str(uuid.uuid4()),
                        "source_id": str(uuid.uuid4()),
                        "text_content": f"=== [GRAPH CONTEXT] ===\n{graph_context_text}",
                        "score": 0.015,
                        "rrf_score": 0.015,
                        "is_pattern": True,
                    }
                )

        if intent in ("TEMPORAL", "ANALYTICAL") and claim_ids:
            timeline_events = (
                (
                    await db.execute(
                        select(TimelineEvent)
                        .options(
                            selectinload(TimelineEvent.old_claim),
                            selectinload(TimelineEvent.new_claim),
                        )
                        .where(
                            (TimelineEvent.old_claim_id.in_(claim_ids))
                            | (TimelineEvent.new_claim_id.in_(claim_ids))
                        )
                        .order_by(TimelineEvent.timestamp.desc())
                        .limit(5)
                    )
                )
                .scalars()
                .all()
            )

            if timeline_events:
                timeline_text_parts = []
                for ev in timeline_events:
                    old_date = (
                        ev.old_claim.valid_from.strftime("%Y-%m-%d")
                        if (ev.old_claim and ev.old_claim.valid_from)
                        else "Ранее"
                    )
                    new_date = (
                        ev.new_claim.valid_from.strftime("%Y-%m-%d")
                        if (ev.new_claim and ev.new_claim.valid_from)
                        else ev.timestamp.strftime("%Y-%m-%d")
                    )
                    timeline_text_parts.append(
                        f"* [{old_date} -> {new_date}] {ev.title}: \"{ev.description}\" "
                        f"(supersedes: Claim #{ev.old_claim_id} -> Claim #{ev.new_claim_id})"
                    )

                timeline_context = "=== [L4 TIMELINE EVOLUTION] ===\n" + "\n".join(timeline_text_parts)
                l4_timeline.append(
                    {
                        "chunk_id": str(uuid.uuid4()),
                        "source_id": str(uuid.uuid4()),
                        "text_content": timeline_context,
                        "score": 0.015,
                        "rrf_score": 0.015,
                        "is_pattern": True,
                    }
                )

    if intent in ("ANALYTICAL", "TEMPORAL", "FACTUAL"):
        patterns = (
            (
                await db.execute(
                    select(Pattern)
                    .where(Pattern.confidence >= 0.70, Pattern.status == "accepted")
                    .order_by(Pattern.created_at.desc())
                    .limit(3)
                )
            )
            .scalars()
            .all()
        )
        for p in patterns:
            if p.evidence_claim_ids:
                l3_patterns.append(
                    {
                        "chunk_id": str(p.id),
                        "source_id": str(p.id),
                        "text_content": (
                            f"=== [L3 ПАТТЕРНЫ] ===\n"
                            f"{p.title}: {p.description}\n"
                            f"Обоснование: {p.evidence_summary}"
                        ),
                        "score": 0.015,
                        "rrf_score": 0.015,
                        "is_pattern": True,
                    }
                )

    max_context_chars = 12000
    retrieved_raw = (
        attached_chunks_list
        + l1_chunks
        + l2_claims
        + l3_patterns
        + l4_timeline
        + graph_context
    )
    retrieved_raw.sort(
        key=lambda x: float(x.get("rrf_score") or x.get("score") or 0.0), reverse=True
    )

    retrieved = []
    current_chars = 0
    for item in retrieved_raw:
        item_len = len(item.get("text_content", ""))
        if current_chars + item_len > max_context_chars:
            if not retrieved and item_len > 500:
                item["text_content"] = (
                    item["text_content"][:max_context_chars] + "...(truncated)"
                )
                retrieved.append(item)
            break
        retrieved.append(item)
        current_chars += item_len

    relevance_threshold = 0.45
    has_high_sim = any(
        float(item.get("similarity", 0.0)) >= relevance_threshold
        for item in retrieved
        if "similarity" in item
    )

    valid_evidence = [
        item
        for item in retrieved
        if (
            "similarity" not in item
            or float(item["similarity"]) >= relevance_threshold
        )
        and ("rerank_score" not in item or float(item["rerank_score"]) >= 0.01)
    ]

    is_sufficient = True
    if intent not in ("META",):
        if not has_high_sim and not payload.history:
            is_sufficient = False
        elif not payload.history:
            sims = [float(r["similarity"]) for r in retrieved if "similarity" in r]
            top1_sim = max(sims) if sims else 0.0

            if top1_sim < min_sim:
                is_sufficient = False

            relevant_chunks = [r for r in valid_evidence if r.get("source_id")]
            if intent == "FACTUAL" and len(relevant_chunks) < settings.MIN_RELEVANT_CHUNKS:
                is_sufficient = False

    return is_sufficient, valid_evidence if valid_evidence else retrieved, search_query, intent
