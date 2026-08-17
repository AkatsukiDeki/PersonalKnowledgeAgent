import asyncio
import logging
from sqlalchemy import select
from app.db.session import async_session_factory
from app.db.models import Source
from app.api.sources import _safe_reindex

logging.basicConfig(level=logging.INFO)

async def reindex_pending():
    async with async_session_factory() as db:
        sources = (await db.execute(select(Source).where(Source.status == 'pending'))).scalars().all()
    print(f"Reindexing {len(sources)} pending sources locally...")
    for s in sources:
        print(f"Processing {s.id} ({s.title})...")
        await _safe_reindex(s.id)
    print("Done reindexing all")

if __name__ == "__main__":
    asyncio.run(reindex_pending())
