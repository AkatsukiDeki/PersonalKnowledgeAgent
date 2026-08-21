import logging
from typing import List, Dict, Tuple
from ..core.llm import model_manager, TaskType

logger = logging.getLogger(__name__)


async def rewrite_query(query: str, history: List[Dict[str, str]]) -> Tuple[bool, str]:
    """
    Condense query only if necessary. If query is self-contained or no history exists,
    bypass LLM entirely (~0 ms budget rule).
    """
    if not history:
        return True, query

    # Быстрая эвристика: если текущий запрос длинный (больше 4-5 слов) или содержит
    # специфические тех. термины/сущности, он скорее всего самодостаточен.
    # Конденсация нужна только для коротких уточняющих вопросов со словарями отсылок.
    query_lower = query.lower()
    context_triggers = ["а ", "и ", "туда", "него", "ней", "них", "этот", "эту", "эти", "тоже", "еще раз", "почему",
                        "зачем"]

    # Если вопрос длинный и не начинается с явных слов-паразитов контекста — не дергаем LLM
    words = query.strip().split()
    if len(words) > 6 and not any(query_lower.startswith(tr) for tr in ["а ", "и ", "то "]):
        logger.info(f"[QueryCondenser] Query is self-contained (length > 6). Skipping LLM rewrite.")
        return True, query

    recent_history = history[-4:]
    history_text = "\n".join([f"{msg['role'].capitalize()}: {msg['content']}" for msg in recent_history])

    prompt = f"""
Given the following conversation history and the user's latest query, rewrite the query into a standalone search query.
CRITICAL: Preserve all domain entities, tool names, variables, and parameters verbatim. Do not lose specific technical terms.

History:
{history_text}

User: {query}
Output:"""

    try:
        rewritten = await model_manager.generate_text(
            task_type=TaskType.ROUTINE_QA,
            prompt=prompt.strip(),
            system_instruction="You are an expert search query condenser. Respond ONLY with the condensed query, no quotes, no explanations."
        )
        if rewritten and len(rewritten) > 5:
            return True, rewritten.strip()
        else:
            raise ValueError("Empty or invalid rewrite")
    except Exception as e:
        logger.warning(f"[QueryCondenser] Failed to condense query: {e}. Using fallback.")
        last_user = next((m["content"] for m in reversed(recent_history) if m["role"] == "user"), "")
        fallback = f"{last_user} {query}".strip()
        return False, fallback