import time
import httpx
from fastapi import APIRouter, HTTPException, status
from ..core.config import settings
from ..schemas.copilot import CopilotRequest, CopilotResponse

router = APIRouter(prefix="/copilot", tags=["Copilot"])

COPILOT_SYSTEM_PROMPT = (
    "You are an inline text completion engine. "
    "Continue the user's thought directly and concisely. "
    "Do NOT repeat the prefix. Do NOT add preamble, quotes, explanations, or conversational filler. "
    "Output ONLY the raw continuation text (1-10 words)."
)

@router.post("/complete", response_model=CopilotResponse)
async def complete_text(payload: CopilotRequest):
    prefix = payload.prefix.strip()
    if not prefix or len(prefix) < 3:
        return CopilotResponse(suggestion="", latency_ms=0.0)

    start_time = time.perf_counter()
    model = getattr(settings, "OLLAMA_COPILOT_MODEL", None) or settings.OLLAMA_QA_MODEL

    # Формируем компактный контекст
    prompt_parts = []
    if payload.last_assistant_message:
        prompt_parts.append(f"Context: {payload.last_assistant_message.strip()[:200]}")
    prompt_parts.append(f"Input: {payload.prefix}")
    prompt_parts.append("Continuation:")
    
    full_prompt = "\n".join(prompt_parts)

    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": model,
                    "prompt": full_prompt,
                    "system": COPILOT_SYSTEM_PROMPT,
                    "stream": False,
                    "options": {
                        "temperature": 0.1,
                        "num_predict": 12,
                        "stop": ["\n", ".", "?", "!", "Input:", "Context:"],
                    },
                },
            )
            response.raise_for_status()
            data = response.json()
            
            raw_suggestion = data.get("response", "")
            # Очистка артефактов и лидирующих пробелов при дублировании
            suggestion = raw_suggestion.split("\n")[0]
            if suggestion.startswith(" "):
                # Сохраняем ровно один пробел, если он нужен между словами
                suggestion = " " + suggestion.lstrip()

    except (httpx.RequestError, httpx.HTTPStatusError):
        # Graceful degradation: при таймауте не ломаем UI, а отдаем пустую строку
        return CopilotResponse(suggestion="", latency_ms=0.0)

    latency_ms = (time.perf_counter() - start_time) * 1000.0
    return CopilotResponse(suggestion=suggestion, latency_ms=round(latency_ms, 2))
