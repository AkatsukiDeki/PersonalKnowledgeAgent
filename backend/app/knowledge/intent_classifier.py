import logging
from pydantic import BaseModel, Field
from app.core.llm import model_manager, TaskType

logger = logging.getLogger(__name__)

class IntentResponse(BaseModel):
    intent: str = Field(description="Must be 'FACTUAL' or 'ANALYTICAL'")

async def classify_intent(query: str) -> str:
    """Classify user query into FACTUAL or ANALYTICAL intent."""
    query_lower = query.lower()
    
    # 1. Fast path: keyword matching
    keywords = [
        "противореч", "изменил", "привычк", "паттерн", "что общего", 
        "заметил", "эволюц", "раньше", "сейчас", "динамик", "сравни"
    ]
    if any(kw in query_lower for kw in keywords):
        return "ANALYTICAL"
        
    # 2. Semantic fallback
    try:
        prompt = f"Query: '{query}'\n\nClassify this query. If it asks for specific data points, commands, or facts, classify as FACTUAL. If it asks to compare things, find patterns, analyze history, or find commonalities, classify as ANALYTICAL."
        res = await model_manager.generate_structured(
            task_type=TaskType.EXTRACTION,
            schema=IntentResponse,
            prompt=prompt,
            system_instruction="You are an intent classifier. Respond with exactly FACTUAL or ANALYTICAL in the intent field."
        )
        intent = res.intent.strip().upper()
        if intent in ["FACTUAL", "ANALYTICAL"]:
            return intent
        return "FACTUAL"
    except Exception as e:
        logger.warning(f"[IntentClassifier] LLM fallback failed: {e}. Defaulting to FACTUAL.")
        return "FACTUAL"
