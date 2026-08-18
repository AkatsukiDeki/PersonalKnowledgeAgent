import asyncio
import os
import json
from app.db.session import async_session_factory
from app.knowledge.chat_pipeline import process_chat_pipeline
from app.db.models import ConversationMemory, Decision
from sqlalchemy import select
import logging

logging.basicConfig(level=logging.INFO)

async def test_chat():
    async with async_session_factory() as db:
        with open("tests/evaluation/corpus/chat1.json", "r", encoding="utf-8") as f:
            data = json.load(f)
        await process_chat_pipeline(db, data, title="chat1.json")
        
        mems = (await db.execute(select(ConversationMemory))).scalars().all()
        for m in mems:
            print(f"Memory Outcome: {m.outcome}")
            
        decs = (await db.execute(select(Decision))).scalars().all()
        for d in decs:
            print(f"Decision: {d.decision}")

if __name__ == "__main__":
    asyncio.run(test_chat())
