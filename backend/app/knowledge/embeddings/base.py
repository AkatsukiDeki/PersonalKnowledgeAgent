from typing import Protocol, runtime_checkable

@runtime_checkable
class BaseEmbeddingProvider(Protocol):
    @property
    def model_name(self) -> str:
        """Название используемой модели."""
        ...

    @property
    def dimension(self) -> int:
        """Размерность выходного вектора."""
        ...

    @property
    def version_tag(self) -> str:
        """Идентификатор версии пространства эмбеддингов."""
        ...

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Пакетное получение эмбеддингов для документов (чанков)."""
        ...

    async def embed_query(self, text: str) -> list[float]:
        """Получение эмбеддинга для поискового запроса."""
        ...
