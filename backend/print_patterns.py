import asyncio
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from sqlalchemy import select
from app.db.session import async_session_factory
from app.db.models import Pattern

async def main():
    async with async_session_factory() as db:
        patterns = (await db.execute(select(Pattern))).scalars().all()
        for p in patterns:
            status_val = getattr(p, 'status', 'new')
            print(f"- [{status_val}] {p.title} (conf: {p.confidence}): {p.description}")

if __name__ == "__main__":
    asyncio.run(main())
