import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.core.config import settings

async def alter():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        await conn.execute(text('ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;'))
        await conn.execute(text('CREATE INDEX IF NOT EXISTS ix_conversations_is_pinned ON conversations (is_pinned);'))
        print("Done")

asyncio.run(alter())
