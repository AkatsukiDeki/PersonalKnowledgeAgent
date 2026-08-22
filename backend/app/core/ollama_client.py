import json
import logging
import re
from typing import Any, Dict, Optional, Type, TypeVar
import httpx
from pydantic import BaseModel, ValidationError
from fastapi import HTTPException

from .config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def clean_json_string(text: str) -> str:
    """Удаляет markdown, комментарии и исправляет частые опечатки LLM."""
    text = text.strip()
    
    # Удаление markdown оберток ```json ... ```
    if text.startswith("```"):
        lines = text.split('\n')
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    # Поиск границ JSON
    start_obj = text.find('{')
    start_arr = text.find('[')

    start_idx = -1
    end_idx = -1

    if start_obj != -1 and (start_arr == -1 or start_obj < start_arr):
        start_idx = start_obj
        end_idx = text.rfind('}')
    elif start_arr != -1:
        start_idx = start_arr
        end_idx = text.rfind(']')

    if start_idx != -1 and end_idx != -1 and end_idx >= start_idx:
        text = text[start_idx:end_idx + 1]

    # Удаление висячих запятых перед закрывающими скобками: ", }" -> "}" и ", ]" -> "]"
    text = re.sub(r',\s*([\]}])', r'\1', text)
    return text


def robust_json_parser(text: str) -> Any:
    cleaned = clean_json_string(text)
    
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Попытка восстановить оборванный JSON (добавление недостающих скобок)
        open_braces = cleaned.count('{') - cleaned.count('}')
        open_brackets = cleaned.count('[') - cleaned.count(']')
        
        patched = cleaned
        if open_brackets > 0:
            patched += ']' * open_brackets
        if open_braces > 0:
            patched += '}' * open_braces
            
        patched = re.sub(r',\s*([\]}])', r'\1', patched)
        return json.loads(patched)


class OllamaClient:
    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL.rstrip("/")
        self.default_model = getattr(settings, "OLLAMA_MODEL", "qwen2.5:7b")
        self.timeout = httpx.Timeout(300.0, connect=10.0)

    async def generate(
            self,
            model: Optional[str] = None,
            prompt: str = "",
            system: Optional[str] = None,
            format_schema: Optional[Any] = None,
            num_predict: int = 4096
    ) -> str:
        target_model = model or self.default_model

        payload = {
            "model": target_model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "num_predict": num_predict,
                "temperature": 0.1,
                "repeat_penalty": 1.15,
                "top_p": 0.9,
                "num_ctx": 8192,
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
                error_body = e.response.text
                logger.error(f"[Ollama Error] HTTP {e.response.status_code} on {e.request.url}: {error_body}")
                raise HTTPException(
                    status_code=502,
                    detail=f"Ошибка Ollama ({target_model}): {error_body}"
                )
            except httpx.RequestError as e:
                logger.error(f"[Ollama Connection Error]: {repr(e)}")
                raise HTTPException(
                    status_code=503,
                    detail=f"Не удалось подключиться к Ollama по адресу {self.base_url}."
                )

    async def generate_json(
            self,
            prompt: str,
            model: Optional[str] = None,
            system: Optional[str] = None,
            num_predict: int = 4096
    ) -> Dict[str, Any]:
        target_model = model or self.default_model
        strict_sys = "You must output ONLY valid, raw JSON. Do not write markdown wrappers, explanations, or intro text. Output valid RFC 8259 JSON in RUSSIAN."
        system_prompt = f"{system}\n\n{strict_sys}" if system else strict_sys

        raw_response = await self.generate(
            model=target_model,
            prompt=prompt,
            system=system_prompt,
            format_schema="json",
            num_predict=num_predict
        )

        try:
            parsed = robust_json_parser(raw_response)
            if isinstance(parsed, dict):
                return parsed
            if isinstance(parsed, list):
                return {"items": parsed}
            return {}
        except Exception as e:
            logger.warning(f"Ollama generate_json parsing failed on first attempt: {e}. Retrying with strict instruction...")
            retry_prompt = (
                f"{prompt}\n\n"
                f"--- SYSTEM FIX REQUIRED ---\n"
                f"Your previous response had a JSON syntax error: {str(e)}.\n"
                f"Output strictly compact, valid RFC 8259 JSON without linebreaks in string values."
            )
            raw_response_2 = await self.generate(
                model=target_model,
                prompt=retry_prompt,
                system=system_prompt,
                format_schema="json",
                num_predict=4096
            )
            try:
                parsed_2 = robust_json_parser(raw_response_2)
                if isinstance(parsed_2, dict):
                    return parsed_2
                if isinstance(parsed_2, list):
                    return {"items": parsed_2}
                return {}
            except Exception as fatal_e:
                logger.error(f"Ollama generate_json fatal failure: {fatal_e}. Raw: {raw_response_2}")
                raise ValueError(f"Failed to generate valid JSON from Ollama: {fatal_e}") from fatal_e

    async def generate_structured(self, model: Optional[str], prompt: str, schema_cls: Type[T],
                                  system: Optional[str] = None) -> T:
        target_model = model or self.default_model
        json_schema = schema_cls.model_json_schema()

        strict_sys = f"You must output ONLY valid JSON matching this schema: {json.dumps(json_schema)}. Do not wrap the JSON object in any outer keys. Return the raw object matching the schema directly. Use strictly RUSSIAN language."
        system = f"{system}\n\n{strict_sys}" if system else strict_sys

        raw_response = await self.generate(target_model, prompt, system=system, format_schema=json_schema, num_predict=4096)
        try:
            parsed = robust_json_parser(raw_response)

            if isinstance(parsed, dict) and len(parsed) == 1:
                key = list(parsed.keys())[0]
                if isinstance(parsed[key], dict):
                    schema_keys = set(schema_cls.model_fields.keys())
                    inner_keys = set(parsed[key].keys())
                    if inner_keys.intersection(schema_keys):
                        parsed = parsed[key]

            if isinstance(parsed, dict) and "module" in parsed and "topics" in parsed and "modules" not in parsed:
                parsed = {"modules": [{
                    "module_id": parsed["module"].get("node_id", "01"),
                    "title": parsed["module"].get("title", parsed["module"].get("topic_название", "Module")),
                    "order": 1,
                    "topics": parsed["topics"]
                }]}

            return schema_cls(**parsed)
        except (json.JSONDecodeError, ValidationError, ValueError) as e:
            logger.warning(f"Ollama validation failed on first attempt: {e}. Retrying...")

            retry_prompt = (
                f"{prompt}\n\n"
                f"--- SYSTEM WARNING ---\n"
                f"Your previous output was invalid according to the schema. "
                f"Error: {str(e)}\n"
                f"Please fix the error and output valid JSON exactly matching the schema."
            )
            raw_response_2 = await self.generate(
                target_model,
                retry_prompt,
                system=system,
                format_schema=json_schema,
                num_predict=4096
            )

            try:
                parsed_2 = robust_json_parser(raw_response_2)
                return schema_cls(**parsed_2)
            except (json.JSONDecodeError, ValidationError, ValueError) as fatal_e:
                logger.error(f"Ollama EXTRACTION fatal failure after retry: {fatal_e}. Raw response: {raw_response_2}")
                raise ValueError(f"Failed to extract structured JSON after retry. Error: {fatal_e}") from fatal_e
