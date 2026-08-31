import asyncio
import re
import logging
from typing import List
from ..base import BaseConceptExtractor
from app.schemas.concept import DocumentConceptsPayload, ExtractedConcept
from app.core.llm import model_manager, TaskType

logger = logging.getLogger(__name__)

class HierarchicalMapReduceExtractor(BaseConceptExtractor):
    def __init__(self, min_budget: int = 7, max_budget: int = 12, concurrency: int = 5):
        self.min_budget = min_budget
        self.max_budget = max_budget
        self.semaphore = asyncio.Semaphore(concurrency)

    def _split_into_semantic_windows(self, text: str, max_window_size: int = 40_000) -> List[str]:
        # Попытка деления по структуре (Markdown headers)
        sections = re.split(r'\n(?=#{1,3} )', text)
        windows, current_window = [], []
        current_len = 0

        for sec in sections:
            if current_len + len(sec) > max_window_size and current_window:
                windows.append("\n".join(current_window))
                current_window = [sec]
                current_len = len(sec)
            else:
                current_window.append(sec)
                current_len += len(sec)

        if current_window:
            windows.append("\n".join(current_window))
        return windows

    async def extract(self, content: str, title: str, **kwargs) -> List[ExtractedConcept]:
        windows = self._split_into_semantic_windows(content)
        
        # 1. MAP STAGE: параллельное извлечение локальных концептов
        map_prompt = "Выдели 3-4 локальных ключевых концепта из этой секции документа."
        
        async def process_window(win: str, idx: int):
            async with self.semaphore:
                try:
                    res: DocumentConceptsPayload = await model_manager.generate_structured(
                        task_type=TaskType.EXTRACTION,
                        schema=DocumentConceptsPayload,
                        prompt=f"Документ: {title} (Секция {idx+1})\n\n{win}",
                        system_instruction=map_prompt
                    )
                    return res.concepts
                except Exception as e:
                    logger.error(f"[HierarchicalMapReduceExtractor] Map failed on window {idx} of '{title}': {e}")
                    return []

        logger.info(f"[HierarchicalMapReduceExtractor] Mapping {len(windows)} windows for '{title}'")
        map_results = await asyncio.gather(*[process_window(w, i) for i, w in enumerate(windows)])
        intermediate_pool: List[ExtractedConcept] = [c for sublist in map_results for c in sublist]

        if not intermediate_pool:
            return []

        # 2. REDUCE STAGE: финальный synthesis & deduplication in-memory
        logger.info(f"[HierarchicalMapReduceExtractor] Reducing {len(intermediate_pool)} intermediate concepts")
        reduce_prompt = f"""Сведи промежуточный пул концептов книги/монографии к строго {self.min_budget}-{self.max_budget} фундаментальным тезисам.
Устрани дублирование, склей пересекающиеся идеи и оставь только архитектурный каркас."""
        
        pool_repr = "\n".join([f"- {c.title}: {c.statement}" for c in intermediate_pool])
        
        try:
            reduced: DocumentConceptsPayload = await model_manager.generate_structured(
                task_type=TaskType.EXTRACTION,
                schema=DocumentConceptsPayload,
                prompt=f"Документ: {title}\n\nПул промежуточных идей:\n{pool_repr}",
                system_instruction=reduce_prompt
            )
            return reduced.concepts[:self.max_budget]
        except Exception as e:
            logger.error(f"[HierarchicalMapReduceExtractor] Reduce failed for '{title}': {e}")
            return []
