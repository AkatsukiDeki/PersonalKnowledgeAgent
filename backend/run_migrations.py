import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import settings


async def run():
    engine = create_async_engine(settings.DATABASE_URL)

    async with engine.begin() as conn:
        # Устанавливаем дефолтное автозаполнение дат в PostgreSQL
        await conn.execute(text("ALTER TABLE sources ALTER COLUMN created_at SET DEFAULT NOW();"))
        await conn.execute(text("ALTER TABLE sources ALTER COLUMN updated_at SET DEFAULT NOW();"))
        print("✓ Успешно: DEFAULT NOW() установлен для created_at и updated_at.")

        # Phase 2 migrations
        await conn.execute(text("ALTER TABLE sources ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'pending' NOT NULL;"))
        await conn.execute(text("ALTER TABLE sources ADD COLUMN IF NOT EXISTS error_message TEXT;"))
        await conn.execute(text("ALTER TABLE sources ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITHOUT TIME ZONE;"))
        await conn.execute(text("ALTER TABLE sources ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITHOUT TIME ZONE;"))
        print("✓ Успешно: Добавлены статусные колонки в sources.")

        # HNSW Index migration
        await conn.execute(text("DROP INDEX IF EXISTS ix_chunks_embedding;"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);"))
        print("✓ Успешно: Индекс ix_chunks_embedding обновлен на HNSW.")

    await engine.dispose()


if __name__ == "__main__":
    if sys.platform.startswith("win"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(run())