import asyncio
from sqlalchemy import text
from app.db.session import engine

async def create_insights_table():
    print("Creating insights table...")
    async with engine.begin() as conn:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS insights (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                insight_type VARCHAR(50) NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                evidence_links JSONB DEFAULT '[]'::jsonb,
                domains_involved JSONB DEFAULT '[]'::jsonb,
                importance_score FLOAT DEFAULT 0.5,
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
            );
        """))
    print("Insights table created.")

if __name__ == "__main__":
    asyncio.run(create_insights_table())
