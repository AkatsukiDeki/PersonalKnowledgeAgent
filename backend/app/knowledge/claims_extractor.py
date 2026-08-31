import json
import logging
from typing import List, Dict, Any, Optional, Literal
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from ..core.config import settings
from ..core.llm import model_manager, TaskType

logger = logging.getLogger(__name__)

class ClaimExtraction(BaseModel):
    chunk_index: int = Field(description="Индекс чанка из предоставленного батча (число от 0).")
    content: str = Field(description="Утверждение на том же языке, что и исходный текст. Перевод запрещен.")
    claim_type: Literal[
        "fact",
        "decision",
        "habit",
        "preference",
        "observation",
        "plan"
    ] = Field("fact", description="Тип факта/знания")
    category: str = Field(description="sport, programming, study, work, or personal. Do NOT use General.")
    confidence: float = Field(description="Confidence score from 0.0 to 1.0")
    importance: float = Field(default=0.5, description="Важность знания от 0.1 до 1.0 (см. шкалу в системном промпте)")
    temporal_context: Optional[str] = Field(default=None, description="Явный временной контекст (например 'летом 2023', 'вчера', '2024-05'), если указан.")
    valid_from: Optional[str] = Field(default=None, description="YYYY-MM-DD, YYYY-MM или YYYY")
    valid_to: Optional[str] = Field(default=None, description="YYYY-MM-DD, YYYY-MM или YYYY")

class ExtractedEntity(BaseModel):
    chunk_index: int = Field(description="Индекс чанка (от 0), к которому относится эта сущность")
    canonical_name: str = Field(description="Normalized canonical name in lowercase")
    entity_type: str = Field(description="technology, activity, concept, goal, or person")
    description: str = Field(description="Short description of the entity")
    aliases: List[str] = Field(description="Other names or abbreviations")

class ExtractedRelation(BaseModel):
    source_chunk_index: int = Field(description="Индекс чанка источника")
    target_chunk_index: int = Field(description="Индекс целевого чанка")
    relation_type: str = Field(description="supports, contradicts, related_to, derived_from")
    evidence_summary: str = Field(description="Краткое объяснение связи")
    confidence: float = Field(..., ge=0.0, le=1.0)

class ClaimsList(BaseModel):
    claims: List[ClaimExtraction]
    entities: List[ExtractedEntity]
    relations: List[ExtractedRelation]

SYSTEM_PROMPT = """Ты — аналитический модуль извлечения данных из текста.
Твоя задача — проанализировать предоставленный батч текстовых чанков (каждый помечен индексом [CHUNK <id>]) и извлечь:
1. Список проверяемых атомарных фактов (claims). Отбрасывай факты, не несущие ценности (контекстный шум, случайные реплики).
2. Ключевые сущности (entities).
3. Связи между фактами внутри батча (relations).

СТРОГИЕ ПРАВИЛА:
1. ЯЗЫК: Формулируй утверждения СТРОГО НА ТОМ ЖЕ ЯЗЫКЕ, на котором написан исходный текст. ПЕРЕВОД ЗАПРЕЩЕН.
2. КАТЕГОРИИ (claims): Выбирай строго одну: sport, programming, study, work, personal.
3. ИНДЕКС: Укажи правильный `chunk_index` для каждого факта и сущности.
4. ТИПЫ: Поле `claim_type` определяет **форму** знания (fact, decision, habit, preference, observation, plan).
5. ВАЖНОСТЬ (`importance`): Оценивай важность каждого факта строго по шкале:
   - 0.9 - 1.0: Архитектурные правила, неизменяемые решения, стек, жесткие ограничения.
   - 0.6 - 0.8: Принятые решения по фичам, настройки, устойчивые привычки.
   - 0.3 - 0.5: Временные эксперименты, черновики, промежуточные статусы задач.
   - (Факты с важностью ниже 0.3 лучше отбрасывать на этапе извлечения).
6. ВРЕМЯ (`temporal_context`, `valid_from`, `valid_to`): Если в тексте упомянут временной интервал или точная дата события, обязательно заполни поля `valid_from` и `valid_to` в формате `YYYY-MM-DD` (или `YYYY-MM` / `YYYY`, если точный день неизвестен). Если дата относительная, рассчитай ее исходя из контекста документа. Сохрани оригинальную фразу в `temporal_context`.
"""

async def extract_claims_from_chunks(chunks_texts: List[str]) -> Optional[ClaimsList]:
    """Extract claims, entities, and intra-batch relations from a batch of text chunks."""
    if not chunks_texts:
        return None
        
    prompt = "Пожалуйста, извлеки данные из следующих чанков:\n\n"
    for i, text in enumerate(chunks_texts):
        prompt += f"[CHUNK {i}]\n{text}\n\n"
        
    try:
        response_model = await model_manager.generate_structured(
            task_type=TaskType.EXTRACTION,
            schema=ClaimsList,
            prompt=prompt,
            system_instruction=SYSTEM_PROMPT
        )
        return response_model
    except Exception as e:
        logger.error(f"[ClaimsExtractor] Failed to extract batch: {e}")
        return None
