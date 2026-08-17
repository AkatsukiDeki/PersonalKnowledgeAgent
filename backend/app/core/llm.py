from google import genai
import logging
from tenacity import retry, wait_random_exponential, stop_after_attempt, retry_if_exception
from app.core.config import settings

logger = logging.getLogger(__name__)

_genai_client = None

def get_genai_client() -> genai.Client:
    global _genai_client
    if _genai_client is None:
        api_key = settings.GEMINI_API_KEY or "DUMMY_KEY_FOR_TESTS"
        _genai_client = genai.Client(api_key=api_key)
    return _genai_client

import enum
import json
from typing import TypeVar, Type, Optional
from pydantic import BaseModel
import httpx
from google.genai import types
from google.genai.errors import APIError

from .ollama_client import OllamaClient

class TaskType(enum.Enum):
    EXTRACTION = "EXTRACTION"
    ROUTINE_QA = "ROUTINE_QA"
    DEEP_SYNTHESIS = "DEEP_SYNTHESIS"

class ReasoningProviderUnavailableError(Exception):
    pass

T = TypeVar("T", bound=BaseModel)

class ModelManager:
    def __init__(self):
        self.fast_model = settings.FAST_LLM_MODEL
        self.reasoning_model = settings.REASONING_LLM_MODEL
        self.ollama_client = OllamaClient()

    def get_model(self, model_type: str = "fast") -> str:
        return self.reasoning_model if model_type == "reasoning" else self.fast_model

    async def _gemini_structured_fallback(self, prompt: str, schema_cls: Type[T], system: Optional[str] = None) -> T:
        client = get_genai_client()
        try:
            config = types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schema_cls.model_json_schema(),
                temperature=0.1
            )
            if system:
                config.system_instruction = system
            
            response = await client.aio.models.generate_content(
                model=self.fast_model,
                contents=prompt,
                config=config
            )
            if not response.text:
                raise ValueError("Empty response from Gemini fallback")
            return schema_cls.model_validate_json(response.text)
        except Exception as e:
            logger.error(f"[ModelManager] Gemini fallback failed for structured data: {e}")
            raise

    async def generate_structured(self, task_type: TaskType, schema: Type[T], prompt: str, system_instruction: Optional[str] = None) -> T:
        if task_type == TaskType.DEEP_SYNTHESIS:
            client = get_genai_client()
            try:
                config = types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=schema.model_json_schema(),
                    temperature=0.2
                )
                if system_instruction:
                    config.system_instruction = system_instruction
                
                response = await client.aio.models.generate_content(
                    model=self.reasoning_model,
                    contents=prompt,
                    config=config
                )
                if not response.text:
                    raise ValueError("Empty response from Reasoning Model")
                return schema.model_validate_json(response.text)
            except (APIError, httpx.RequestError, ValueError) as e:
                logger.error(f"[ModelManager] DEEP_SYNTHESIS critical failure: {e}")
                raise ReasoningProviderUnavailableError(f"Reasoning provider unavailable: {str(e)}") from e

        elif task_type == TaskType.EXTRACTION:
            try:
                return await self.ollama_client.generate_structured(
                    model=settings.OLLAMA_EXTRACTION_MODEL,
                    prompt=prompt,
                    schema_cls=schema,
                    system=system_instruction
                )
            except (httpx.RequestError, ValueError) as e:
                logger.warning(f"[ModelManager] Ollama EXTRACTION failed ({e}). Falling back to Gemini.")
                return await self._gemini_structured_fallback(prompt, schema, system_instruction)
        
        raise ValueError(f"Unsupported structured task type: {task_type}")

    async def generate_text(self, task_type: TaskType, prompt: str, system_instruction: Optional[str] = None) -> str:
        if task_type == TaskType.ROUTINE_QA:
            try:
                return await self.ollama_client.generate(
                    model=settings.OLLAMA_QA_MODEL,
                    prompt=prompt,
                    system=system_instruction
                )
            except httpx.RequestError as e:
                logger.warning(f"[ModelManager] Ollama QA failed ({e}). Falling back to Gemini.")
                client = get_genai_client()
                config = types.GenerateContentConfig(temperature=0.3)
                if system_instruction:
                    config.system_instruction = system_instruction
                response = await client.aio.models.generate_content(
                    model=self.fast_model,
                    contents=prompt,
                    config=config
                )
                return response.text or ""
        
        raise ValueError(f"Unsupported text task type: {task_type}")

model_manager = ModelManager()

# We keep the old retry decorators for backward compatibility in other parts of the system for now
# though we should transition them to the ModelManager routing methods eventually.
def is_retryable_error(exception: BaseException) -> bool:
    err_str = str(exception).lower()
    return "429" in err_str or "resource_exhausted" in err_str or "quota" in err_str or "404" in err_str or "not_found" in err_str

from tenacity import retry, wait_random_exponential, stop_after_attempt, retry_if_exception

tenacity_retry_llm = retry(
    retry=retry_if_exception(is_retryable_error),
    wait=wait_random_exponential(min=2, max=10),
    stop=stop_after_attempt(5),
    reraise=True
)

tenacity_retry_reasoning_llm = retry(
    retry=retry_if_exception(is_retryable_error),
    wait=wait_random_exponential(min=2, max=10),
    stop=stop_after_attempt(5),
    reraise=True
)
