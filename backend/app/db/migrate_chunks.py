import asyncio
import sys
from sqlalchemy import text

from .session import engine


async def run():
    async with engine.begin() as conn:
        # 1. Добавляем tsv, если его нет, и создаем индекс
        await conn.execute(text("ALTER TABLE chunks ADD COLUMN IF NOT EXISTS tsv TSVECTOR;"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_chunks_tsv ON chunks USING gin(tsv);"))

        # 2. Добавляем колонки дат, если их нет
        await conn.execute(text("ALTER TABLE chunks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;"))
        await conn.execute(text("ALTER TABLE chunks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;"))

        # 3. Принудительно задаем дефолтные значения уровня базы данных
        await conn.execute(text("ALTER TABLE chunks ALTER COLUMN created_at SET DEFAULT NOW();"))
        await conn.execute(text("ALTER TABLE chunks ALTER COLUMN updated_at SET DEFAULT NOW();"))

        # 4. Заполняем существующие NULL-значения текущей датой, если такие строки есть
        await conn.execute(text("UPDATE chunks SET created_at = NOW() WHERE created_at IS NULL;"))
        await conn.execute(text("UPDATE chunks SET updated_at = NOW() WHERE updated_at IS NULL;"))

        print("✓ Успешно: DEFAULT NOW() выставлен для created_at и updated_at в таблице chunks.")


if __name__ == "__main__":
    if sys.platform.startswith("win"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(run())