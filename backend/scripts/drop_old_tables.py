import asyncio
import sys
from pathlib import Path
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.core.config import settings

async def drop_tables():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        await conn.execute(text("DROP TABLE IF EXISTS messages CASCADE;"))
        await conn.execute(text("DROP TABLE IF EXISTS conversation_memories CASCADE;"))
        await conn.execute(text("DROP TABLE IF EXISTS conversations CASCADE;"))
        await conn.execute(text("DROP TABLE IF EXISTS conversation_messages CASCADE;"))
        await conn.execute(text("DROP TABLE IF EXISTS conversation_segments CASCADE;"))
        await conn.execute(text("DROP TABLE IF EXISTS decisions CASCADE;"))
    print("Tables dropped.")
    await engine.dispose()

if __name__ == "__main__":
    if sys.platform.startswith("win"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(drop_tables())
