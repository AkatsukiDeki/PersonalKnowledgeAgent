import hashlib
from collections.abc import AsyncGenerator
from typing import Any, Dict, List

from cachetools import TTLCache
from cachetools.keys import hashkey
from google import genai
from google.genai import types
import logging

logger = logging.getLogger(__name__)

from ..core.config import settings
from app.core.llm import tenacity_retry_llm, tenacity_retry_reasoning_llm, model_manager
from .prompts import RAG_SYSTEM_INSTRUCTION, QUERY_REWRITE_PROMPT, build_rag_prompt
from app.core.ollama_client import OllamaClient

_client = None

def get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = settings.GEMINI_API_KEY or "DUMMY_KEY_FOR_TESTS"
        _client = genai.Client(api_key=api_key)
    return _client

rewrite_cache = TTLCache(maxsize=100, ttl=600)

@tenacity_retry_llm
async def _generate_rewrite(prompt: str) -> str:
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        ollama = OllamaClient()
        return await ollama.generate("qwen2.5-coder:14b", prompt, system=None)

    response = await get_client().aio.models.generate_content(
        model=model_manager.get_model('reasoning'),
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.0,
            tool_config={"function_calling_config": {"mode": "NONE"}}
        )
    )
    return response.text.strip() if response.text else ""


@tenacity_retry_reasoning_llm
async def generate_rag_response(query: str, retrieved_chunks: List[Dict[str, Any]]) -> str:
    """Генерация ответа на базе извлеченных чанков (RAG)."""
    if not retrieved_chunks:
        return "К сожалению, я не нашел информации по вашему вопросу."

    context_blocks = [
        f"--- Чанк {i + 1} ---\n{chunk['text_content']}"
        for i, chunk in enumerate(retrieved_chunks)
    ]
    context_text = "\n\n".join(context_blocks)
    prompt = build_rag_prompt(query, context_text)

    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        ollama = OllamaClient()
        return await ollama.generate("qwen2.5-coder:14b", prompt, system=RAG_SYSTEM_INSTRUCTION)

    response = await get_client().aio.models.generate_content(
        model=model_manager.get_model('reasoning'),
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=RAG_SYSTEM_INSTRUCTION,
            temperature=0.1,
        ),
    )
    return response.text or ""

@tenacity_retry_reasoning_llm
async def _do_stream(prompt: str):
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        # Simulate streaming by yielding chunks of Ollama's full response
        # (Ollama stream=True is not implemented in OllamaClient's generate yet, but we can fake it or just yield it fully)
        ollama = OllamaClient()
        full_resp = await ollama.generate("qwen2.5-coder:14b", prompt, system=RAG_SYSTEM_INSTRUCTION)
        async def fake_stream():
            import asyncio
            for word in full_resp.split(" "):
                yield type('FakeChunk', (), {'text': word + " "})()
                await asyncio.sleep(0.01)
        return fake_stream()

    return await get_client().aio.models.generate_content_stream(
        model=model_manager.get_model('reasoning'),
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=RAG_SYSTEM_INSTRUCTION,
            temperature=0.1,
        ),
    )

async def stream_rag_response(
    query: str,
    retrieved_chunks: List[Dict[str, Any]],
) -> AsyncGenerator[str, None]:
    """Потоковая генерация ответа на базе чанков."""
    if not retrieved_chunks:
        yield "К сожалению, я не нашел информации по вашему вопросу."
        return

    context_blocks = [
        f"--- Чанк {i + 1} ---\n{chunk['text_content']}"
        for i, chunk in enumerate(retrieved_chunks)
    ]
    context_text = "\n\n".join(context_blocks)
    prompt = build_rag_prompt(query, context_text)

    try:
        response_stream = await _do_stream(prompt)
        async for chunk in response_stream:
            if chunk.text:
                yield chunk.text
    except Exception as e:
        yield f"\n\n[Ошибка: {str(e)}]"