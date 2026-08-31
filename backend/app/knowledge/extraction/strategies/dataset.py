import logging
from typing import List
from app.core.llm import model_manager, TaskType
from app.schemas.concept import DocumentConceptsPayload, ExtractedConcept
from ..base import BaseConceptExtractor

logger = logging.getLogger(__name__)

class DatasetProfileExtractor(BaseConceptExtractor):
    def __init__(self, min_budget: int = 1, max_budget: int = 3):
        self.min_budget = min_budget
        self.max_budget = max_budget

    async def extract(self, content: str, title: str, **kwargs) -> List[ExtractedConcept]:
        max_context_chars = 40_000
        trimmed_text = content[:max_context_chars]

        user_prompt = f"Название датасета: {title}\n\nПример данных/структура:\n{trimmed_text}"
        sys_prompt = f"""Ты — профилировщик данных. Твоя задача — описать этот набор данных (датасет).
Выдели от {self.min_budget} до {self.max_budget} концептов, которые описывают:
1. О чем эти данные (основная сущность).
2. Потенциальное использование (для каких задач).
3. (Опционально) Главные метрики/поля, если они очевидны.
Каждый концепт должен быть емким и понятным.
"""

        try:
            response: DocumentConceptsPayload = await model_manager.generate_structured(
                task_type=TaskType.EXTRACTION,
                schema=DocumentConceptsPayload,
                prompt=user_prompt,
                system_instruction=sys_prompt
            )
            return response.concepts[:self.max_budget]
        except Exception as e:
            logger.error(f"[DatasetProfileExtractor] Extraction failed for '{title}': {e}")
            return []
