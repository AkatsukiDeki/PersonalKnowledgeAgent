import asyncio
from sqlalchemy import select
from app.db.session import async_session_factory
from app.db.models import Subject

async def main():
    async with async_session_factory() as db:
        res = await db.execute(select(Subject))
        subjects = res.scalars().all()
        print(f"Total subjects: {len(subjects)}")
        for s in subjects:
            print(f"- {s.id}: {s.title}")

if __name__ == "__main__":
    asyncio.run(main())
