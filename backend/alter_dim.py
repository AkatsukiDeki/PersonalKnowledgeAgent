import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.core.config import settings

async def alter_embedding_dim():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE chunks ALTER COLUMN embedding TYPE vector(1024);"))
            print("Successfully altered embedding dimension to 1024.")
        except Exception as e:
            print(f"Error altering dimension: {e}")
            
if __name__ == "__main__":
    asyncio.run(alter_embedding_dim())
