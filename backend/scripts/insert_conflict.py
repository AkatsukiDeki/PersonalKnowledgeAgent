import asyncio
from app.db.session import async_session_factory
from app.db.models import ClaimConflict, Claim
from sqlalchemy import select

async def insert_conflict():
    async with async_session_factory() as db:
        all_claims = (await db.execute(select(Claim))).scalars().all()
        claims = [c for c in all_claims if '6:00' in c.content or 'сон' in c.content.lower() or 'утро' in c.content.lower() or 'просыпа' in c.content.lower()]
        if len(claims) >= 2:
            conflict = ClaimConflict(
                claim_a_id=claims[0].id,
                claim_b_id=claims[1].id,
                status="unresolved",
                resolution_summary="DIRECT_CONTRADICTION: One claim suggests waking up at 6:00 is essential, while the other contradicts it based on circadian rhythms."
            )
            db.add(conflict)
            await db.commit()
            print("Inserted conflict manually.")
        else:
            print("Not enough claims found.")

asyncio.run(insert_conflict())
