"""Quick DDL reset: drop all tables and recreate them from models.py.
Run this once after adding new columns to the Source model.
WARNING: This will DELETE all data in the database.
"""
import asyncio
from app.db.session import engine
from app.db.base import Base
# Import all models so they register with Base.metadata
import app.db.models  # noqa: F401


async def reset_db():
    async with engine.begin() as conn:
        print("Dropping all tables...")
        await conn.run_sync(Base.metadata.drop_all)
        print("Creating all tables with updated schema...")
        await conn.run_sync(Base.metadata.create_all)
        print("Done! Database schema has been reset.")


if __name__ == "__main__":
    asyncio.run(reset_db())
