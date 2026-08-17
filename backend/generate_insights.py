import asyncio
import logging
from app.db.session import async_session_factory
from app.knowledge.insight_engine import generate_proactive_insights

logging.basicConfig(level=logging.INFO)

async def test_insights():
    async with async_session_factory() as db:
        insights = await generate_proactive_insights(db)
        print(f"Generated {len(insights)} candidate insights.")
        for i in insights:
            print(f"- {i.title}")

if __name__ == "__main__":
    asyncio.run(test_insights())
