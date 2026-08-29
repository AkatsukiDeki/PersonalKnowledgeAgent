import logging
from typing import List, Dict, Tuple
from ..core.llm import model_manager, TaskType

logger = logging.getLogger(__name__)


async def rewrite_query(query: str, history: List[Dict[str, str]]) -> Tuple[bool, str]:
    """
    Condense query only if necessary. If query is self-contained or no history exists,
    bypass LLM entirely (~0 ms budget rule).
    """
    if not history or len(history) <= 1:
        return True, query

    # Быстрая эвристика: если в сообщении > 4 слов и нет местоимений-анафор,
    # оригинальный текст сразу летит в эмбеддер без переписывания.
    query_lower = query.lower()
    words = query.strip().split()
    
    anaphors = {"он", "она", "оно", "они", "это", "этот", "эта", "эти", "тот", "та", "те", "почему", "зачем", "как", "ее", "его", "их", "туда"}
    has_anaphors = any(word.lower() in anaphors for word in words)
    
    if not has_anaphors and len(words) > 2:
        logger.info(f"[QueryCondenser] Query is self-contained (no anaphors). Skipping LLM rewrite.")
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