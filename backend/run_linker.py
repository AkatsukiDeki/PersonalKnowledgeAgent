import asyncio
from app.db.session import async_session_factory
from app.knowledge.graph_linker import relink_durable_claims

async def run():
    async with async_session_factory() as db:
        await relink_durable_claims(db)
        print("Relinking completed.")

if __name__ == "__main__":
    asyncio.run(run())
