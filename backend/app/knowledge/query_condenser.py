import logging
from typing import List, Dict, Tuple
from app.core.llm import model_manager, TaskType

logger = logging.getLogger(__name__)

async def rewrite_query(query: str, history: List[Dict[str, str]]) -> Tuple[bool, str]:
    """
    Condense the user query and chat history into a single standalone search query.
    Preserves domain entities like tool names, parameters, or specific technical terms.
    Returns a tuple (is_success, rewritten_query).
    """
    if not history:
        return True, query

    recent_history = history[-4:]
    history_text = "\n".join([f"{msg['role'].capitalize()}: {msg['content']}" for msg in recent_history])
    
    prompt = f"""
Given the following conversation history and the user's latest query, rewrite the query into a standalone search query.
CRITICAL: Preserve all domain entities, tool names, variables, and parameters verbatim. Do not lose specific technical terms.

Example 1:
History:
User: Как настроить nginx?
Assistant: Используйте директиву server.
User: А как туда добавить логгирование?
Output: Как добавить логгирование в конфигурацию server nginx?

Example 2:
History:
User: Что такое git cherry-pick?
Assistant: Это перенос коммита.
User: А почему нельзя использовать git merge для этой же задачи?
Output: Почему нельзя использовать git merge вместо git cherry-pick для переноса коммита?

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
        # Fail-Safe Fallback: original_query + last_user_message
        last_user = next((m["content"] for m in reversed(recent_history) if m["role"] == "user"), "")
        fallback = f"{last_user} {query}".strip()
        return False, fallback
