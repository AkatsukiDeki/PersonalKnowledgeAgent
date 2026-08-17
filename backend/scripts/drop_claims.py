import asyncio
import sys
import os
sys.path.insert(0, 'c:/Users/Andrey/PycharmProjects/PKA/backend')
from app.db.session import async_session_factory
from app.db.models import Base
from sqlalchemy import text

async def run():
    async with async_session_factory() as db:
        await db.execute(text('DROP TABLE IF EXISTS claims CASCADE;'))
        await db.commit()
    # Now recreate all tables
    from app.db.session import engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Dropped and recreated tables successfully.")

if sys.platform.startswith('win'):
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
asyncio.run(run())
