import logging
import re
from enum import Enum

logger = logging.getLogger(__name__)


class QueryIntent(str, Enum):
    META = "META"
    FACTUAL = "FACTUAL"
    DEFAULT = "DEFAULT"


META_PATTERNS = [
    r"^(кто ты|что ты умеешь|какие твои функции|справка|помощь|help)",
    r"^(настройки|профиль|конфигурация|статус системы)",
    r"^(очисти контекст|сбрось диалог|новый чат)",
]

FACTUAL_PATTERNS = [
    r"^(найди|поищи|что известно о|когда|где|сколько|почему|как устроено)",
    r"(документ|заметка|проект|стек|инвариант|база знаний)",
]

_META_REGEX = re.compile("|".join(META_PATTERNS), re.IGNORECASE)
_FACTUAL_REGEX = re.compile("|".join(FACTUAL_PATTERNS), re.IGNORECASE)


def classify_intent_sync(query: str) -> QueryIntent:
    normalized = query.strip()
    if not normalized:
        return QueryIntent.DEFAULT

    if _META_REGEX.search(normalized):
        logger.info(f"[IntentClassifier] Regex: -> META")
        return QueryIntent.META
    if _FACTUAL_REGEX.search(normalized):
        logger.info(f"[IntentClassifier] Regex: -> FACTUAL")
        return QueryIntent.FACTUAL

    logger.info(f"[IntentClassifier] Regex default: -> DEFAULT")
    return QueryIntent.DEFAULT


async def classify_intent(query: str) -> str:
    """Async wrapper for backward compatibility"""
    intent = classify_intent_sync(query)
    # the existing logic expects strings like "META" or "FACTUAL"
    if intent == QueryIntent.DEFAULT:
        return "FACTUAL" # Default behavior for existing chat.py logic
    return intent.value

