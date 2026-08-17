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
from ..db.models import Pattern, Claim, ClaimRelation, Conversation, Message, ConversationMemory
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
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
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
        patterns = (await db.execute(select(Pattern).where(Pattern.confidence >= 0.70, Pattern.status == 'accepted').order_by(Pattern.created_at.desc()).limit(3))).scalars().all()
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
        if intent == "META":
            return True
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
            return ChatResponse(answer=answer, citations=[])

        is_sufficient, retrieved, search_query, intent = await _build_context_and_check_evidence(db, payload, intent)
        
        if not is_sufficient:
            return ChatResponse(
                answer="INSUFFICIENT_DATA: Недостаточно данных в вашей базе знаний.",
                citations=[]
            )

        if thread_state:
            retrieved.insert(0, {
                "chunk_id": "thread_state",
                "source_id": "thread_state",
                "text_content": f"[CONVERSATION LOCAL STATE]\n{thread_state}",
                "score": 1.0,
                "rrf_score": 1.0
            })

        answer = await generate_rag_response(query=payload.query, retrieved_chunks=retrieved)

        metrics = {
            "l1_count": len([r for r in retrieved if r["text_content"].startswith("[L1")]),
            "l2_count": len([r for r in retrieved if r["text_content"].startswith("[L2")]),
            "l3_count": len([r for r in retrieved if r["text_content"].startswith("[L3")])
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
            for item in retrieved if str(item["chunk_id"]) != "thread_state"
        ]

        return ChatResponse(answer=answer, citations=citations)
    except Exception as e:
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
                    "chunk_id": "thread_state",
                    "source_id": "thread_state",
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
                for item in retrieved if str(item["chunk_id"]) != "thread_state"
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
                    "l1_count": len([r for r in retrieved if r["text_content"].startswith("[L1")]),
                    "l2_count": len([r for r in retrieved if r["text_content"].startswith("[L2")]),
                    "l3_count": len([r for r in retrieved if r["text_content"].startswith("[L3")])
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
            yield f"event: error\ndata: {json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
    )
