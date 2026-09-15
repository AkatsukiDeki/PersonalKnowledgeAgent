import logging
import base64
from typing import Optional
from app.core.config import settings
from app.core.prompts import MATH_HANDWRITING_OCR_PROMPT

logger = logging.getLogger(__name__)

class VLMService:
    def __init__(self):
        self.gemini_api_key = getattr(settings, "GEMINI_API_KEY", None)

    async def extract_markdown_from_image(self, image_bytes: bytes, mime_type: str = "image/jpeg") -> Optional[str]:
        if self.gemini_api_key:
            try:
                from google import genai
                client = genai.Client(api_key=self.gemini_api_key)
                response = await client.aio.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[
                        MATH_HANDWRITING_OCR_PROMPT,
                        genai.types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
                    ]
                )
                if response and response.text:
                    return response.text.strip()
            except Exception as e:
                logger.warning(f"[VLMService] Gemini Vision call failed, falling back: {e}")

        # Локальный fallback через Ollama Vision (если настроен OLLAMA_BASE_URL)
        if getattr(settings, "OLLAMA_BASE_URL", None):
            try:
                import httpx
                b64_img = base64.b64encode(image_bytes).decode("utf-8")
                payload = {
                    "model": getattr(settings, "OLLAMA_VISION_MODEL", "qwen2.5-vl:7b"),
                    "prompt": MATH_HANDWRITING_OCR_PROMPT,
                    "images": [b64_img],
                    "stream": False
                }
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(f"{settings.OLLAMA_BASE_URL}/api/generate", json=payload)
                    if resp.status_code == 200:
                        return resp.json().get("response", "").strip()
            except Exception as e:
                logger.warning(f"[VLMService] Ollama Vision call failed: {e}")

        return None
