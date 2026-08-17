import asyncio
import logging
from app.db.session import async_session_factory
from app.knowledge.timeline_engine import build_timeline_events

logging.basicConfig(level=logging.INFO)

async def rebuild():
    async with async_session_factory() as db:
        await build_timeline_events(db)
        print("Timeline rebuild finished")

if __name__ == "__main__":
    asyncio.run(rebuild())
