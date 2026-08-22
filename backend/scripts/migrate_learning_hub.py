import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import settings
from app.db.base import Base
# Ensure all models are imported so they are registered in Base.metadata
from app.db.models import *

async def run():
    engine = create_async_engine(settings.DATABASE_URL)

    async with engine.begin() as conn:
        # Create all new tables based on metadata (won't drop existing ones)
        await conn.run_sync(Base.metadata.create_all)
        print("Success: Таблицы Learning Hub (subjects, etc) созданы или обновлены.")

        # Ensure conversation has subject_id
        try:
            await conn.execute(text("ALTER TABLE conversations ADD COLUMN subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL;"))
            print("Success: Добавлена колонка subject_id в conversations.")
        except Exception as e:
            print(f"Информация: {e} (Возможно колонка уже существует)")

    await engine.dispose()

if __name__ == "__main__":
    if sys.platform.startswith("win"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(run())
