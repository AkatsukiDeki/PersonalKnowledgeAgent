import asyncio
import logging
import httpx
import math
from typing import List
from cachetools import LRUCache

from ...core.config import settings
from ...knowledge.embeddings.base import BaseEmbeddingProvider

logger = logging.getLogger(__name__)

class OllamaEmbeddingProvider(BaseEmbeddingProvider):
    def __init__(self):
        self._model_name = settings.OLLAMA_EMBEDDING_MODEL
        self._dimension = settings.EMBEDDING_DIMENSION
        self._version_tag = settings.EMBEDDING_VERSION
        self._base_url = settings.OLLAMA_BASE_URL.rstrip('/')
        self._cache = LRUCache(maxsize=1024)
        
        logger.info(f"Initialized Ollama embedding provider for model: {self._model_name}")

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def dimension(self) -> int:
        return self._dimension

    @property
    def version_tag(self) -> str:
        return self._version_tag

    async def _call_ollama(self, client: httpx.AsyncClient, text: str) -> List[float]:
        cache_key = (self._model_name, text.strip().lower())
        if cache_key in self._cache:
            return self._cache[cache_key]
            
        try:
            resp = await client.post(
                f"{self._base_url}/api/embeddings",
                json={
                    "model": self._model_name,
                    "prompt": text,
                    "keep_alive": -1,
                    "options": {
                        "num_gpu": 0  # Force CPU offload to prevent VRAM swapping with LLM
                    }
                }
            )
            resp.raise_for_status()
            data = resp.json()
            embedding = data.get("embedding", [])
            
            # L2 Normalization (useful for cosine similarity if not natively normalized)
            if embedding:
                norm = math.sqrt(sum(x * x for x in embedding))
                if norm > 0:
                    embedding = [x / norm for x in embedding]
                    
            self._cache[cache_key] = embedding
            return embedding
        except Exception as e:
            logger.error(f"Ollama embedding failed for text snippet: {e}")
            # Fallback to zero vector to avoid breaking the pipeline, or raise
            return [0.0] * self._dimension

    CONCURRENCY_LIMIT = 4

    async def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
            
        semaphore = asyncio.Semaphore(self.CONCURRENCY_LIMIT)
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            async def _call_safe(text: str) -> List[float]:
                async with semaphore:
                    return await self._call_ollama(client, text)
                    
            return await asyncio.gather(*[_call_safe(t) for t in texts])

    async def embed_query(self, text: str) -> List[float]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            return await self._call_ollama(client, text)
