import json
import logging
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.dialects.postgresql import insert
from app.db.session import async_session_factory
from app.db.models import ConversationMessage, ConversationMemory
from app.core.config import settings
import httpx

logger = logging.getLogger("conversation_memory")

class ExtractedConversationState(BaseModel):
    summary: str = Field(description="Краткое резюме сути текущей ветки (2-3 предложения)")
    active_decisions: list[str] = Field(default_factory=list, description="Принятые технические/архитектурные решения")
    open_questions: list[str] = Field(default_factory=list, description="Открытые вопросы или задачи, оставшиеся без ответа")

SUMMARY_PROMPT = """Ты — аналитический компонент персонального агента знаний (PKA).
Твоя задача — проанализировать историю сообщений диалога и обновить его сжатое состояние.

Выдели:
1. summary: Краткая суть того, что обсуждается в диалоге (2-3 предложения).
2. active_decisions: Список зафиксированных инженерных/архитектурных решений и договоренностей.
3. open_questions: Список вопросов или задач, которые пока остались открытыми.

Верни строго валидный JSON следующего формата:
{
  "summary": "...",
  "active_decisions": ["...", "..."],
  "open_questions": ["...", "..."]
}
"""

async def update_conversation_memory(conversation_id: UUID) -> None:
    """Анализирует историю сообщений ветки и обновляет ConversationMemory."""
    try:
        async with async_session_factory() as db:
            # Получаем все сообщения ветки
            stmt = select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at.asc())
            res = await db.execute(stmt)
            messages = res.scalars().all()

            if not messages or len(messages) < 2:
                return

            dialogue_text = "\n".join([f"{m.role.upper()}: {m.content}" for m in messages])

            # Запрос к локальной LLM для суммаризации
            payload = {
                "model": settings.OLLAMA_EXTRACTION_MODEL,
                "messages": [
                    {"role": "system", "content": SUMMARY_PROMPT},
                    {"role": "user", "content": f"История диалога:\n\n{dialogue_text}"}
                ],
                "format": "json",
                "stream": False,
                "options": {"temperature": 0.1}
            }

            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(f"{settings.OLLAMA_BASE_URL}/api/chat", json=payload)
                resp.raise_for_status()
                data = resp.json()
                raw_json = data["message"]["content"]
                parsed = json.loads(raw_json)

            state = ExtractedConversationState(
                summary=parsed.get("summary", ""),
                active_decisions=parsed.get("active_decisions", []),
                open_questions=parsed.get("open_questions", [])
            )

            now = datetime.utcnow()
            upsert_stmt = insert(ConversationMemory).values(
                conversation_id=conversation_id,
                summary=state.summary,
                active_decisions=state.active_decisions,
                open_questions=state.open_questions,
                message_count_at_summary=len(messages),
                updated_at=now
            ).on_conflict_do_update(
                index_elements=[ConversationMemory.conversation_id],
                set_={
                    "summary": state.summary,
                    "active_decisions": state.active_decisions,
                    "open_questions": state.open_questions,
                    "message_count_at_summary": len(messages),
                    "updated_at": now
                }
            )
            await db.execute(upsert_stmt)
            await db.commit()
            logger.info(f"Updated memory for conversation {conversation_id}")

    except Exception as e:
        logger.error(f"Failed to update conversation memory for {conversation_id}: {e}")

async def maybe_trigger_memory_update(conversation_id: UUID, threshold: int = 4) -> None:
    """Запускает обновление памяти ветки, если накопилось >= threshold новых сообщений."""
    async with async_session_factory() as db:
        mem_res = await db.execute(
            select(ConversationMemory).where(ConversationMemory.conversation_id == conversation_id)
        )
        mem = mem_res.scalar_one_or_none()
        last_count = mem.message_count_at_summary if mem else 0

        msg_count_res = await db.execute(
            select(func.count(Message.id)).where(Message.conversation_id == conversation_id)
        )
        total_msgs = msg_count_res.scalar() or 0

        if total_msgs - last_count >= threshold:
            await update_conversation_memory(conversation_id)
