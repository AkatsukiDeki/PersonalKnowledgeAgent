from sqlalchemy import text

from .base import Base
from .models import Chunk, Source  # noqa: F401
from .session import engine


async def init_database():
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        await conn.run_sync(Base.metadata.create_all)