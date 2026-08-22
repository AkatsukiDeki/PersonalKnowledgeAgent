import asyncio
from sqlalchemy import text
from app.db.session import engine

async def patch_importance():
    async with engine.begin() as conn:
        print("Adding importance to patterns table...")
        await conn.execute(text("ALTER TABLE patterns ADD COLUMN IF NOT EXISTS importance FLOAT DEFAULT 0.75;"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_patterns_importance ON patterns(importance);"))
        print("Done.")

if __name__ == "__main__":
    asyncio.run(patch_importance())
