import asyncio
from sqlalchemy import text
from app.db.session import engine

async def apply_migration():
    print("Adding is_pinned column to conversations table...")
    
    async with engine.begin() as conn:
        await conn.execute(text("""
            ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
        """))

    print("Migration applied successfully.")

if __name__ == "__main__":
    asyncio.run(apply_migration())
