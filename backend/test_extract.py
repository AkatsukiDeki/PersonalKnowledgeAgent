import asyncio
from app.db.session import async_session_factory
from sqlalchemy import select
from app.db.models import Source
from app.knowledge.ingestion import process_source_chunks_bg
import logging

logging.basicConfig(level=logging.INFO)

async def test_extract():
    async with async_session_factory() as db:
        stmt = select(Source.id).limit(1)
        result = await db.execute(stmt)
        source_id = result.scalar_one_or_none()
        
    if not source_id:
        print("No sources found!")
        return
        
    print(f"Testing extraction for source_id: {source_id}")
    await process_source_chunks_bg(source_id)
    print("Done!")

if __name__ == "__main__":
    asyncio.run(test_extract())
