import asyncio
from app.db.base import Base
from app.db.session import engine
from app.db.models import TimelineEvent

async def run_migration():
    async with engine.begin() as conn:
        print("Creating TimelineEvent table...")
        await conn.run_sync(Base.metadata.create_all)
        print("Done.")

if __name__ == "__main__":
    asyncio.run(run_migration())
