import logging
from typing import List, Optional
from pydantic import BaseModel, Field
from ..core.ollama_client import OllamaClient
from ..core.config import settings

logger = logging.getLogger(__name__)


class ActionItem(BaseModel):
    task: str = Field(description="Текст задачи или действия строго на русском языке")
    assignee: Optional[str] = Field(default=None, description="Ответственный")
    deadline: Optional[str] = Field(default=None, description="Срок или дедлайн")
    context_quote: Optional[str] = Field(default=None, description="Цитата из текста на русском языке")


class TranscriptInsights(BaseModel):
    summary: str = Field(description="Краткое содержание/саммари лекции или встречи строго на русском языке")
    key_topics: List[str] = Field(default_factory=list, description="Список тем и терминов строго на русском языке")
    decisions: List[str] = Field(default_factory=list, description="Решения и договоренности строго на русском языке")
    action_items: List[ActionItem] = Field(default_factory=list, description="Задачи")
    sentiment_or_mood: Optional[str] = Field(default=None, description="Тон встречи на русском языке")


VOICE_EXTRACTION_SYSTEM_PROMPT = """Ты — ассистент базы знаний. Твоя задача — преобразовать сырую разговорную расшифровку аудиозаметки в четкую инженерную структуру.

Правила:
1. Выдели краткую суть (summary) в 2-4 предложениях.
2. Извлеки ключевые концепты, инсайты и факты (key_points).
3. Найди все практические действия, задачи и todo (action_items).
4. Отфильтруй разговорный мусор ("э-э-э", "ну", повторы).
5. Язык вывода — строго русский.

Ответ должен быть валидным JSON следующего формата:
{
  "summary": "...",
  "key_points": ["...", "..."],
  "action_items": ["...", "..."]
}
"""


class TranscriptInsightExtractor:
    def __init__(self):
        self.ollama_client = OllamaClient()
        self.model = getattr(settings, "OLLAMA_QA_MODEL", "qwen2.5:3b")

    async def extract_insights(self, full_transcript: str) -> TranscriptInsights:
        logger.info(f"Extracting insights from transcript of length {len(full_transcript)}")

        prompt = (
            f"ТРАНСКРИПТ:\n\"\"\"\n{full_transcript}\n\"\"\"\n\n"
            f"ВНИМАНИЕ: Сформируй резюме, список тем (key_topics) и задачи СТРОГО НА РУССКОМ ЯЗЫКЕ.\n"
            f"Пример правильного key_topics: [\"Компьютерная алгебра\", \"Шифрование RSA\", \"Дискретное логарифмирование\"].\n"
            f"Ответь в формате JSON."
        )

        try:
            insights = await self.ollama_client.generate_structured(
                model=self.model,
                prompt=prompt,
                schema_cls=TranscriptInsights,
                system=VOICE_EXTRACTION_SYSTEM_PROMPT
            )
            logger.info(f"Successfully extracted {len(insights.action_items)} action items and {len(insights.decisions)} decisions.")
            return insights
        except Exception as e:
            logger.error(f"Failed to extract insights: {e}", exc_info=True)
            return TranscriptInsights(
                summary="Не удалось сформировать саммари из-за ошибки генерации.",
                key_topics=[],
                decisions=[],
                action_items=[]
            )
