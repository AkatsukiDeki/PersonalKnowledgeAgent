import asyncio
import uuid
from sqlalchemy import select
from app.db.session import async_session_factory
from app.db.models import Chunk, Source

async def test_insert():
    async with async_session_factory() as db:
        # get any source
        res = await db.execute(select(Source).limit(1))
        source = res.scalar_one_or_none()
        if not source:
            print("No source")
            return
        
        # Test 1: with id
        db_chunk1 = Chunk(
            id=uuid.uuid4(),
            source_id=source.id,
            chunk_index=999,
            text_content="Test 1",
            is_active=True
        )
        db.add(db_chunk1)
        try:
            await db.flush()
            print("Test 1 succeeded")
        except Exception as e:
            print(f"Test 1 failed: {e}")
        finally:
            await db.rollback()

if __name__ == "__main__":
    asyncio.run(test_insert())
