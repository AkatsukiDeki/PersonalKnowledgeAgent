import asyncio
from sqlalchemy import text
from app.db.session import async_session_factory

async def main():
    async with async_session_factory() as db:
        await db.execute(text("ALTER TABLE conversation_memories ADD COLUMN IF NOT EXISTS embedding vector(1024);"))
        await db.execute(text("ALTER TABLE decisions ADD COLUMN IF NOT EXISTS embedding vector(1024);"))
        await db.commit()
        print("Migration applied successfully to main DB.")

if __name__ == "__main__":
    asyncio.run(main())
