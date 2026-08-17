import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.core.config import settings
from app.db.base import Base
import app.db.models  # noqa

async def reset_cascade():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        print("Dropping schema public cascade...")
        await conn.execute(text("DROP SCHEMA public CASCADE;"))
        await conn.execute(text("CREATE SCHEMA public;"))
        # removed grant to postgres
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        
        print("Creating all tables...")
        await conn.run_sync(Base.metadata.create_all)
        print("Done!")

if __name__ == "__main__":
    asyncio.run(reset_cascade())
