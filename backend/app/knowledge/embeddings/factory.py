import logging
from ...core.config import settings
from ...knowledge.embeddings.base import BaseEmbeddingProvider

logger = logging.getLogger(__name__)

# Singleton instance
_provider_instance: BaseEmbeddingProvider | None = None

def get_embedding_provider() -> BaseEmbeddingProvider:
    global _provider_instance
    if _provider_instance is not None:
        return _provider_instance

    backend = settings.EMBEDDING_BACKEND.lower()
    if backend == "local":
        from ...knowledge.embeddings.local_provider import LocalSentenceTransformerProvider
        _provider_instance = LocalSentenceTransformerProvider()
    elif backend == "gemini":
        from ...knowledge.embeddings.gemini_provider import GeminiEmbeddingProvider
        _provider_instance = GeminiEmbeddingProvider()
    elif backend == "ollama":
        from ...knowledge.embeddings.ollama_provider import OllamaEmbeddingProvider
        _provider_instance = OllamaEmbeddingProvider()
    else:
        raise ValueError(f"Unknown EMBEDDING_BACKEND: {backend}")

    logger.info(f"Initialized embedding provider: {backend} ({_provider_instance.model_name})")
    return _provider_instance
