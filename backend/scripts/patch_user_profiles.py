import asyncio
from sqlalchemy import text
from app.db.session import engine

async def apply_migration():
    print("Создание таблицы user_profiles...")
    
    async with engine.begin() as conn:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS user_profiles (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                role VARCHAR(255),
                stack JSONB,
                invariants TEXT,
                learning_style TEXT,
                projects TEXT,
                is_seeded BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
                updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
            );
        """))

    print("Таблица user_profiles успешно создана.")

if __name__ == "__main__":
    asyncio.run(apply_migration())
