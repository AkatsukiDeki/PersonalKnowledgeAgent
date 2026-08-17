import asyncio
from sqlalchemy import select, func
from app.db.session import async_session_factory
from app.db.models import Claim, ClaimConflict

async def count_all():
    async with async_session_factory() as db:
        claims = await db.scalar(select(func.count(Claim.id)))
        conflicts = await db.scalar(select(func.count(ClaimConflict.id)))
        print(f"Total claims: {claims}")
        print(f"Total conflicts: {conflicts}")

if __name__ == "__main__":
    asyncio.run(count_all())
