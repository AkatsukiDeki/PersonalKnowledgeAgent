import asyncio
import os
from sqlalchemy import select
from app.db.session import async_session_factory
from app.db.models import Chunk, Decision, ConversationMemory

async def f():
    async with async_session_factory() as db:
        print(f"Chunks: {len((await db.execute(select(Chunk))).all())}")
        print(f"Decisions: {len((await db.execute(select(Decision))).all())}")
        
        # Look at the decisions to see what was extracted
        decisions = (await db.execute(select(Decision))).scalars().all()
        for d in decisions:
            print(f"Decision: {d.decision} | Status: {d.status} | HasEmb: {d.embedding is not None}")

if __name__ == "__main__":
    asyncio.run(f())
