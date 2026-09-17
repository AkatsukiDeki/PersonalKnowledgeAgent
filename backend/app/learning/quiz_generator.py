import logging
from typing import Dict, Any
from ..learning.schemas import GenerateQuizRequest, QuizPayload
from ..core.llm import model_manager, TaskType
from ..db.models import Claim, Chunk
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

class QuizGenerator:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate(self, request: GenerateQuizRequest, context: Dict[str, Any]) -> QuizPayload:
        claims = context.get("claims", [])
        chunks = context.get("chunks", [])
        sources = context.get("sources", [])

        if not claims and not chunks and not sources:
            # Fallback if context is empty
            topic_title = (
                getattr(request, "topic_title", None)
                or getattr(request, "topic_id", None)
                or context.get("extra_instruction")
                or "Основы дисциплины"
            )
            context_summary = f"Предмет: {topic_title}. Сгенерируй концептуальные проверочные вопросы на понимание ключевых принципов этой дисциплины."
        else:
            context_summary_parts = []
            if claims:
                context_summary_parts.append("\n".join([f"- [Claim ID: {c.id}]: {c.content}" for c in claims[:20]]))
            if chunks:
                context_summary_parts.append("\n".join([f"- [Chunk ID: {ch.id}]: {ch.text_content[:300]}..." for ch in chunks[:15]]))
            if sources and not claims and not chunks:
                context_summary_parts.append("\n".join([f"- [Source: {s.title or s.id}]: {str(s.content or s.raw_content)[:1000]}..." for s in sources[:5]]))
            context_summary = "\n\n".join(context_summary_parts)

        system_prompt = (
            "Ты — строгий технический ментор. На основе предоставленных фактов и фрагментов документации "
            "составь практический квиз для проверки знаний.\n"
            "Требования:\n"
            "1. Вопросы должны проверять понимание архитектуры и кода, а не банальное запоминание текста.\n"
            "2. Каждый вопрос должен содержать корректное объяснение (explanation).\n"
            "3. Четко укажи id связанных утверждений (Claim ID) в evidence_claim_ids.\n"
            "4. В массиве опций (options) отметь правильные ответы (is_correct=true).\n"
            "5. Каждый вариант в options должен быть коротким термином или лаконичной фразой (до 75 символов).\n"
            "6. Пояснение (explanation) не должно превышать 150 символов."
        )

        user_prompt = (
            f"Уровень сложности: {request.difficulty}\n"
            f"Количество вопросов: {request.question_count}\n\n"
            f"Вводные факты/фрагменты:\n{context_summary}"
        )
        
        extra_instruction = context.get("extra_instruction")
        if extra_instruction:
            user_prompt += f"\n\n{extra_instruction}"

        quiz = await model_manager.generate_structured(
            task_type=TaskType.DEEP_SYNTHESIS,
            schema=QuizPayload,
            prompt=user_prompt,
            system_instruction=system_prompt,
            allow_cloud_fallback=True
        )

        if not quiz:
            raise ValueError("Failed to generate Quiz Payload")

        return quiz
