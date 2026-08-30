import enum
import json
import logging
from typing import TypeVar, Type, Optional, Any
from pydantic import BaseModel
import httpx
from google import genai
from google.genai import types
from google.genai.errors import APIError
from tenacity import retry, wait_random_exponential, stop_after_attempt, retry_if_exception

from ..core.config import settings
from .ollama_client import OllamaClient

logger = logging.getLogger(__name__)

class TaskType(enum.Enum):
    EXTRACTION = "EXTRACTION"
    ROUTINE_QA = "ROUTINE_QA"
    DEEP_SYNTHESIS = "DEEP_SYNTHESIS"

class ReasoningProviderUnavailableError(Exception):
    pass

T = TypeVar("T", bound=BaseModel)

class ModelManager:
    """Диспетчер LLM: Local-First с контролируемой деградацией."""

    def __init__(self):
        self.fast_model = settings.FAST_LLM_MODEL
        self.reasoning_model = settings.REASONING_LLM_MODEL
        self.ollama_client = OllamaClient()  # Инициализация Ollama клиента
        self._cloud_client = None
        self._init_cloud_provider()

    def _init_cloud_provider(self):
        key = getattr(settings, "GEMINI_API_KEY", None)
        # Cloud строго выключен, если ключа нет или он является плейсхолдером
        if not key or key.strip() == "" or "dummy" in key.lower():
            self.cloud_available = False
            logger.info("[ModelManager] Cloud Provider (Gemini): DISABLED (Local-Only Mode).")
            return

        try:
            self._cloud_client = genai.Client(api_key=key)
            self.cloud_available = True
            logger.info("[ModelManager] Cloud Provider (Gemini): ACTIVE.")
        except Exception as e:
            self.cloud_available = False
            logger.warning(f"[ModelManager] Cloud Provider init failed: {e}. Falling back to Local-Only.")

    def get_model(self, model_type: str = "fast") -> str:
        return self.reasoning_model if model_type == "reasoning" else self.fast_model

    async def _call_ollama_structured(self, prompt: str, schema: Type[T], system_instruction: Optional[str] = None) -> T:
        return await self.ollama_client.generate_structured(
            model=settings.OLLAMA_EXTRACTION_MODEL,
            prompt=prompt,
            schema_cls=schema,
            system=system_instruction
        )

    async def _call_gemini_structured(self, prompt: str, schema: Type[T], system_instruction: Optional[str] = None) -> T:
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=schema.model_json_schema(),
            temperature=0.1
        )
        if system_instruction:
            config.system_instruction = system_instruction
        
        response = await self._cloud_client.aio.models.generate_content(
            model=self.fast_model,
            contents=prompt,
            config=config
        )
        if not response.text:
            raise ValueError("Empty response from Gemini fallback")
        return schema.model_validate_json(response.text)

    async def generate_structured(self, task_type: TaskType, schema: Type[T], prompt: str, system_instruction: Optional[str] = None, allow_cloud_fallback: bool = False) -> Optional[T]:
        """
        Основной метод генерации структурированных данных.
        Ollama обязательна. Cloud fallback только при явном флаге и наличии конфигурации.
        """
        # 1. Попытка через Ollama
        try:
            return await self._call_ollama_structured(prompt, schema, system_instruction)
        except Exception as err:
            logger.error(f"[ModelManager] Ollama {task_type.name} failed: {err}")
            
            # 2. Cloud Fallback: ТОЛЬКО если провайдер явно активен
            if allow_cloud_fallback and self.cloud_available and self._cloud_client:
                logger.warning(f"[ModelManager] Initiating Gemini fallback for {task_type.name}...")
                try:
                    return await self._call_gemini_structured(prompt, schema, system_instruction)
                except Exception as cloud_err:
                    logger.error(f"[ModelManager] Gemini fallback failed: {cloud_err}")
                    
            # 3. Безопасный возврат None без выброса исключений
            return None

    async def generate_text(self, task_type: TaskType, prompt: str, system_instruction: Optional[str] = None, allow_cloud_fallback: bool = False) -> str:
        if task_type == TaskType.ROUTINE_QA:
            try:
                return await self.ollama_client.generate(
                    model=settings.OLLAMA_QA_MODEL,
                    prompt=prompt,
                    system=system_instruction
                )
            except httpx.RequestError as e:
                logger.error(f"[ModelManager] Ollama QA failed ({e}).")
                if allow_cloud_fallback and self.cloud_available and self._cloud_client:
                    logger.warning("[ModelManager] Falling back to Gemini for QA.")
                    config = types.GenerateContentConfig(temperature=0.3)
                    if system_instruction:
                        config.system_instruction = system_instruction
                    response = await self._cloud_client.aio.models.generate_content(
                        model=self.fast_model,
                        contents=prompt,
                        config=config
                    )
                    return response.text or ""
                return ""
        
        
        raise ValueError(f"Unsupported text task type: {task_type}")

    async def generate_vision(self, messages: list, image_bytes: bytes, mime_type: str, allow_cloud_fallback: bool = True) -> str:
        """
        Обработка изображений через Vision-модель (Ollama -> Gemini Fallback).
        """
        # 1. Ollama (Local)
        vision_model = getattr(settings, "OLLAMA_VISION_MODEL", "qwen2.5-vl")
        try:
            return await self.ollama_client.chat(
                model=vision_model,
                messages=messages
            )
        except Exception as e:
            logger.error(f"[ModelManager] Ollama Vision failed ({e}).")
            
            # 2. Cloud Fallback (Gemini)
            if allow_cloud_fallback and self.cloud_available and self._cloud_client:
                logger.warning("[ModelManager] Falling back to Gemini for Vision.")
                try:
                    from google.genai import types
                    from ..agent.gemini import _to_gemini_contents
                    
                    config = types.GenerateContentConfig(temperature=0.2)
                    
                    # Gemini expects image bytes in the part, not base64. 
                    # We inject the image bytes into the last message manually.
                    gemini_contents = _to_gemini_contents(messages)
                    gemini_contents[-1].parts.insert(0, types.Part.from_bytes(data=image_bytes, mime_type=mime_type))
                    
                    response = await self._cloud_client.aio.models.generate_content(
                        model=self.fast_model,
                        contents=gemini_contents,
                        config=config
                    )
                    return response.text or ""
                except Exception as cloud_err:
                    logger.error(f"[ModelManager] Gemini Vision fallback failed: {cloud_err}")
            
            # Если оба упали, возвращаем дефолтный текст ошибки
            return "[Ошибка обработки изображения: Vision-провайдер недоступен]"

    async def stream_vision(
        self,
        messages: list,
        image_bytes: bytes,
        mime_type: str = "image/png",
        allow_cloud_fallback: bool = True,
    ):
        """Стриминг мультимодального ответа (Ollama -> Cloud Fallback)"""
        # 1. Попытка локально через Ollama
        try:
            vision_model = getattr(settings, "OLLAMA_VISION_MODEL", "qwen2.5-vl")
            async for chunk in self.ollama_client.stream_chat(
                messages=messages,
                model=vision_model,
            ):
                yield chunk
            return
        except Exception as e:
            logger.warning(f"[ModelManager] Stream Ollama Vision failed: {e}. Switching to Cloud Fallback...")

        # 2. Cloud Fallback (Gemini)
        if allow_cloud_fallback and self.cloud_available and self._cloud_client:
            try:
                from google.genai import types
                from ..agent.gemini import _to_gemini_contents
                
                config = types.GenerateContentConfig(temperature=0.2)
                
                # We inject the image bytes into the last user turn.
                gemini_contents = _to_gemini_contents(messages)
                gemini_contents[-1].parts.insert(0, types.Part.from_bytes(data=image_bytes, mime_type=mime_type))
                
                response_stream = await self._cloud_client.aio.models.generate_content_stream(
                    model=self.fast_model,
                    contents=gemini_contents,
                    config=config
                )
                async for chunk in response_stream:
                    if chunk.text:
                        yield chunk.text
                return
            except Exception as cloud_err:
                logger.error(f"[ModelManager] Cloud Vision Stream failed: {cloud_err}")
                yield f"\n\n[Ошибка Vision-анализа: {cloud_err}]"
                return

        yield "\n\n[Ошибка: Мультимодальные модели недоступны]"

model_manager = ModelManager()

# We keep the old retry decorators for backward compatibility in other parts of the system for now
# though we should transition them to the ModelManager routing methods eventually.
def is_retryable_error(exception: BaseException) -> bool:
    err_str = str(exception).lower()
    return "429" in err_str or "resource_exhausted" in err_str or "quota" in err_str or "404" in err_str or "not_found" in err_str

tenacity_retry_llm = retry(
    retry=retry_if_exception(is_retryable_error),
    wait=wait_random_exponential(multiplier=1, max=10),
    stop=stop_after_attempt(5)
)

tenacity_retry_reasoning_llm = tenacity_retry_llm

async def generate_with_retry(prompt: str, system: Optional[str] = None) -> str:
    return await model_manager.generate_text(TaskType.ROUTINE_QA, prompt, system_instruction=system, allow_cloud_fallback=True)

async def generate_structured_with_retry(prompt: str, schema_cls: Type[T], system: Optional[str] = None) -> T:
    res = await model_manager.generate_structured(TaskType.EXTRACTION, schema_cls, prompt, system_instruction=system, allow_cloud_fallback=True)
    if res is None:
        raise ValueError("Extraction failed.")
    return res

async def generate_reasoning_with_retry(prompt: str, schema_cls: Type[T], system: Optional[str] = None) -> T:
    return await model_manager.generate_structured(TaskType.DEEP_SYNTHESIS, schema_cls, prompt, system_instruction=system)

def get_genai_client():
    return model_manager._cloud_client
