import logging
from typing import List
from app.core.llm import model_manager, TaskType
from app.schemas.concept import DocumentConceptsPayload, ExtractedConcept
from ..base import BaseConceptExtractor

logger = logging.getLogger(__name__)

CONCEPT_EXTRACTION_SYSTEM_PROMPT = """Ты анализируешь документ как целостную единицу знаний.
Твоя задача — выделить только фундаментальные концепты, которые представляют интеллектуальную структуру документа.

НЕ ИЗВЛЕКАЙ:
- отдельные предложения и тривиальные факты;
- очевидные определения терминов;
- повторяющиеся детали и синтаксические примеры без концептуальной ценности.

ПРАВИЛА:
1. Выдели от {min_budget} до {max_budget} концептов.
2. Каждый концепт должен представлять самостоятельную архитектурную или смысловую идею.
3. Концепт должен быть емким и полезным для связывания с другими областями знаний.
4. Концепты не должны дублировать друг друга.
"""

class WholeDocumentExtractor(BaseConceptExtractor):
    def __init__(self, min_budget: int = 3, max_budget: int = 7):
        self.min_budget = min_budget
        self.max_budget = max_budget

    async def extract(self, content: str, title: str, **kwargs) -> List[ExtractedConcept]:
        max_context_chars = 60_000
        trimmed_text = content[:max_context_chars]

        user_prompt = f"Документ: {title}\n\nТекст документа:\n{trimmed_text}"
        sys_prompt = CONCEPT_EXTRACTION_SYSTEM_PROMPT.format(min_budget=self.min_budget, max_budget=self.max_budget)

        try:
            response: DocumentConceptsPayload = await model_manager.generate_structured(
                task_type=TaskType.EXTRACTION,
                schema=DocumentConceptsPayload,
                prompt=user_prompt,
                system_instruction=sys_prompt
            )
            raw_concepts = response.concepts
        except Exception as e:
            logger.error(f"[WholeDocumentExtractor] Extraction failed for '{title}': {e}")
            return []

        # Дедупликация и ограничение бюджета
        unique_concepts = []
        seen_titles = set()

        # Сортировка: high importance в приоритете, затем по длине описания
        sorted_raw = sorted(
            raw_concepts,
            key=lambda c: (1 if c.importance == "high" else 0, len(c.statement)),
            reverse=True
        )

        for c in sorted_raw:
            norm_title = c.title.strip().lower()
            if norm_title not in seen_titles:
                seen_titles.add(norm_title)
                unique_concepts.append(c)

        budgeted_concepts = unique_concepts[:self.max_budget]
        logger.info(f"[WholeDocumentExtractor] Extracted {len(budgeted_concepts)} concepts for '{title}'")
        return budgeted_concepts
