import asyncio
import sys
from app.db.session import engine
from app.db.models import Base
from sqlalchemy import text

async def recreate_planner_tables():
    async with engine.begin() as conn:
        print("Dropping planner tables...")
        await conn.execute(text("DROP TABLE IF EXISTS planner_tasks CASCADE;"))
        await conn.execute(text("DROP TABLE IF EXISTS planner_sprints CASCADE;"))
        await conn.execute(text("DROP TABLE IF EXISTS planner_goals CASCADE;"))
        await conn.execute(text("DROP TABLE IF EXISTS planner_domains CASCADE;"))
        
        # Also drop the enum LifeDomain if it exists
        await conn.execute(text("DROP TYPE IF EXISTS lifedomain CASCADE;"))
        
        print("Creating all tables...")
        await conn.run_sync(Base.metadata.create_all)
        print("Done!")

if __name__ == "__main__":
    asyncio.run(recreate_planner_tables())
