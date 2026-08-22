"""Direct DDL migration: add versioning columns to chunks table via raw asyncpg."""
import asyncio
import asyncpg


async def migrate_chunks():
    conn = await asyncpg.connect(
        user="pka_user",
        password="pka_password",
        host="127.0.0.1",
        port=5433,
        database="pka_db",
    )
    print("Connected to pka_db. Running ALTER TABLE for chunks...")

    await conn.execute("""
        ALTER TABLE chunks 
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
        ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES chunks(id) ON DELETE SET NULL;
    """)
    print("ALTER TABLE chunks — OK")

    # Create indexes for new columns
    await conn.execute("CREATE INDEX IF NOT EXISTS ix_chunks_is_active ON chunks (is_active);")
    print("Indexes created — OK")

    # Verify
    rows = await conn.fetch(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'chunks' ORDER BY ordinal_position;"
    )
    print(f"Chunks table columns ({len(rows)}):")
    for r in rows:
        print(f"  - {r['column_name']}")

    await conn.close()
    print("Done!")


if __name__ == "__main__":
    asyncio.run(migrate_chunks())
