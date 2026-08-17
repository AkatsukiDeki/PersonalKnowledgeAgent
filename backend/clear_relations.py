import asyncio
from app.db.session import engine
from sqlalchemy import text

async def clear_relations():
    async with engine.begin() as conn:
        print("Clearing claim_relations table...")
        await conn.execute(text("TRUNCATE TABLE claim_relations CASCADE"))
        print("Done.")

if __name__ == "__main__":
    asyncio.run(clear_relations())
