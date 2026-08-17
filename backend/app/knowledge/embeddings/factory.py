import logging
from app.core.config import settings
from app.knowledge.embeddings.base import BaseEmbeddingProvider

logger = logging.getLogger(__name__)

# Singleton instance
_provider_instance: BaseEmbeddingProvider | None = None

def get_embedding_provider() -> BaseEmbeddingProvider:
    global _provider_instance
    if _provider_instance is not None:
        return _provider_instance

    backend = settings.EMBEDDING_BACKEND.lower()
    if backend == "local":
        from app.knowledge.embeddings.local_provider import LocalSentenceTransformerProvider
        _provider_instance = LocalSentenceTransformerProvider()
    elif backend == "gemini":
        from app.knowledge.embeddings.gemini_provider import GeminiEmbeddingProvider
        _provider_instance = GeminiEmbeddingProvider()
    else:
        raise ValueError(f"Unknown EMBEDDING_BACKEND: {backend}")

    logger.info(f"Initialized embedding provider: {backend} ({_provider_instance.model_name})")
    return _provider_instance
