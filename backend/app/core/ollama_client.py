import json
import logging
from typing import Any, Dict, Optional, Type, TypeVar
import httpx
from pydantic import BaseModel, ValidationError

from .config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

class OllamaClient:
    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL.rstrip("/")
        self.timeout = httpx.Timeout(3000.0, connect=10.0)

    async def generate(self, model: str, prompt: str, system: Optional[str] = None, format_schema: Optional[Dict[str, Any]] = None) -> str:
        """
        Raw text generation via Ollama with optional JSON schema.
        """
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "num_predict": 768,
                "temperature": 0.1,
                "num_ctx": 4096,
            }
        }
        if system:
            payload["system"] = system
            
        if format_schema:
            payload["format"] = format_schema
            
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(f"{self.base_url}/api/generate", json=payload)
                response.raise_for_status()
                data = response.json()
                return data.get("response", "")
            except httpx.HTTPStatusError as e:
                logger.error(f"Ollama HTTP error: {e.response.text}")
                raise
            except httpx.RequestError as e:
                logger.error(f"Ollama request error: {repr(e)}")
                raise

    async def generate_structured(self, model: str, prompt: str, schema_cls: Type[T], system: Optional[str] = None) -> T:
        """
        Generate structured output using Pydantic schema.
        Includes a 1-retry mechanism if JSON validation fails.
        """
        json_schema = schema_cls.model_json_schema()
        # Some versions of ollama accept format=schema, some accept simple "json". We pass the schema.
        
        # First attempt
        raw_response = await self.generate(model, prompt, system=system, format_schema=json_schema)
        try:
            parsed = json.loads(raw_response)
            return schema_cls(**parsed)
        except (json.JSONDecodeError, ValidationError) as e:
            logger.warning(f"Ollama validation failed on first attempt: {e}. Retrying...")
            
            # Second attempt with error feedback
            retry_prompt = (
                f"{prompt}\n\n"
                f"--- SYSTEM WARNING ---\n"
                f"Your previous output was invalid according to the schema. "
                f"Error: {str(e)}\n"
                f"Please fix the error and output valid JSON exactly matching the schema."
            )
            raw_response_2 = await self.generate(model, retry_prompt, system=system, format_schema=json_schema)
            parsed_2 = json.loads(raw_response_2)
            return schema_cls(**parsed_2)
