import logging
from pydantic import BaseModel, Field
from app.core.llm import model_manager, TaskType

logger = logging.getLogger(__name__)

class IntentResponse(BaseModel):
    intent: str = Field(description="Must be 'FACTUAL', 'ANALYTICAL', 'TEMPORAL', or 'META'")

async def classify_intent(query: str) -> str:
    """Classify user query into FACTUAL or ANALYTICAL intent."""
    query_lower = query.lower()
    
    # 1. Fast path: keyword matching
    meta_keywords = [
        "что ты", "кто ты", "как ты работ", "твои возможн", "что умеешь",
        "взаимосвязан", "устройство", "как устроена память", "структура чат",
        "помощь", "help", "привет", "здравствуй", "стек агента", "архитектур"
    ]
    if any(kw in query_lower for kw in meta_keywords):
        return "META"

    keywords_temporal = ["раньше", "сейчас", "эволюц", "динамик", "изменил", "история"]
    if any(kw in query_lower for kw in keywords_temporal):
        return "TEMPORAL"

    keywords = ["противореч", "привычк", "паттерн", "что общего", "заметил", "сравни"]
    if any(kw in query_lower for kw in keywords):
        return "ANALYTICAL"
        
    # 2. Semantic fallback
    try:
        prompt = f"Query: '{query}'\n\nClassify this query. If it asks about you (the system), what you can do, or is a greeting, classify as META. If it asks for specific data points, commands, or facts, classify as FACTUAL. If it asks about history, changes over time, evolution, or past vs present, classify as TEMPORAL. If it asks to compare things, find patterns, or find commonalities, classify as ANALYTICAL."
        res = await model_manager.generate_structured(
            task_type=TaskType.EXTRACTION,
            schema=IntentResponse,
            prompt=prompt,
            system_instruction="You are an intent classifier. Respond with exactly FACTUAL, ANALYTICAL, TEMPORAL, or META in the intent field."
        )
        intent = res.intent.strip().upper()
        if intent in ["FACTUAL", "ANALYTICAL", "TEMPORAL", "META"]:
            return intent
        return "FACTUAL"
    except Exception as e:
        logger.warning(f"[IntentClassifier] LLM fallback failed: {e}. Defaulting to FACTUAL.")
        return "FACTUAL"
