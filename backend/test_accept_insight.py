import asyncio
import logging
from app.db.session import async_session_factory
from sqlalchemy import select
from app.db.models import Pattern

logging.basicConfig(level=logging.INFO)

async def test_api():
    async with async_session_factory() as db:
        pending = (await db.execute(select(Pattern).where(Pattern.status == "pending_review"))).scalars().all()
        print(f"Pending count: {len(pending)}")
        
        if pending:
            p = pending[0]
            print(f"Accepting pattern: {p.title}")
            p.status = "accepted"
            await db.commit()
            print("Accepted!")

if __name__ == "__main__":
    asyncio.run(test_api())
