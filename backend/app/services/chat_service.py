import asyncio
import base64
from datetime import datetime
import json
import logging
import re
from typing import AsyncGenerator, Optional
import uuid
from uuid import UUID

from fastapi import BackgroundTasks
import httpx
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..agent.gemini import (
    build_chat_messages,
    get_student_mastery_context,
    stream_rag_response_sse,
)
from ..core.config import settings
from ..core.llm import TaskType, model_manager
from ..core.profiler import LatencyProfiler
from ..core.prompts import META_SYSTEM_PROMPT, TUTOR_MODE_PROMPTS
from ..db.models import (
    Conversation,
    ConversationMemory,
    ConversationMessage,
    SubjectTutorConversation,
    SubjectTutorMessage,
)
from ..db.session import async_session_factory
from ..knowledge.conversation_memory import maybe_trigger_memory_update
from ..knowledge.intent_classifier import classify_intent
from ..schemas.chat import ChatRequest
from ..schemas.chat_events import SSEEnvelope, SSEEventData
from ..schemas.profile import UserProfileCreate
from ..schemas.profiles import PROFILES, ChatMode
from ..schemas.subject import LearningSessionCreate
from ..api.endpoints.subjects import record_session
from ..api.profile import generate_primary_seed
from .retrieval_service import _build_context_and_check_evidence, build_citation_dict

logger = logging.getLogger(__name__)


async def generate_conversation_title_bg(conv_id: UUID, query: str):
    class TitleResponse(BaseModel):
        title: str = Field(description="Short title (max 4-5 words)")

    try:
        title_res = await model_manager.generate_structured(
            task_type=TaskType.EXTRACTION,
            schema=TitleResponse,
            prompt=f"Generate a very short, concise title (max 4-5 words) summarizing this first message: '{query}'",
            system_instruction="You are a title generator. Be brief, use Russian if message is Russian.",
        )
        new_title = title_res.title.strip()

        async with async_session_factory() as session:
            conv = await session.get(Conversation, conv_id)
            if conv:
                conv.title = new_title
                await session.commit()
    except Exception as e:
        logger.error(f"Failed to generate title in background: {e}")


async def generate_meta_answer(query: str) -> str:
    query_lower = query.lower().strip()
    greetings = ["привет", "здравствуй", "приветствую", "здравствуйте", "hi", "hello"]
    if query_lower in greetings:
        return (
            "Привет! Я PKA (Personal Knowledge Agent) — твой персональный AI-ассистент "
            "с доступом к твоей базе знаний. Чем могу помочь?"
        )

    payload = {
        "model": settings.OLLAMA_QA_MODEL,
        "messages": [
            {"role": "system", "content": META_SYSTEM_PROMPT},
            {"role": "user", "content": query},
        ],
        "stream": False,
        "options": {"temperature": 0.2},
    }

    custom_timeout = httpx.Timeout(300.0, connect=10.0)

    async with httpx.AsyncClient(timeout=custom_timeout) as client:
        resp = await client.post(f"{settings.OLLAMA_BASE_URL}/api/chat", json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["message"]["content"]


async def get_thread_context(
    db: AsyncSession,
    conversation_id: UUID,
    limit_messages: int = 6,
    is_tutor: bool = False,
):
    if is_tutor:
        msg_stmt = (
            select(SubjectTutorMessage)
            .where(SubjectTutorMessage.conversation_id == conversation_id)
            .order_by(SubjectTutorMessage.sequence_num.desc())
            .limit(limit_messages)
        )
        res = await db.execute(msg_stmt)
        recent_messages = list(reversed(res.scalars().all()))
        thread_state_str = ""
    else:
        mem_stmt = select(ConversationMemory).where(
            ConversationMemory.conversation_id == conversation_id
        )
        res = await db.execute(mem_stmt)
        mem = res.scalar_one_or_none()

        thread_state_parts = []
        if mem and getattr(mem, "problem", None):
            thread_state_parts.append(f"Проблема: {mem.problem}")
        if mem and getattr(mem, "decision_summary", None):
            thread_state_parts.append(f"Принятое решение: {mem.decision_summary}")
        if mem and getattr(mem, "attempts", None):
            attempts_str = (
                ", ".join(mem.attempts) if isinstance(mem.attempts, list) else mem.attempts
            )
            thread_state_parts.append(f"Попытки: {attempts_str}")

        thread_state_str = "\n".join(thread_state_parts)

        msg_stmt = (
            select(ConversationMessage)
            .where(ConversationMessage.conversation_id == conversation_id)
            .order_by(ConversationMessage.sequence_num.desc())
            .limit(limit_messages)
        )
        res = await db.execute(msg_stmt)
        recent_messages = list(reversed(res.scalars().all()))

    history_list = [{"role": m.role, "content": m.content} for m in recent_messages]
    return thread_state_str, history_list


async def append_user_message(
    db: AsyncSession,
    conversation_id: UUID,
    user_query: str,
    image_base64: Optional[str] = None,
    image_mime_type: Optional[str] = None,
    is_tutor: bool = False,
):
    if is_tutor:
        seq_stmt = select(func.coalesce(func.max(SubjectTutorMessage.sequence_num), 0)).where(
            SubjectTutorMessage.conversation_id == conversation_id
        )
        res = await db.execute(seq_stmt)
        current_max_seq = res.scalar_one()

        user_msg = SubjectTutorMessage(
            conversation_id=conversation_id,
            role="user",
            content=user_query,
            sequence_num=current_max_seq + 1,
        )
        db.add(user_msg)
        await db.commit()
    else:
        seq_stmt = select(func.coalesce(func.max(ConversationMessage.sequence_num), 0)).where(
            ConversationMessage.conversation_id == conversation_id
        )
        res = await db.execute(seq_stmt)
        current_max_seq = res.scalar_one()

        meta_info = {}
        if image_base64:
            meta_info["image_base64"] = image_base64
            meta_info["image_mime_type"] = image_mime_type or "image/png"

        user_msg = ConversationMessage(
            conversation_id=conversation_id,
            role="user",
            content=user_query,
            sequence_num=current_max_seq + 1,
            timestamp=datetime.utcnow(),
            meta_info=meta_info,
        )
        db.add(user_msg)
        await db.commit()


async def append_assistant_message(
    db: AsyncSession,
    conversation_id: UUID,
    assistant_answer: str,
    metrics: dict,
    is_tutor: bool = False,
):
    if is_tutor:
        seq_stmt = select(func.coalesce(func.max(SubjectTutorMessage.sequence_num), 0)).where(
            SubjectTutorMessage.conversation_id == conversation_id
        )
        res = await db.execute(seq_stmt)
        current_max_seq = res.scalar_one()

        assistant_msg = SubjectTutorMessage(
            conversation_id=conversation_id,
            role="assistant",
            content=assistant_answer,
            sequence_num=current_max_seq + 1,
        )
        db.add(assistant_msg)
        await db.commit()
    else:
        seq_stmt = select(func.coalesce(func.max(ConversationMessage.sequence_num), 0)).where(
            ConversationMessage.conversation_id == conversation_id
        )
        res = await db.execute(seq_stmt)
        current_max_seq = res.scalar_one()

        assistant_msg = ConversationMessage(
            conversation_id=conversation_id,
            role="assistant",
            content=assistant_answer,
            sequence_num=current_max_seq + 1,
            timestamp=datetime.utcnow(),
            meta_info={"model": settings.OLLAMA_QA_MODEL, "context_used": metrics},
        )
        db.add(assistant_msg)
        await db.commit()


async def stream_chat(
    payload: ChatRequest,
    db: AsyncSession,
    background_tasks: BackgroundTasks,
) -> AsyncGenerator[str, None]:
    profiler = LatencyProfiler(
        trace_id=str(payload.conversation_id) if payload.conversation_id else "adhoc"
    )
    full_answer = ""
    metrics = {"l1_count": 0, "l2_count": 0, "l3_count": 0, "intent": "UNKNOWN"}
    conv = None
    telemetry_data = {}
    try:
        thread_state = ""
        profile = PROFILES.get(payload.chat_mode, PROFILES[ChatMode.VAULT])
        is_tutor = (
            payload.chat_mode == ChatMode.LEARNING and payload.learning_context is not None
        )

        if is_tutor:
            subject_id = payload.learning_context.get("subject_id")
            topic_id = payload.learning_context.get("topic_id", "general")
            chat_mode_val = payload.learning_context.get("mode", "mentor")

            conv_stmt = select(SubjectTutorConversation).where(
                SubjectTutorConversation.subject_id == subject_id,
                SubjectTutorConversation.topic_id == topic_id,
                SubjectTutorConversation.chat_mode == chat_mode_val,
            )
            conv_res = await db.execute(conv_stmt)
            conv = conv_res.scalar_one_or_none()
            if not conv:
                conv = SubjectTutorConversation(
                    subject_id=subject_id,
                    topic_id=topic_id,
                    chat_mode=chat_mode_val,
                )
                db.add(conv)
                await db.commit()
                await db.refresh(conv)
            payload.conversation_id = conv.id
        else:
            if not payload.conversation_id:
                fallback_title = " ".join(payload.query.split()[:4]) or "Новый диалог"
                conv = Conversation(title=fallback_title + "...")
                db.add(conv)
                await db.commit()
                await db.refresh(conv)
                payload.conversation_id = conv.id
            else:
                conv = await db.get(Conversation, payload.conversation_id)

        if conv:
            thread_state, history = await get_thread_context(
                db, payload.conversation_id, is_tutor=is_tutor
            )
            payload.history = history
            await append_user_message(
                db,
                conv.id,
                payload.query,
                payload.image_base64,
                payload.image_mime_type,
                is_tutor=is_tutor,
            )

            yield SSEEnvelope(
                event="metadata",
                data=SSEEventData(output={"conversation_id": str(conv.id)}),
            ).to_sse()

        if payload.image_base64 and not payload.query.strip():
            payload.query = "Пожалуйста, проанализируй и подробно опиши прикрепленное изображение."

        profiler.start_stage("01_routing")
        intent = await classify_intent(payload.query)

        if intent == "META" and not payload.image_base64:
            profiler.start_stage("06_llm_generation")
            answer = await generate_meta_answer(payload.query)
            telemetry_data = profiler.end()

            yield SSEEnvelope(event="token", data=SSEEventData(text_chunk=answer)).to_sse()
            yield SSEEnvelope(event="telemetry", data=SSEEventData(output=telemetry_data)).to_sse()

            if conv:
                metrics["intent"] = "META"
                metrics["telemetry"] = telemetry_data
                full_answer = answer

            yield SSEEnvelope(event="done", data=SSEEventData()).to_sse()
            return

        if payload.image_base64:
            is_sufficient = True
            retrieved = []
            search_query = payload.query
            intent = "MULTIMODAL"
        else:
            is_sufficient, retrieved, search_query, intent = (
                await _build_context_and_check_evidence(
                    db, payload, intent, profiler, profile
                )
            )

        yield SSEEnvelope(
            event="retrieval",
            data=SSEEventData(
                output={
                    "status": "searching",
                    "query": search_query,
                    "intent": intent,
                }
            ),
        ).to_sse()

        if not is_sufficient and not payload.image_base64:
            if intent in ("CODE", "MATH", "GENERAL_KNOWLEDGE", "GENERAL", "DEFAULT"):
                retrieved.insert(
                    0,
                    {
                        "chunk_id": str(uuid.uuid4()),
                        "source_id": str(uuid.uuid4()),
                        "text_content": (
                            "[SYSTEM INSTRUCTION]\nРазрешено использовать общие знания, так как запрос носит общий характер. "
                            "Обязательно добавь бейдж: [Общий ответ вне базы знаний]. ТЫ ИМЕЕШЬ ПРАВО "
                            "писать, анализировать и выполнять любой код по запросу пользователя."
                        ),
                        "score": 1.0,
                        "rrf_score": 1.0,
                    },
                )
            else:
                retrieved.insert(
                    0,
                    {
                        "chunk_id": str(uuid.uuid4()),
                        "source_id": str(uuid.uuid4()),
                        "text_content": (
                            "[SYSTEM INSTRUCTION]\nВ локальной базе знаний пользователя НЕТ информации по этой теме. "
                            "Кратко и честно отметь это, прежде чем пытаться отвечать из мировых знаний."
                        ),
                        "score": 1.0,
                        "rrf_score": 1.0,
                    },
                )

        if thread_state and not payload.history:
            retrieved.insert(
                0,
                {
                    "chunk_id": str(uuid.uuid4()),
                    "source_id": str(uuid.uuid4()),
                    "text_content": f"=== [CONVERSATION THREAD SUMMARY] ===\n{thread_state}",
                    "score": 1.0,
                    "rrf_score": 1.0,
                },
            )

        citations_data = [
            build_citation_dict(item)
            for item in retrieved
            if not item["text_content"].startswith("[CONVERSATION LOCAL STATE]")
        ]
        yield SSEEnvelope(
            event="citations", data=SSEEventData(output=citations_data)
        ).to_sse()

        profile_text = ""
        profile_res = await db.execute(
            select(text("*"))
            .select_from(text("user_profiles"))
            .order_by(text("created_at DESC"))
            .limit(1)
        )
        row = profile_res.fetchone()
        if row:
            try:
                prof_schema = UserProfileCreate(
                    role=row.role,
                    stack=row.stack if isinstance(row.stack, list) else json.loads(row.stack),
                    invariants=row.invariants,
                    learning_style=row.learning_style,
                    projects=row.projects,
                )
                profile_text = generate_primary_seed(prof_schema)

                try:
                    from ..api.endpoints.kinetics import get_daily_telemetry_summary
                    telemetry = await get_daily_telemetry_summary(db, row.id)
                    profile_text += "\n\n=== ТЕКУЩЕЕ ФИЗИЧЕСКОЕ СОСТОЯНИЕ (KINETICS ТЕЛЕМЕТРИЯ) ===\n"
                    profile_text += f"- Сон: {telemetry['sleep_hours']} ч | Утомление (ЦНС): {telemetry['fatigue_score']}/10\n"
                    profile_text += f"- Питание: {telemetry['calories_in']} ккал (Дефицит: {telemetry['deficit']} ккал) | Белок: {telemetry['protein_g']}г\n"
                    profile_text += f"- Тренировочный статус: {telemetry['workout_split']} — {telemetry['workout_progress']} ({telemetry['workout_status']})\n"
                    profile_text += "Учитывай текущее физическое состояние, утомление и статус восстановления при любых ответах.\n"
                except Exception as e:
                    logger.error(f"Error fetching kinetics telemetry: {e}")

            except Exception as e:
                logger.error(f"Error parsing profile: {e}")

        if payload.learning_context and payload.learning_context.get("subject_id"):
            try:
                mastery_ctx = await get_student_mastery_context(
                    payload.learning_context["subject_id"], db
                )
                if mastery_ctx:
                    profile_text += f"\n\n{mastery_ctx}"
            except Exception as e:
                logger.warning(f"Failed to fetch mastery context for stream: {e}")

        if (
            payload.learning_context
            and payload.learning_context.get("mode")
            and payload.chat_mode == ChatMode.LEARNING
        ):
            tutor_mode = payload.learning_context.get("mode")
            mode_prompt = TUTOR_MODE_PROMPTS.get(tutor_mode, "")
            if mode_prompt:
                profile_text = mode_prompt + "\n\n" + profile_text

        profiler.start_stage("06_llm_first_token_wait")
        if payload.image_base64:
            image_bytes = base64.b64decode(payload.image_base64)

            context_blocks = []
            if profile_text:
                context_blocks.append(f"ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ:\n{profile_text}")
            if retrieved:
                context_blocks.extend([item.get("text_content", "") for item in retrieved])
            context_text = "\n---\n".join(context_blocks)

            sys_prompt = (
                "Ты мультимодальный AI-ассистент. Твоя задача детально описывать "
                "и анализировать изображения. Отвечай на вопросы пользователя с учетом истории диалога."
            )

            messages = build_chat_messages(
                sys_prompt,
                payload.history,
                payload.query,
                context_text,
                images=[payload.image_base64],
            )

            first_token = True
            async for token in model_manager.stream_vision(
                messages, image_bytes, payload.image_mime_type or "image/png"
            ):
                if first_token:
                    profiler.mark_first_token()
                    profiler.start_stage("07_llm_streaming")
                    first_token = False
                full_answer += token
                yield SSEEnvelope(event="token", data=SSEEventData(text_chunk=token)).to_sse()

            telemetry_data = profiler.end()
            yield SSEEnvelope(
                event="telemetry", data=SSEEventData(output=telemetry_data)
            ).to_sse()
        else:
            capability_val = profile.preferred_capability.value
            target_model = settings.CAPABILITY_TO_MODEL.get(
                capability_val, settings.OLLAMA_QA_MODEL
            )
            if payload.chat_mode == ChatMode.LEARNING:
                chosen_tutor_mode = (
                    payload.learning_context.get("mode", "mentor")
                    if payload.learning_context
                    else "mentor"
                )
                active_mode = f"learning_tutor_{chosen_tutor_mode}"
            else:
                active_mode = payload.mode

            first_token = True
            async for envelope in stream_rag_response_sse(
                payload.query,
                retrieved,
                user_profile=profile_text,
                mode=active_mode,
                history=payload.history,
                target_model=target_model,
                role_preset=payload.role_preset,
            ):
                if first_token and envelope.event == "token":
                    profiler.mark_first_token()
                    profiler.start_stage("07_llm_streaming")
                    first_token = False

                if envelope.event == "token" and envelope.data.text_chunk:
                    full_answer += envelope.data.text_chunk

                yield envelope.to_sse()

            telemetry_data = profiler.end()
            yield SSEEnvelope(
                event="telemetry", data=SSEEventData(output=telemetry_data)
            ).to_sse()

        if conv:
            if is_tutor:
                msg_count = await db.scalar(
                    select(func.count(SubjectTutorMessage.id)).where(
                        SubjectTutorMessage.conversation_id == conv.id
                    )
                )
            else:
                msg_count = await db.scalar(
                    select(func.count(ConversationMessage.id)).where(
                        ConversationMessage.conversation_id == conv.id
                    )
                )

            if msg_count == 1 and not is_tutor:
                background_tasks.add_task(
                    generate_conversation_title_bg, conv.id, payload.query
                )

            metrics.update(
                {
                    "l1_count": int(
                        len([r for r in retrieved if r["text_content"].startswith("[L1")])
                    ),
                    "l2_count": int(
                        len([r for r in retrieved if r["text_content"].startswith("=== [L2")])
                    ),
                    "l3_count": int(
                        len([r for r in retrieved if r["text_content"].startswith("=== [L3")])
                    ),
                    "l4_count": int(
                        len([r for r in retrieved if r["text_content"].startswith("=== [L4")])
                    ),
                    "graph_hops": int(
                        len(
                            [
                                r
                                for r in retrieved
                                if r["text_content"].startswith("=== [GRAPH")
                            ]
                        )
                    ),
                    "intent": str(intent),
                    "telemetry": telemetry_data,
                }
            )

    except asyncio.CancelledError:
        logger.warning("Stream cancelled by client.")
        raise
    except Exception as exc:
        logger.exception("RAG streaming pipeline failed")
        yield SSEEnvelope(event="error", data=SSEEventData(error=str(exc))).to_sse()
    finally:
        if conv and full_answer:
            try:
                await append_assistant_message(
                    db, conv.id, full_answer, metrics, is_tutor=is_tutor
                )
                if not is_tutor and hasattr(conv, "ended_at"):
                    conv.ended_at = datetime.utcnow()
                await db.commit()
                background_tasks.add_task(maybe_trigger_memory_update, conv.id)

                if (
                    is_tutor
                    and hasattr(payload, "chat_mode")
                    and getattr(payload.chat_mode, "value", str(payload.chat_mode)) == "examiner"
                    and payload.learning_context
                ):
                    score_match = re.search(
                        r"\[VERDICT:\s*SCORE\s*=\s*(\d{1,3})\]",
                        full_answer,
                        re.IGNORECASE,
                    )
                    if score_match:
                        score = float(score_match.group(1))
                        if 0 <= score <= 100:
                            subject_id_str = payload.learning_context.get("subject_id")
                            topic_id_str = payload.learning_context.get(
                                "topic_id", "general"
                            )

                            if subject_id_str:
                                try:
                                    subj_uuid = UUID(subject_id_str)
                                    session_data = LearningSessionCreate(
                                        subject_id=subj_uuid,
                                        session_type="exam",
                                        topic_name=topic_id_str,
                                        score=score,
                                        failed_concepts=(
                                            [topic_id_str] if score < 70.0 else []
                                        ),
                                    )
                                    async with async_session_factory() as new_db:
                                        await record_session(data=session_data, db=new_db)
                                        await new_db.commit()
                                except Exception as e:
                                    logger.error(
                                        f"Failed to record learning session: {e}"
                                    )
            except Exception as e:
                logger.error(f"Failed to save assistant message on stream close: {e}")
