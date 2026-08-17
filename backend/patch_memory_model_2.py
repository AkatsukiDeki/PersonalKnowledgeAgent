import asyncio
import math
from sqlalchemy import text, select
from app.db.session import engine, async_session_factory
from app.db.models import Claim

IMPORTANCE_WEIGHTS = {
    "temporary": 0.5,
    "normal": 1.0,
    "important": 1.5,
    "critical": 2.0
}

def calculate_memory_score(
    confidence: float = 1.0,
    stability: float = 0.5,
    importance: float = 1.0,
    recurrence: int = 1,
    w_c: float = 0.35,
    w_s: float = 0.25,
    w_r: float = 0.20,
    w_i: float = 0.20
) -> float:
    # Нормализация повторений: ln(recurrence + 1) / ln(5), срез на 1.0
    rec_factor = min(1.0, math.log(recurrence + 1) / math.log(5))
    # Нормализация importance в диапазон [0.25, 1.0] для взвешивания
    imp_norm = min(1.0, importance / 2.0)
    
    score = (w_c * confidence) + (w_s * stability) + (w_r * rec_factor) + (w_i * imp_norm)
    return round(score, 3)

async def apply_migration():
    print("Применение миграции Memory Model 2.0...")
    
    async with engine.begin() as conn:
        # 1. Обновление таблицы sources
        await conn.execute(text("ALTER TABLE sources ADD COLUMN IF NOT EXISTS importance VARCHAR(20) DEFAULT 'normal';"))
        await conn.execute(text("ALTER TABLE sources ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sources_importance ON sources(importance);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sources_file_hash ON sources(file_hash);"))

        # 2. Обновление таблицы claims
        await conn.execute(text("ALTER TABLE claims ADD COLUMN IF NOT EXISTS kind VARCHAR(50) DEFAULT 'fact';"))
        await conn.execute(text("ALTER TABLE claims ADD COLUMN IF NOT EXISTS scope VARCHAR(50) DEFAULT 'global';"))
        await conn.execute(text("ALTER TABLE claims ADD COLUMN IF NOT EXISTS stability FLOAT DEFAULT 0.5;"))
        await conn.execute(text("ALTER TABLE claims ADD COLUMN IF NOT EXISTS importance FLOAT DEFAULT 1.0;"))
        await conn.execute(text("ALTER TABLE claims ADD COLUMN IF NOT EXISTS recurrence INTEGER DEFAULT 1;"))
        await conn.execute(text("ALTER TABLE claims ADD COLUMN IF NOT EXISTS memory_score FLOAT DEFAULT 0.5;"))
        await conn.execute(text("ALTER TABLE claims ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(20) DEFAULT 'active';"))
        await conn.execute(text("ALTER TABLE claims ADD COLUMN IF NOT EXISTS valid_from TIMESTAMP WITHOUT TIME ZONE;"))
        await conn.execute(text("ALTER TABLE claims ADD COLUMN IF NOT EXISTS valid_to TIMESTAMP WITHOUT TIME ZONE;"))
        
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_claims_kind ON claims(kind);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_claims_memory_score ON claims(memory_score);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_claims_lifecycle_status ON claims(lifecycle_status);"))

        # 3. Обновление индексов claim_relations
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_claim_relations_relation_type ON claim_relations(relation_type);"))

    # 4. Начальный пересчет memory_score для существующих claims
    async with async_session_factory() as db:
        res = await db.execute(select(Claim))
        claims = res.scalars().all()
        print(f"Пересчет метрик для {len(claims)} существующих утверждений...")
        
        for c in claims:
            # Наследуем значения по умолчанию
            c.stability = 0.7 if c.kind in ["decision", "habit", "preference"] else 0.5
            c.importance = 1.0
            c.recurrence = 1
            c.memory_score = calculate_memory_score(
                confidence=c.confidence or 1.0,
                stability=c.stability,
                importance=c.importance,
                recurrence=c.recurrence
            )
            c.lifecycle_status = "active"

        await db.commit()

    print("Миграция Memory Model 2.0 успешно выполнена.")

if __name__ == "__main__":
    asyncio.run(apply_migration())
