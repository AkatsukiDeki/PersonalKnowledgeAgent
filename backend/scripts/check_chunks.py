import asyncio
import sys
import os
sys.path.insert(0, 'c:/Users/Andrey/PycharmProjects/PKA/backend')
from app.db.session import async_session_factory
from sqlalchemy import text

async def run():
    async with async_session_factory() as db:
        res = await db.execute(text("SELECT text_content FROM chunks WHERE text_content ILIKE '%SecAutomation%'"))
        for row in res:
            print('---')
            print(row[0])

if sys.platform.startswith('win'):
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
asyncio.run(run())
