"""Direct DDL migration: add new columns to sources table via raw asyncpg."""
import asyncio
import asyncpg


async def migrate():
    conn = await asyncpg.connect(
        user="pka_user",
        password="pka_password",
        host="127.0.0.1",
        port=5433,
        database="pka_db",
    )
    print("Connected to pka_db. Running ALTER TABLE...")

    await conn.execute("""
        ALTER TABLE sources 
        ADD COLUMN IF NOT EXISTS file_type VARCHAR(20) DEFAULT 'txt',
        ADD COLUMN IF NOT EXISTS original_file_path VARCHAR(500),
        ADD COLUMN IF NOT EXISTS raw_content TEXT,
        ADD COLUMN IF NOT EXISTS domain VARCHAR(50),
        ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
        ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS metadata_info JSONB DEFAULT '{}'::jsonb;
    """)
    print("ALTER TABLE sources — OK")

    # Create indexes for new columns
    await conn.execute("CREATE INDEX IF NOT EXISTS ix_sources_domain ON sources (domain);")
    await conn.execute("CREATE INDEX IF NOT EXISTS ix_sources_is_deleted ON sources (is_deleted);")
    print("Indexes created — OK")

    # Verify
    rows = await conn.fetch(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'sources' ORDER BY ordinal_position;"
    )
    print(f"Sources table columns ({len(rows)}):")
    for r in rows:
        print(f"  - {r['column_name']}")

    await conn.close()
    print("Done!")


if __name__ == "__main__":
    asyncio.run(migrate())
