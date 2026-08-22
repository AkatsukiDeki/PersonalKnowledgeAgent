import asyncio
import os
from sqlalchemy import text

os.environ["DATABASE_URL"] = "postgresql+asyncpg://pka_user:pka_password@localhost:5434/personal_ai"

from app.db.session import async_session_factory

async def main():
    async with async_session_factory() as db:
        await db.execute(text("ALTER TABLE conversation_memories ADD COLUMN IF NOT EXISTS embedding vector(1024);"))
        await db.execute(text("ALTER TABLE decisions ADD COLUMN IF NOT EXISTS embedding vector(1024);"))
        await db.commit()
        print("Migration applied successfully to main DB.")
        
    os.environ["DATABASE_URL"] = "postgresql+asyncpg://pka_user:pka_password@localhost:5434/personal_ai_test"
    from app.db.session import async_session_factory as test_factory
    async with test_factory() as db2:
        try:
            await db2.execute(text("ALTER TABLE conversation_memories ADD COLUMN IF NOT EXISTS embedding vector(1024);"))
            await db2.execute(text("ALTER TABLE decisions ADD COLUMN IF NOT EXISTS embedding vector(1024);"))
            await db2.commit()
            print("Migration applied successfully to test DB.")
        except Exception as e:
            print(f"Test db migration failed (maybe doesn't exist yet): {e}")

if __name__ == "__main__":
    asyncio.run(main())
