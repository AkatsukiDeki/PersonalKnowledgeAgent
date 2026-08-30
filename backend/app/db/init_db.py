from sqlalchemy import text

from .base import Base
from . import models  # Import all models to register with Base.metadata
from .session import engine


async def init_database():
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        await conn.run_sync(Base.metadata.create_all)