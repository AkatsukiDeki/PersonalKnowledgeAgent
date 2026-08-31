import asyncio
import logging
from typing import List
from sentence_transformers import SentenceTransformer

from ...core.config import settings
from ...knowledge.embeddings.base import BaseEmbeddingProvider

logger = logging.getLogger(__name__)

class LocalSentenceTransformerProvider(BaseEmbeddingProvider):
    def __init__(self):
        self._model_name = settings.EMBEDDING_MODEL
        self._dimension = settings.EMBEDDING_DIMENSION
        self._version_tag = settings.EMBEDDING_VERSION
        self._device = settings.EMBEDDING_DEVICE
        self._batch_size = settings.EMBEDDING_BATCH_SIZE
        
        logger.info(f"Loading local embedding model: {self._model_name} on {self._device}")
        
        # Load the model synchronously, this will block during startup but is expected.
        # Alternatively, could be loaded lazily on first request.
        self.model = SentenceTransformer(self._model_name, device=self._device)

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def dimension(self) -> int:
        return self._dimension

    @property
    def version_tag(self) -> str:
        return self._version_tag

    def _get_task_prefix(self, is_query: bool) -> str:
        """Returns task prefix for models like Nomic."""
        if "nomic" in self._model_name.lower():
            return "search_query: " if is_query else "search_document: "
        return ""

    async def embed_documents(self, texts: List[str]) -> List[List[float]]:
        prefix = self._get_task_prefix(is_query=False)
        prefixed_texts = [prefix + text for text in texts]
        
        # Run inference in a separate thread to unblock FastAPI event loop
        embeddings = await asyncio.to_thread(
            self.model.encode, 
            prefixed_texts, 
            batch_size=self._batch_size,
            show_progress_bar=False,
            convert_to_numpy=True
        )
        return embeddings.tolist()

    async def embed_query(self, text: str) -> List[float]:
        prefix = self._get_task_prefix(is_query=True)
        prefixed_text = prefix + text
        
        embedding = await asyncio.to_thread(
            self.model.encode, 
            prefixed_text,
            show_progress_bar=False,
            convert_to_numpy=True
        )
        return embedding.tolist()
