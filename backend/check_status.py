import asyncio
from sqlalchemy import func, select
from app.db.session import async_session_factory
from app.db.models import Source, Chunk, Claim, Entity, ClaimRelation, Pattern, SystemError

async def check_system_state():
    async with async_session_factory() as db:
        sources_cnt = (await db.execute(select(func.count(Source.id)))).scalar()
        chunks_cnt = (await db.execute(select(func.count(Chunk.id)))).scalar()
        claims_cnt = (await db.execute(select(func.count(Claim.id)))).scalar()
        entities_cnt = (await db.execute(select(func.count(Entity.id)))).scalar()
        relations_cnt = (await db.execute(select(func.count(ClaimRelation.id)))).scalar()
        patterns_cnt = (await db.execute(select(func.count(Pattern.id)))).scalar()
        
        errors_open = (await db.execute(select(func.count(SystemError.id)).where(SystemError.status == "open"))).scalar()
        errors_total = (await db.execute(select(func.count(SystemError.id)))).scalar()

        print("=" * 40)
        print("ТЕКУЩЕЕ СОСТОЯНИЕ БАЗЫ ДАННЫХ PKA")
        print("=" * 40)
        print(f"Источники (Sources):    {sources_cnt}")
        print(f"Чанки (Chunks):         {chunks_cnt}")
        print(f"Утверждения (Claims):   {claims_cnt}")
        print(f"Сущности (Entities):    {entities_cnt}")
        print(f"Связи (Relations):      {relations_cnt}")
        print(f"Паттерны (Patterns):    {patterns_cnt}")
        print("-" * 40)
        print(f"Системные ошибки (Open):  {errors_open}")
        print(f"Всего ошибок в реестре:   {errors_total}")
        print("=" * 40)

if __name__ == "__main__":
    asyncio.run(check_system_state())
