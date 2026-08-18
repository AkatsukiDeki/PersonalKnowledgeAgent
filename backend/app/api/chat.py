import json
import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import logging

logger = logging.getLogger(__name__)

from .deps import get_db
from ..agent.gemini import generate_rag_response, stream_rag_response
from ..knowledge.intent_classifier import classify_intent
from ..knowledge.query_condenser import rewrite_query
from ..knowledge.retrieval import hybrid_search
from ..schemas.chat import ChatRequest, ChatResponse, Citation
from ..core.config import settings
from ..db.models import Pattern, Claim, ClaimRelation, Conversation, ConversationMessage, ConversationMemory, Decision, TimelineEvent
from sqlalchemy.orm import selectinload
from ..knowledge.conversation_memory import maybe_trigger_memory_update
from datetime import datetime
from uuid import UUID
from fastapi import BackgroundTasks

import httpx

router = APIRouter(prefix="/chat", tags=["Chat"])

META_SYSTEM_PROMPT = """Ты — PKA (Personal Knowledge Agent), персональная система управления знаниями.

Твоя техническая архитектура и возможности:
1. Архитектура памяти: Двухуровневая система.
   - Локальная память треда: каждый чат изолирован по контексту текущего диалога и автоматически суммаризируется в ConversationMemory (Summary, Active Decisions, Open Questions).
   - Глобальная память (L1–L4): общая база знаний для всех чатов (L1 Чанки источников, L2 Долгосрочные факты и решения со скорингом, L3 Кросс-доменные паттерны, L4 Временная эволюция).
2. Взаимосвязь чатов: Ветки диалогов изолированы друг от друга в плане истории сообщений, но черпают и обогащают единую глобальную память знаний.
3. Поиск и безопасность: Гибридный RAG (векторный BGE-M3 + BM25 с RRF-ранжированием) с механизмом Evidence Gate для защиты от галлюцинаций.

Отвечай кратко, четко, структурировано и строго о себе как о системе PKA."""

async def generate_meta_answer(query: str) -> str:
    payload = {
        "model": settings.OLLAMA_QA_MODEL,
        "messages": [
            {"role": "system", "content": META_SYSTEM_PROMPT},
            {"role": "user", "content": query}
        ],
        "stream": False,
        "options": {"temperature": 0.2}
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(f"{settings.OLLAMA_BASE_URL}/api/chat", json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["message"]["content"]


async def get_thread_context(db: AsyncSession, conversation_id: UUID, limit_messages: int = 6):
    mem_stmt = select(ConversationMemory).where(ConversationMemory.conversation_id == conversation_id)
    res = await db.execute(mem_stmt)
    mem = res.scalar_one_or_none()
    
    thread_state_parts = []
    if mem and mem.summary:
        thread_state_parts.append(f"Суть ветки: {mem.summary}")
    if mem and mem.active_decisions:
        thread_state_parts.append(f"Принятые решения в ветке: {', '.join(mem.active_decisions)}")
    if mem and mem.open_questions:
        thread_state_parts.append(f"Открытые вопросы: {', '.join(mem.open_questions)}")
    
    thread_state_str = "\n".join(thread_state_parts)

    msg_stmt = (
        select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.created_at.desc())
        .limit(limit_messages)
    )
    res = await db.execute(msg_stmt)
    recent_messages = list(reversed(res.scalars().all()))
    
    history_list = [{"role": m.role, "content": m.content} for m in recent_messages]
    return thread_state_str, history_list

async def _build_context_and_check_evidence(db: AsyncSession, payload: ChatRequest, intent: str):
    # 1. Intent Detection & Query Condensation
    is_success, search_query = await rewrite_query(payload.query, payload.history)
    
    # Select Thresholds
    if intent in ("ANALYTICAL", "TEMPORAL"):
        min_sim = settings.ANALYTICAL_MIN_TOP1_SIMILARITY
        min_rrf = settings.ANALYTICAL_MIN_TOP_K_RELEVANCE_RRF
    else:
        min_sim = settings.FACTUAL_MIN_TOP1_SIMILARITY
        min_rrf = settings.FACTUAL_MIN_TOP_K_RELEVANCE_RRF

    # 2. Retrieve [L1 CHUNK]
    l1_chunks = await hybrid_search(
        db=db, 
        original_query=payload.query, 
        search_query=search_query, 
        limit=5,
        include_history=False
    )
    for r in l1_chunks:
        if not r["text_content"].startswith("[L1 CHUNK]"):
            r["text_content"] = f"[L1 CHUNK] {r['text_content']}"
    
    # Context Layers
    l2_claims = []
    l3_patterns = []
    l4_timeline = []
    graph_context = []
    
    # ML Enrichment Searches (Decision & Memory)
    from app.knowledge.embeddings.factory import get_embedding_provider
    provider = get_embedding_provider()
    query_emb = None
    try:
        emb_res = await provider.embed_query(search_query)
        query_emb = emb_res
    except Exception as e:
        logger.warning(f"Failed to embed query for ML Enrichment: {e}")
        
    if query_emb and len(query_emb) == settings.EMBEDDING_DIMENSION:
        # 1. Search Decisions
        dec_stmt = (
            select(Decision, Decision.embedding.cosine_distance(query_emb).label("distance"))
            .where(Decision.embedding.is_not(None))
            .order_by(Decision.embedding.cosine_distance(query_emb))
            .limit(5)
        )
        dec_res = await db.execute(dec_stmt)
        for dec, dist in dec_res.all():
            sim = 1.0 - float(dist)
            if sim < 0.45: continue
            
            # Temporal Resolution Logic
            score_multiplier = 1.5 if dec.status == "active" else 0.1
            final_sim = sim * score_multiplier
            
            l2_claims.append({
                "chunk_id": str(dec.id),
                "source_id": str(dec.memory_id),
                "text_content": f"=== [DECISION ({dec.status})] ===\nDecision: {dec.decision}\nRationale: {dec.rationale}\nAlternatives: {', '.join(dec.alternatives)}",
                "similarity": final_sim,
                "rrf_score": final_sim,
                "is_pattern": True
            })
            
        # 2. Search Conversation Memories
        mem_stmt = (
            select(ConversationMemory, ConversationMemory.embedding.cosine_distance(query_emb).label("distance"))
            .where(ConversationMemory.embedding.is_not(None))
            .order_by(ConversationMemory.embedding.cosine_distance(query_emb))
            .limit(3)
        )
        mem_res = await db.execute(mem_stmt)
        for mem, dist in mem_res.all():
            sim = 1.0 - float(dist)
            if sim < 0.3: continue
            l2_claims.append({
                "chunk_id": str(mem.id),
                "source_id": str(mem.conversation_id),
                "text_content": f"=== [CONVERSATION MEMORY] ===\nProblem: {mem.problem}\nAttempts: {', '.join(mem.attempts)}\nOutcome: {mem.outcome}",
                "similarity": sim,
                "rrf_score": sim,
                "is_pattern": True
            })
    
    # 3. Context Builder (L2, L3, L4, Graph)
    chunk_ids = [r["chunk_id"] for r in l1_chunks]
    
    if intent in ("ANALYTICAL", "TEMPORAL", "FACTUAL") and chunk_ids:
        # L2 Claims (Active)
        claims = (await db.execute(select(Claim).where(Claim.chunk_id.in_(chunk_ids), Claim.is_active == True).limit(5))).scalars().all()
        claim_ids = [c.id for c in claims]
        for c in claims:
            l2_claims.append({
                "chunk_id": str(c.id),
                "source_id": str(c.source_id),
                "text_content": f"=== [L2 УТВЕРЖДЕНИЕ] ===\n{c.content}",
                "score": 1.0,
                "rrf_score": 1.0,
                "is_pattern": True
            })
            
        # L4 Temporal/Conflict (ClaimRelations)
        if claim_ids:
            relations = (await db.execute(select(ClaimRelation).where(
                (ClaimRelation.source_claim_id.in_(claim_ids)) | (ClaimRelation.target_claim_id.in_(claim_ids))
            ).limit(5))).scalars().all()
            for r in relations:
                l4_timeline.append({
                    "chunk_id": str(r.id),
                    "source_id": str(r.source_claim_id),
                    "text_content": f"=== [L4 СВЯЗЬ: {r.relation_type}] ===\n{r.evidence_summary}",
                    "score": 1.0,
                    "rrf_score": 1.0,
                    "is_pattern": True
                })

        # Graph Traversal (Multi-Hop)
        if claim_ids:
            from ..knowledge.graph_traversal import GraphTraversalEngine
            traversal_engine = GraphTraversalEngine(db)
            graph_context_text = await traversal_engine.traverse_from_claims(claim_ids, max_depth=2, limit_neighbors=5)
            if graph_context_text:
                graph_context.append({
                    "chunk_id": str(uuid.uuid4()),
                    "source_id": str(uuid.uuid4()),
                    "text_content": f"=== [GRAPH CONTEXT] ===\n{graph_context_text}",
                    "score": 1.0,
                    "rrf_score": 1.0,
                    "is_pattern": True
                })

        # Timeline Evolution (L4)
        if intent in ("TEMPORAL", "ANALYTICAL") and claim_ids:
            timeline_events = (await db.execute(
                select(TimelineEvent)
                .options(selectinload(TimelineEvent.old_claim), selectinload(TimelineEvent.new_claim))
                .where(
                    (TimelineEvent.old_claim_id.in_(claim_ids)) | 
                    (TimelineEvent.new_claim_id.in_(claim_ids))
                ).order_by(TimelineEvent.timestamp.desc()).limit(5)
            )).scalars().all()
            
            if timeline_events:
                timeline_text_parts = []
                for ev in timeline_events:
                    old_date = ev.old_claim.valid_from.strftime("%Y-%m-%d") if (ev.old_claim and ev.old_claim.valid_from) else "Ранее"
                    new_date = ev.new_claim.valid_from.strftime("%Y-%m-%d") if (ev.new_claim and ev.new_claim.valid_from) else ev.timestamp.strftime("%Y-%m-%d")
                    timeline_text_parts.append(
                        f"* [{old_date} -> {new_date}] {ev.title}: \"{ev.description}\" (supersedes: Claim #{ev.old_claim_id} -> Claim #{ev.new_claim_id})"
                    )
                
                timeline_context = "=== [L4 TIMELINE EVOLUTION] ===\n" + "\n".join(timeline_text_parts)
                l4_timeline.append({
                    "chunk_id": str(uuid.uuid4()),
                    "source_id": str(uuid.uuid4()),
                    "text_content": timeline_context,
                    "score": 1.0,
                    "rrf_score": 1.0,
                    "is_pattern": True
                })

    # L3 Patterns
    if intent in ("ANALYTICAL", "TEMPORAL", "FACTUAL"):
        patterns = (await db.execute(select(Pattern).where(Pattern.confidence >= 0.70, Pattern.status == 'accepted').order_by(Pattern.created_at.desc()).limit(3))).scalars().all()
        for p in patterns:
            if p.evidence_claim_ids:
                l3_patterns.append({
                    "chunk_id": str(p.id),
                    "source_id": str(p.id),
                    "text_content": f"=== [L3 ПАТТЕРНЫ] ===\n{p.title}: {p.description}\nОбоснование: {p.evidence_summary}",
                    "score": 1.0,
                    "rrf_score": 1.0,
                    "is_pattern": True
                })

    # Combine in strict hierarchy
    retrieved = l3_patterns + l4_timeline + l2_claims + graph_context + l1_chunks
    has_synth_layers = bool(l2_claims or l3_patterns or l4_timeline)

    # 4. Evidence Gate Strict
    # Фильтрация по порогу уверенности
    RELEVANCE_THRESHOLD = 0.45
    
    # We only keep items that explicitly pass similarity, or are structural (graph context)
    # But we MUST have at least one high-similarity source chunk or decision.
    has_high_sim = any(
        float(item.get("similarity", 0.0)) >= RELEVANCE_THRESHOLD 
        for item in retrieved if "similarity" in item
    )
    
    valid_evidence = [
        item for item in retrieved 
        if "similarity" not in item or float(item["similarity"]) >= RELEVANCE_THRESHOLD
    ]

    is_sufficient = True
    if intent not in ("META",):
        if not has_high_sim:
            is_sufficient = False
        else:
            # check the top 1 similarity among those that actually have it
            sims = [float(r["similarity"]) for r in retrieved if "similarity" in r]
            top1_sim = max(sims) if sims else 0.0
            
            if top1_sim < min_sim:
                is_sufficient = False
                
            # For factual, we need enough chunks
            relevant_chunks = [r for r in valid_evidence if r.get("source_id")] # actual chunks
            if intent == "FACTUAL" and len(relevant_chunks) < settings.MIN_RELEVANT_CHUNKS:
                is_sufficient = False

    return is_sufficient, valid_evidence if valid_evidence else retrieved, search_query, intent

@router.post("/", response_model=ChatResponse)
@router.post("", response_model=ChatResponse, include_in_schema=False)
async def chat_endpoint(payload: ChatRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    try:
        conv = None
        thread_state = ""
        if payload.conversation_id:
            conv = await db.get(Conversation, payload.conversation_id)
            if conv:
                thread_state, history = await get_thread_context(db, payload.conversation_id)
                payload.history = history

        intent = await classify_intent(payload.query)

        if intent == "META":
            answer = await generate_meta_answer(payload.query)
            metrics = {"l1_count": 0, "l2_count": 0, "l3_count": 0, "intent": "META"}
            if conv:
                user_msg = Message(conversation_id=conv.id, role="user", content=payload.query)
                assistant_msg = Message(
                    conversation_id=conv.id,
                    role="assistant",
                    content=answer,
                    model=settings.OLLAMA_QA_MODEL,
                    context_used=metrics
                )
                db.add(user_msg)
                db.add(assistant_msg)
                conv.updated_at = datetime.utcnow()
                await db.commit()
                background_tasks.add_task(maybe_trigger_memory_update, conv.id)
            return ChatResponse(answer=answer, citations=[], metrics=metrics)

        is_sufficient, retrieved, search_query, intent = await _build_context_and_check_evidence(db, payload, intent)
        
        if not is_sufficient:
            return ChatResponse(
                answer="INSUFFICIENT_DATA: Недостаточно данных в вашей базе знаний.",
                citations=[]
            )

        if thread_state:
            retrieved.insert(0, {
                "chunk_id": str(uuid.uuid4()),
                "source_id": str(uuid.uuid4()),
                "text_content": f"[CONVERSATION LOCAL STATE]\n{thread_state}",
                "score": 1.0,
                "rrf_score": 1.0
            })

        answer = await generate_rag_response(query=payload.query, retrieved_chunks=retrieved)

        metrics = {
            "l1_count": int(len([r for r in retrieved if r["text_content"].startswith("[L1")])),
            "l2_count": int(len([r for r in retrieved if r["text_content"].startswith("=== [L2")])),
            "l3_count": int(len([r for r in retrieved if r["text_content"].startswith("=== [L3")])),
            "l4_count": int(len([r for r in retrieved if r["text_content"].startswith("=== [L4")])),
            "graph_hops": int(len([r for r in retrieved if r["text_content"].startswith("=== [GRAPH")])),
            "intent": str(intent)
        }

        if conv:
            if conv.title == "Новый диалог":
                # Auto-generate title
                try:
                    from app.core.llm import model_manager, TaskType
                    from pydantic import BaseModel, Field
                    class TitleResponse(BaseModel):
                        title: str = Field(description="Short title (max 4-5 words)")
                    title_res = await model_manager.generate_structured(
                        task_type=TaskType.EXTRACTION,
                        schema=TitleResponse,
                        prompt=f"Generate a very short, concise title (max 4-5 words) summarizing this first message: '{payload.query}'",
                        system_instruction="You are a title generator. Be brief, use Russian if message is Russian."
                    )
                    conv.title = title_res.title.strip()
                except Exception:
                    conv.title = payload.query[:30] + ("..." if len(payload.query) > 30 else "")

            user_msg = Message(conversation_id=conv.id, role="user", content=payload.query)
            assistant_msg = Message(
                conversation_id=conv.id,
                role="assistant",
                content=answer,
                model=settings.OLLAMA_QA_MODEL,
                context_used=metrics
            )
            db.add(user_msg)
            db.add(assistant_msg)
            conv.updated_at = datetime.utcnow()
            await db.commit()
            background_tasks.add_task(maybe_trigger_memory_update, conv.id)

        citations = [
            Citation(
                chunk_id=str(item["chunk_id"]),
                source_id=str(item["source_id"]),
                text_snippet=item["text_content"][:150] + "..." if len(item["text_content"]) > 150 else item["text_content"],
                score=round(float(item.get("rrf_score", item.get("score", 0.0))), 4),
            )
            for item in retrieved if not item["text_content"].startswith("[CONVERSATION LOCAL STATE]")
        ]

        return ChatResponse(answer=answer, citations=citations, metrics=metrics)
    except Exception as e:
        logger.exception("RAG pipeline failed")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stream")
async def chat_stream_endpoint(payload: ChatRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    async def event_generator():
        try:
            conv = None
            thread_state = ""
            if payload.conversation_id:
                conv = await db.get(Conversation, payload.conversation_id)
                if conv:
                    thread_state, history = await get_thread_context(db, payload.conversation_id)
                    payload.history = history

            intent = await classify_intent(payload.query)

            if intent == "META":
                answer = await generate_meta_answer(payload.query)
                yield f"event: message\ndata: {json.dumps({'text': answer}, ensure_ascii=False)}\n\n"
                
                if conv:
                    metrics = {"l1_count": 0, "l2_count": 0, "l3_count": 0, "intent": "META"}
                    user_msg = Message(conversation_id=conv.id, role="user", content=payload.query)
                    assistant_msg = Message(
                        conversation_id=conv.id,
                        role="assistant",
                        content=answer,
                        model=settings.OLLAMA_QA_MODEL,
                        context_used=metrics
                    )
                    db.add(user_msg)
                    db.add(assistant_msg)
                    conv.updated_at = datetime.utcnow()
                    await db.commit()
                    background_tasks.add_task(maybe_trigger_memory_update, conv.id)
                
                yield "event: done\ndata: [DONE]\n\n"
                return

            is_sufficient, retrieved, search_query, intent = await _build_context_and_check_evidence(db, payload, intent)
            
            yield f"event: retrieval\ndata: {json.dumps({'status': 'searching', 'query': search_query, 'intent': intent}, ensure_ascii=False)}\n\n"

            if not is_sufficient:
                yield f"event: message\ndata: {json.dumps({'text': 'INSUFFICIENT_DATA: Недостаточно данных в вашей базе знаний.'}, ensure_ascii=False)}\n\n"
                yield "event: done\ndata: [DONE]\n\n"
                return

            if thread_state:
                retrieved.insert(0, {
                    "chunk_id": str(uuid.uuid4()),
                    "source_id": str(uuid.uuid4()),
                    "text_content": f"[CONVERSATION LOCAL STATE]\n{thread_state}",
                    "score": 1.0,
                    "rrf_score": 1.0
                })

            citations_data = [
                {
                    "chunk_id": str(item["chunk_id"]),
                    "source_id": str(item["source_id"]),
                    "text_snippet": item["text_content"][:150] + "..." if len(item["text_content"]) > 150 else item["text_content"],
                    "score": round(float(item.get("rrf_score", item.get("score", 0.0))), 4),
                }
                for item in retrieved if not item["text_content"].startswith("[CONVERSATION LOCAL STATE]")
            ]
            yield f"event: citations\ndata: {json.dumps(citations_data, ensure_ascii=False)}\n\n"

            full_answer = ""
            async for token in stream_rag_response(payload.query, retrieved):
                full_answer += token
                yield f"event: message\ndata: {json.dumps({'text': token}, ensure_ascii=False)}\n\n"

            if conv:
                if conv.title == "Новый диалог":
                    try:
                        from app.core.llm import model_manager, TaskType
                        from pydantic import BaseModel, Field
                        class TitleResponse(BaseModel):
                            title: str = Field(description="Short title (max 4-5 words)")
                        title_res = await model_manager.generate_structured(
                            task_type=TaskType.EXTRACTION,
                            schema=TitleResponse,
                            prompt=f"Generate a very short, concise title (max 4-5 words) summarizing this first message: '{payload.query}'",
                            system_instruction="You are a title generator. Be brief, use Russian if message is Russian."
                        )
                        conv.title = title_res.title.strip()
                    except Exception:
                        conv.title = payload.query[:30] + ("..." if len(payload.query) > 30 else "")

                metrics = {
                    "l1_count": int(len([r for r in retrieved if r["text_content"].startswith("[L1")])),
                    "l2_count": int(len([r for r in retrieved if r["text_content"].startswith("=== [L2")])),
                    "l3_count": int(len([r for r in retrieved if r["text_content"].startswith("=== [L3")])),
                    "l4_count": int(len([r for r in retrieved if r["text_content"].startswith("=== [L4")])),
                    "graph_hops": int(len([r for r in retrieved if r["text_content"].startswith("=== [GRAPH")])),
                    "intent": str(intent)
                }
                user_msg = Message(conversation_id=conv.id, role="user", content=payload.query)
                assistant_msg = Message(
                    conversation_id=conv.id,
                    role="assistant",
                    content=full_answer,
                    model=settings.OLLAMA_QA_MODEL,
                    context_used=metrics
                )
                db.add(user_msg)
                db.add(assistant_msg)
                conv.updated_at = datetime.utcnow()
                await db.commit()
                background_tasks.add_task(maybe_trigger_memory_update, conv.id)

            yield "event: done\ndata: [DONE]\n\n"
        except Exception as exc:
            logger.exception("RAG streaming pipeline failed")
            yield f"event: error\ndata: {json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
    )
