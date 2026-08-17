import asyncio
from sqlalchemy import select
from app.db.session import async_session_factory
from app.db.models import Claim, Pattern

async def count_things():
    async with async_session_factory() as db:
        claims = (await db.execute(select(Claim))).scalars().all()
        print(f"Total claims: {len(claims)}")
        for c in claims:
            print(f"- {c.claim_type} ({c.category}): {c.content}")

        patterns = (await db.execute(select(Pattern))).scalars().all()
        print(f"Total patterns: {len(patterns)}")

if __name__ == "__main__":
    asyncio.run(count_things())
