import pytest
from app.knowledge.embeddings.factory import get_embedding_provider
from app.knowledge.embeddings.base import BaseEmbeddingProvider

def test_provider_initialization():
    provider = get_embedding_provider()
    assert isinstance(provider, BaseEmbeddingProvider)
    assert provider.model_name is not None
    assert provider.dimension > 0
    assert provider.version_tag is not None

@pytest.mark.asyncio
async def test_embed_query():
    provider = get_embedding_provider()
    embedding = await provider.embed_query("test query")
    assert isinstance(embedding, list)
    assert len(embedding) == provider.dimension
    assert all(isinstance(x, float) for x in embedding)

@pytest.mark.asyncio
async def test_embed_documents():
    provider = get_embedding_provider()
    embeddings = await provider.embed_documents(["doc1", "doc2"])
    assert isinstance(embeddings, list)
    assert len(embeddings) == 2
    assert len(embeddings[0]) == provider.dimension
    assert len(embeddings[1]) == provider.dimension
