"""Parser for image files using Vision Models (Local / Cloud Fallback)."""

import asyncio
import logging
from typing import Dict, Any

from ..core.llm import model_manager

logger = logging.getLogger(__name__)

VISION_PROMPT = """You are an expert document and diagram parser for a personal knowledge base.
Analyze the provided image and extract its information in clean, structured Markdown:
1. If there is readable text (handwritten or printed, code, formulas), perform accurate OCR transcription. Preserve formatting, lists, and headers.
2. If there is a diagram, chart, or architectural scheme, provide a structured breakdown describing the entities, components, relationships, and arrows.
3. Do not add conversational fluff, intro phrases, or generic disclaimers. Output only the structured Markdown content.
"""

def parse_image(file_bytes: bytes, filename: str) -> str:
    """
    Parse an image using the Vision Model.
    Note: Parsing is inherently asynchronous due to LLM calls, but the parser factory
    is currently synchronous. We use asyncio.run or get_event_loop to bridge it.
    """
    import os
    _, ext = os.path.splitext(filename.lower())
    
    # MIME type normalization
    mime_type = "image/jpeg" # default
    if ext == ".png":
        mime_type = "image/png"
    elif ext == ".webp":
        mime_type = "image/webp"
    elif ext == ".heic":
        mime_type = "image/heic"
        
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # If we are already in an async context, we cannot block with run().
        # Normally parse_file is called in a thread pool (from fastapi UploadFile).
        import nest_asyncio
        nest_asyncio.apply()
        text = asyncio.run(model_manager.generate_vision(
            prompt=VISION_PROMPT,
            image_bytes=file_bytes,
            mime_type=mime_type,
            allow_cloud_fallback=True
        ))
    else:
        text = asyncio.run(model_manager.generate_vision(
            prompt=VISION_PROMPT,
            image_bytes=file_bytes,
            mime_type=mime_type,
            allow_cloud_fallback=True
        ))
        
    return text
