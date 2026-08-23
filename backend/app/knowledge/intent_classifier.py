import logging

logger = logging.getLogger(__name__)


def is_code_query(text: str) -> bool:
    CODE_TRIGGERS = {"def ", "class ", "SELECT ", "FROM ", "import ", "curl ", "docker ", "const ", "function"}
    CODE_SYMBOLS = {"{", "}", "();", "=>", "==", "!=", "::"}
    if any(trigger in text for trigger in CODE_TRIGGERS):
        return True
    if any(symbol in text for symbol in CODE_SYMBOLS):
        return True
    return False


async def classify_intent(query: str) -> str:
    """Classify user query into FACTUAL, ANALYTICAL, TEMPORAL, or META using fast deterministic rules (~0 ms)."""
    if is_code_query(query):
        logger.info(f"[IntentClassifier] Deterministic: detected code query -> FACTUAL")
        return "FACTUAL"

    query_lower = query.lower()

    # 0. Personal profile & memory queries
    personal_keywords = [
        "обо мне", "мой профиль", "что я", "кто я",
        "мой персональный", "мои данные", "мой опыт",
        "про меня", "ты же мой"
    ]
    if any(kw in query_lower for kw in personal_keywords):
        logger.info(f"[IntentClassifier] Deterministic: detected personal query -> ANALYTICAL")
        return "ANALYTICAL"

    # 1. META: System, architecture, greetings, interface
    meta_keywords = [
        "что ты", "кто ты", "как ты работ", "твои возможн", "что умеешь",
        "взаимосвязан", "устройство", "как устроена память", "структура чат",
        "помощь", "help", "привет", "здравствуй", "стек агента", "архитектур",
        "космос", "вселенн", "метафор", "интерфейс", "граф", "звезд", "планет",
        "созвезди", "deep space", "universe view", "связь тебя", "о себе", "о системе",
        "обучение", "тьютор", "flashcards", "смарт тьютор", "smart tutor", "карточки"
    ]
    if any(kw in query_lower for kw in meta_keywords):
        logger.info(f"[IntentClassifier] Deterministic: -> META")
        return "META"

    # 2. TEMPORAL: Time, history, changes, past vs present
    keywords_temporal = [
        "когда", "раньше", "сейчас", "после", "до этого", "эволюц",
        "динамик", "изменил", "история", "хронолог", "таймлайн", "сменили"
    ]
    if any(kw in query_lower for kw in keywords_temporal):
        logger.info(f"[IntentClassifier] Deterministic: -> TEMPORAL")
        return "TEMPORAL"

    # 3. ANALYTICAL: Comparison, patterns, why, contradictions
    keywords_analytical = [
        "почему", "противореч", "привычк", "паттерн", "что общего",
        "заметил", "сравни", "анализ", "коллизи", "связь", "разниц"
    ]
    if any(kw in query_lower for kw in keywords_analytical):
        logger.info(f"[IntentClassifier] Deterministic: -> ANALYTICAL")
        return "ANALYTICAL"

    # 4. Default fast path: FACTUAL (direct search, notes, definitions, files)
    logger.info(f"[IntentClassifier] Deterministic default: -> FACTUAL")
    return "FACTUAL"

