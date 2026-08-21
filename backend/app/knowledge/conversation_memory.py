import json
import logging
from datetime import datetime
from typing import List, Optional
from uuid import UUID

import httpx
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from ..core.config import settings
from ..db.models import ConversationMemory, ConversationMessage
from ..db.session import async_session_factory

logger = logging.getLogger("conversation_memory")


class ExtractedConversationState(BaseModel):
    problem: str = Field(default="", description="Какая проблема или задача решалась в ветке")
    context: Optional[str] = Field(default="", description="Вводные данные, архитектурный контекст и ограничения")
    attempts: List[str] = Field(default_factory=list, description="Рассмотренные варианты, гипотезы и попытки")
    decision_summary: str = Field(default="", description="Итоговое зафиксированное решение и договоренности")
    outcome: Optional[str] = Field(default="", description="Результат, статус или открытые вопросы")


SUMMARY_PROMPT = """Ты — аналитический компонент персонального агента знаний (PKA).
Твоя задача — проанализировать историю сообщений диалога и сформировать консолидированный опыт (ConversationMemory).

Выдели:
1. problem: Какая ключевая проблема или задача решается в диалоге (1-2 предложения).
2. context: Архитектурные ограничения и вводные контекста.
3. attempts: Список вариантов, которые пробовали или рассматривали.
4. decision_summary: Итоговое зафиксированное техническое решение.
5. outcome: Текущий результат, артефакты или оставшиеся открытые вопросы.

Верни строго валидный JSON следующего формата:
{
  "problem": "...",
  "context": "...",
  "attempts": ["...", "..."],
  "decision_summary": "...",
  "outcome": "..."
}
"""


async def update_conversation_memory(conversation_id: UUID) -> None:
    """Анализирует историю сообщений ветки и обновляет ConversationMemory."""
    try:
        async with async_session_factory() as db:
            # Извлекаем все сообщения ветки в хронологическом порядке
            stmt = (
                select(ConversationMessage)
                .where(ConversationMessage.conversation_id == conversation_id)
                .order_by(ConversationMessage.sequence_num.asc())
            )
            res = await db.execute(stmt)
            messages = res.scalars().all()

            if not messages or len(messages) < 2:
                return

            dialogue_text = "\n".join([f"{m.role.upper()}: {m.content}" for m in messages])

            # Запрос к локальной LLM для структурированной суммаризации
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
                problem=parsed.get("problem", "Обсуждение технической задачи"),
                context=parsed.get("context", ""),
                attempts=parsed.get("attempts", []),
                decision_summary=parsed.get("decision_summary", "Решение в процессе выработки"),
                outcome=parsed.get("outcome", "")
            )

            # Upsert в таблицу conversation_memories строго по схеме модели
            upsert_stmt = insert(ConversationMemory).values(
                conversation_id=conversation_id,
                problem=state.problem,
                context=state.context,
                attempts=state.attempts,
                decision_summary=state.decision_summary,
                outcome=state.outcome,
                created_at=datetime.utcnow()
            ).on_conflict_do_update(
                index_elements=[ConversationMemory.conversation_id],
                set_={
                    "problem": state.problem,
                    "context": state.context,
                    "attempts": state.attempts,
                    "decision_summary": state.decision_summary,
                    "outcome": state.outcome,
                }
            )
            await db.execute(upsert_stmt)
            await db.commit()
            logger.info(f"Updated memory for conversation {conversation_id}")

    except Exception as e:
        logger.error(f"Failed to update conversation memory for {conversation_id}: {e}")


async def maybe_trigger_memory_update(conversation_id: UUID, threshold: int = 4) -> None:
    """Запускает обновление памяти ветки при накоплении достаточного количества сообщений."""
    try:
        async with async_session_factory() as db:
            msg_count_res = await db.execute(
                select(func.count(ConversationMessage.id))
                .where(ConversationMessage.conversation_id == conversation_id)
            )
            total_msgs = msg_count_res.scalar() or 0

            if total_msgs >= threshold and total_msgs % 2 == 0:
                await update_conversation_memory(conversation_id)
    except Exception as e:
        logger.error(f"Error in maybe_trigger_memory_update for {conversation_id}: {e}")