import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.core.config import settings

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        print("Running migration...")
        await conn.execute(text("""
            ALTER TABLE claims 
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
            ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES claims(id) ON DELETE SET NULL;
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_claims_is_active ON claims(is_active);
        """))
        
        await conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'ck_claim_no_self_supersede'
                ) THEN
                    ALTER TABLE claims ADD CONSTRAINT ck_claim_no_self_supersede CHECK (id != superseded_by);
                END IF;
            END $$;
        """))
        
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS claim_conflicts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                claim_a_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
                claim_b_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
                conflict_type VARCHAR(50) NOT NULL DEFAULT 'unknown',
                status VARCHAR(50) NOT NULL DEFAULT 'unresolved',
                resolution_summary TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE
            );
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_claim_conflicts_status ON claim_conflicts(status);
        """))
        print("Migration complete!")

if __name__ == "__main__":
    asyncio.run(main())
