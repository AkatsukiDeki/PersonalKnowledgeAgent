import os
import asyncio
import logging
from typing import List
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

# Fallback wrapper if google.genai is used or we can use litellm / vertex
from google import genai
from google.genai import types

from ...core.config import settings
from ...knowledge.embeddings.base import BaseEmbeddingProvider

logger = logging.getLogger(__name__)

class GeminiEmbeddingProvider(BaseEmbeddingProvider):
    def __init__(self):
        self._model_name = settings.EMBEDDING_MODEL
        self._dimension = settings.EMBEDDING_DIMENSION
        self._version_tag = settings.EMBEDDING_VERSION
        
        api_key = settings.GEMINI_API_KEY
        if not api_key:
            logger.warning("GEMINI_API_KEY not found in settings, falling back to os.environ")
            api_key = os.environ.get("GEMINI_API_KEY")
            if not api_key:
                raise ValueError("GEMINI_API_KEY is missing for GeminiEmbeddingProvider")
        
        # Initialize Google GenAI client
        self.client = genai.Client(api_key=api_key)

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def dimension(self) -> int:
        return self._dimension

    @property
    def version_tag(self) -> str:
        return self._version_tag

    @retry(
        wait=wait_exponential(multiplier=1, min=4, max=10),
        stop=stop_after_attempt(5),
        reraise=True
    )
    async def _embed_batch_with_retry(self, texts: List[str], task_type: types.TaskType) -> List[List[float]]:
        # Run blocking GenAI client call in a thread if client is synchronous
        # the new genai SDK might be async in client.aio, but let's use the thread wrapper for safety
        # unless we explicitly use aio.
        def _call_api():
            # For latest google-genai
            # Ensure proper batching if required by model
            response = self.client.models.embed_content(
                model=self._model_name,
                contents=texts,
                config=types.EmbedContentConfig(
                    task_type=task_type,
                    output_dimensionality=self._dimension if self._dimension else None
                )
            )
            return [emb.values for emb in response.embeddings]

        return await asyncio.to_thread(_call_api)


    async def embed_documents(self, texts: List[str]) -> List[List[float]]:
        # Gemini handles batching natively up to a certain size, you might need to chunk `texts`
        # if the list is huge, but we'll assume it's chunked reasonably beforehand.
        return await self._embed_batch_with_retry(texts, types.TaskType.RETRIEVAL_DOCUMENT)

    async def embed_query(self, text: str) -> List[float]:
        results = await self._embed_batch_with_retry([text], types.TaskType.RETRIEVAL_QUERY)
        return results[0]
