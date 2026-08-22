import asyncio
from app.db.session import async_session_factory
from app.db.models import Source
from app.knowledge.ingestion import process_source_chunks_bg
from sqlalchemy import select

async def reindex():
    async with async_session_factory() as db:
        res = await db.execute(select(Source))
        sources = res.scalars().all()
        for s in sources:
            print(f"Индексация: {s.title}")
            await process_source_chunks_bg(s.id)
            print(f"Готово: {s.title}")

if __name__ == "__main__":
    asyncio.run(reindex())
