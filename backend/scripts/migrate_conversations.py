import asyncio
import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.db.session import engine

async def run_migration():
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS folder VARCHAR(255);"))
        print("Migration successful: added folder column to conversations.")
    except Exception as e:
        print(f"Migration failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(run_migration())
