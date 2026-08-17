"""Chat endpoint — retrieves context and generates a RAG response."""

import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from .deps import get_db
from ..agent.gemini import generate_rag_response, stream_rag_response
from ..knowledge.intent_classifier import classify_intent
from ..knowledge.query_condenser import rewrite_query
from ..knowledge.retrieval import hybrid_search
from ..schemas.chat import ChatRequest, ChatResponse, Citation
from ..core.config import settings
from ..db.models import Pattern, Claim, ClaimRelation

router = APIRouter(prefix="/chat", tags=["Chat"])

async def _build_context_and_check_evidence(db: AsyncSession, payload: ChatRequest):
    # 1. Intent Detection & Query Condensation
    intent = await classify_intent(payload.query)
    is_success, search_query = await rewrite_query(payload.query, payload.history)
    
    # Select Thresholds
    if intent == "ANALYTICAL":
        min_sim = settings.ANALYTICAL_MIN_TOP1_SIMILARITY
        min_rrf = settings.ANALYTICAL_MIN_TOP_K_RELEVANCE_RRF
    else:
        min_sim = settings.FACTUAL_MIN_TOP1_SIMILARITY
        min_rrf = settings.FACTUAL_MIN_TOP_K_RELEVANCE_RRF

    # 2. Retrieve [L1 CHUNK]
    retrieved = await hybrid_search(
        db=db, 
        original_query=payload.query, 
        search_query=search_query, 
        limit=5,
        include_history=False
    )
    for r in retrieved:
        if not r["text_content"].startswith("[L1 CHUNK]"):
            r["text_content"] = f"[L1 CHUNK] {r['text_content']}"
    
    # 3. Context Builder (L2, L3, L4)
    if intent == "ANALYTICAL":
        # L2 Claims (Active)
        chunk_ids = [r["chunk_id"] for r in retrieved]
        if chunk_ids:
            claims = (await db.execute(select(Claim).where(Claim.chunk_id.in_(chunk_ids), Claim.is_active == True).limit(5))).scalars().all()
            for c in claims:
                retrieved.append({
                    "chunk_id": str(c.id),
                    "source_id": str(c.source_id),
                    "text_content": f"[L2 УТВЕРЖДЕНИЕ] {c.content}",
                    "score": 1.0,
                    "rrf_score": 1.0,
                    "is_pattern": True
                })
            
            # L4 Temporal/Conflict (ClaimRelations)
            claim_ids = [c.id for c in claims]
            if claim_ids:
                relations = (await db.execute(select(ClaimRelation).where(
                    (ClaimRelation.source_claim_id.in_(claim_ids)) | (ClaimRelation.target_claim_id.in_(claim_ids))
                ).limit(5))).scalars().all()
                for r in relations:
                    retrieved.append({
                        "chunk_id": str(r.id),
                        "source_id": str(r.source_claim_id),
                        "text_content": f"[L4 СВЯЗЬ: {r.relation_type}] {r.evidence_summary}",
                        "score": 1.0,
                        "rrf_score": 1.0,
                        "is_pattern": True
                    })

        # L3 Patterns
        patterns = (await db.execute(select(Pattern).where(Pattern.confidence >= 0.70).order_by(Pattern.created_at.desc()).limit(3))).scalars().all()
        for p in patterns:
            # check if evidence_claim_ids is not empty (as per spec)
            if p.evidence_claim_ids:
                retrieved.append({
                    "chunk_id": str(p.id),
                    "source_id": str(p.id),
                    "text_content": f"[L3 ПАТТЕРН] {p.title}: {p.description}\nОбоснование: {p.evidence_summary}",
                    "score": 1.0,
                    "rrf_score": 1.0,
                    "is_pattern": True
                })

    # 4. Evidence Gate
    def check_evidence(items: list) -> bool:
        if not items:
            return False
        if any(r.get("is_pattern") for r in items):
            return True # Bypass for analytical/patterns
        top1_sim = max((float(r.get("similarity", 0.0)) for r in items), default=0.0)
        if top1_sim < min_sim:
            return False
        relevant_chunks = [r for r in items if float(r.get("rrf_score", 0.0)) >= min_rrf]
        if len(relevant_chunks) < settings.MIN_RELEVANT_CHUNKS:
            return False
        return True

    is_sufficient = check_evidence(retrieved)
    return is_sufficient, retrieved, search_query, intent

@router.post("/", response_model=ChatResponse)
@router.post("", response_model=ChatResponse, include_in_schema=False)
async def chat_endpoint(payload: ChatRequest, db: AsyncSession = Depends(get_db)):
    try:
        is_sufficient, retrieved, search_query, intent = await _build_context_and_check_evidence(db, payload)
        
        if not is_sufficient:
            return ChatResponse(
                answer="INSUFFICIENT_DATA: Недостаточно данных в вашей базе знаний.",
                citations=[]
            )

        answer = await generate_rag_response(query=payload.query, retrieved_chunks=retrieved)

        citations = [
            Citation(
                chunk_id=str(item["chunk_id"]),
                source_id=str(item["source_id"]),
                text_snippet=item["text_content"][:150] + "..." if len(item["text_content"]) > 150 else item["text_content"],
                score=round(float(item.get("rrf_score", item.get("score", 0.0))), 4),
            )
            for item in retrieved
        ]

        return ChatResponse(answer=answer, citations=citations)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stream")
async def chat_stream_endpoint(payload: ChatRequest, db: AsyncSession = Depends(get_db)):
    async def event_generator():
        try:
            is_sufficient, retrieved, search_query, intent = await _build_context_and_check_evidence(db, payload)
            
            yield f"event: retrieval\ndata: {json.dumps({'status': 'searching', 'query': search_query, 'intent': intent}, ensure_ascii=False)}\n\n"

            if not is_sufficient:
                yield f"event: message\ndata: {json.dumps({'text': 'INSUFFICIENT_DATA: Недостаточно данных в вашей базе знаний.'}, ensure_ascii=False)}\n\n"
                yield "event: done\ndata: [DONE]\n\n"
                return

            citations_data = [
                {
                    "chunk_id": str(item["chunk_id"]),
                    "source_id": str(item["source_id"]),
                    "text_snippet": item["text_content"][:150] + "..." if len(item["text_content"]) > 150 else item["text_content"],
                    "score": round(float(item.get("rrf_score", item.get("score", 0.0))), 4),
                }
                for item in retrieved
            ]
            yield f"event: citations\ndata: {json.dumps(citations_data, ensure_ascii=False)}\n\n"

            async for token in stream_rag_response(payload.query, retrieved):
                yield f"event: message\ndata: {json.dumps({'text': token}, ensure_ascii=False)}\n\n"

            yield "event: done\ndata: [DONE]\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
    )
