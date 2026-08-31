import logging
from typing import Dict, Any
from app.learning.schemas import GenerateQuizRequest, QuizPayload
from app.core.llm import model_manager, TaskType
from app.db.models import Claim, Chunk
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

class QuizGenerator:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate(self, request: GenerateQuizRequest, context: Dict[str, Any]) -> QuizPayload:
        claims = context.get("claims", [])
        chunks = context.get("chunks", [])

        if not claims and not chunks:
            raise ValueError("Insufficient context for generating a quiz.")

        context_summary_parts = []
        if claims:
            context_summary_parts.append("\n".join([f"- [Claim ID: {c.id}]: {c.content}" for c in claims[:20]]))
        if chunks:
            context_summary_parts.append("\n".join([f"- [Chunk ID: {ch.id}]: {ch.text_content[:300]}..." for ch in chunks[:15]]))
            
        context_summary = "\n".join(context_summary_parts)

        system_prompt = (
            "Ты — строгий технический ментор. На основе предоставленных фактов и фрагментов документации "
            "составь практический квиз для проверки знаний.\n"
            "Требования:\n"
            "1. Вопросы должны проверять понимание архитектуры и кода, а не банальное запоминание текста.\n"
            "2. Каждый вопрос должен содержать корректное объяснение (explanation).\n"
            "3. Четко укажи id связанных утверждений (Claim ID) в evidence_claim_ids.\n"
            "4. В массиве опций (options) отметь правильные ответы (is_correct=true)."
        )

        user_prompt = (
            f"Сложность: {request.difficulty}\n"
            f"Количество вопросов: {request.question_count}\n\n"
            f"База фактов для генерации:\n{context_summary}"
        )

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
