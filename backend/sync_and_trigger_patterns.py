import asyncio
from sqlalchemy import select, update
from app.db.session import async_session_factory
from app.db.models import Claim, Pattern
from app.knowledge.pattern_engine import run_pattern_discovery_pipeline

async def main():
    async with async_session_factory() as db:
        res = await db.execute(select(Claim))
        claims = res.scalars().all()
        
        updated = 0
        for c in claims:
            if c.claim_type in ["programming", "work", "study", "devops"]:
                c.category = c.claim_type
                c.claim_type = "decision"
                updated += 1
            # If the current type is one of the new valid types or none, we can keep it
        
        await db.commit()
        print(f"Обновлено {updated} утверждений.")

    print("Запуск генерации L3-инсайтов...")
    async with async_session_factory() as db:
        await run_pattern_discovery_pipeline(db)

    async with async_session_factory() as db:
        patterns = (await db.execute(select(Pattern))).scalars().all()
        print("=" * 40)
        print(f"Сгенерировано паттернов (L3): {len(patterns)}")
        for p in patterns:
            status_val = getattr(p, 'status', 'new')
            print(f"- [{status_val}] {p.title} (conf: {p.confidence}): {p.description[:100]}...")
        print("=" * 40)

if __name__ == "__main__":
    asyncio.run(main())
