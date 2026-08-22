import asyncio
from sqlalchemy import text
from app.db.session import engine


async def run_migration():
    print("Applying schema updates for folders and exam mode...")
    async with engine.begin() as conn:
        # Добавляем папки в диалоги и источники
        await conn.execute(text("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS folder VARCHAR(100);"))
        await conn.execute(text("ALTER TABLE sources ADD COLUMN IF NOT EXISTS folder VARCHAR(100);"))

        # Добавляем признак освоения предмета
        await conn.execute(text("ALTER TABLE subjects ADD COLUMN IF NOT EXISTS is_mastered BOOLEAN DEFAULT FALSE;"))

        # Индексы для быстрой фильтрации по папкам
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_conversations_folder ON conversations(folder);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sources_folder ON sources(folder);"))

    print("Migration applied successfully.")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run_migration())