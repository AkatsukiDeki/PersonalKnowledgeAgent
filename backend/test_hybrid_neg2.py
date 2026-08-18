import asyncio
import uuid
from app.db.session import async_session_factory
from sqlalchemy import select
from app.db.models import Decision, ConversationMemory
from app.knowledge.embeddings.factory import get_embedding_provider

async def test():
    provider = get_embedding_provider()
    query_emb = await provider.embed_query("Какой брокер сообщений мы выбрали: Kafka или RabbitMQ?")
    async with async_session_factory() as db:
        dec_stmt = (
            select(Decision, Decision.embedding.cosine_distance(query_emb).label("distance"))
            .where(Decision.embedding.is_not(None))
        )
        for dec, dist in (await db.execute(dec_stmt)).all():
            print(f"Dec Similarity: {1.0 - dist:.3f} | {dec.decision}")
            
        mem_stmt = (
            select(ConversationMemory, ConversationMemory.embedding.cosine_distance(query_emb).label("distance"))
            .where(ConversationMemory.embedding.is_not(None))
        )
        for mem, dist in (await db.execute(mem_stmt)).all():
            print(f"Mem Similarity: {1.0 - dist:.3f} | {mem.summary[:50]}")

if __name__ == "__main__":
    asyncio.run(test())
