import logging
from typing import List, Optional
from pydantic import BaseModel
from ..core.ollama_client import OllamaClient
from ..core.config import settings

logger = logging.getLogger(__name__)

class ActionItem(BaseModel):
    task: str
    assignee: Optional[str] = None
    deadline: Optional[str] = None
    context_quote: Optional[str] = None

class TranscriptInsights(BaseModel):
    summary: str
    key_topics: List[str]
    decisions: List[str]
    action_items: List[ActionItem]
    sentiment_or_mood: Optional[str] = None

EXTRACTION_SYSTEM_PROMPT = """Ты — аналитический модуль персонального агента знаний (PKA).
Твоя задача — проанализировать транскрипт встречи, созвона или заметки и извлечь структурированные факты, задачи и решения.

ПРАВИЛА:
1. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО выдумывать задачи или решения, которых не было в тексте.
2. Каждая задача (ActionItem) должна опираться на прямую реплику/цитату из разговора (поле context_quote).
3. Если во встрече не было явных задач или решений, верни пустые массивы, а не придумывай их.
4. Выведи ответ строго в формате JSON по заданной схеме."""

class TranscriptInsightExtractor:
    def __init__(self):
        self.ollama_client = OllamaClient()
        self.model = getattr(settings, "OLLAMA_QA_MODEL", "qwen2.5:7b")

    async def extract_insights(self, full_transcript: str) -> TranscriptInsights:
        logger.info(f"Extracting insights from transcript of length {len(full_transcript)}")
        
        prompt = f"ТРАНСКРИПТ:\n{full_transcript}\n\nПожалуйста, извлеки структурированные данные по схеме JSON."
        
        try:
            insights = await self.ollama_client.generate_structured(
                model=self.model,
                prompt=prompt,
                schema_cls=TranscriptInsights,
                system=EXTRACTION_SYSTEM_PROMPT
            )
            logger.info(f"Successfully extracted {len(insights.action_items)} action items and {len(insights.decisions)} decisions.")
            return insights
        except Exception as e:
            logger.error(f"Failed to extract insights: {e}")
            # Возвращаем пустую структуру в случае ошибки
            return TranscriptInsights(
                summary="Не удалось сформировать саммари из-за ошибки генерации.",
                key_topics=[],
                decisions=[],
                action_items=[]
            )
