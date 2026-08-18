import asyncio
from app.db.session import async_session_factory
from app.knowledge.retrieval import hybrid_search

async def test():
    async with async_session_factory() as db:
        q = "Какой брокер сообщений мы выбрали: Kafka или RabbitMQ?"
        res = await hybrid_search(db, q, q, limit=5)
        for r in res:
            print(f"Similarity: {r.get('similarity'):.3f}, text: {r.get('text_content')[:100]}")

if __name__ == "__main__":
    asyncio.run(test())
