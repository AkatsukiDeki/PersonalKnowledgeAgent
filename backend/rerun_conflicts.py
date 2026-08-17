import asyncio
import logging
from sqlalchemy import select
from app.db.session import async_session_factory
from app.db.models import Claim
from app.knowledge.conflict_resolver import resolve_conflicts_for_new_claims

logging.basicConfig(level=logging.INFO)

async def rerun_conflicts():
    async with async_session_factory() as db:
        all_claims = (await db.execute(select(Claim))).scalars().all()
        claims = [c for c in all_claims if '6:00' in c.content or 'сон' in c.content.lower() or 'утро' in c.content.lower() or 'просыпа' in c.content.lower()]
    print(f"Rerunning conflicts for {len(claims)} claims locally...")
    async with async_session_factory() as db:
        await resolve_conflicts_for_new_claims(db, claims)
    print("Done resolving conflicts")

if __name__ == "__main__":
    asyncio.run(rerun_conflicts())
