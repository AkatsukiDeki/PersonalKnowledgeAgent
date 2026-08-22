import asyncio
from app.db.session import engine
from sqlalchemy import text

async def fix():
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE chunks ADD COLUMN IF NOT EXISTS metadata_info JSONB DEFAULT '{}'::jsonb;"))
        print("Column chunks.metadata_info successfully added/verified!")

if __name__ == "__main__":
    asyncio.run(fix())
