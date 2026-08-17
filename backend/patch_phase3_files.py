import asyncio
import hashlib
import uuid
from sqlalchemy import text
from app.db.base import Base
from app.db.session import engine
from app.db.models import Source, FileRevision, Chunk
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

async def run_migration():
    async with engine.begin() as conn:
        print("Creating new tables and columns...")
        await conn.run_sync(Base.metadata.create_all)
        # Add new columns to sources if they don't exist
        try:
            await conn.execute(text("ALTER TABLE sources ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL"))
        except Exception as e:
            print(f"Column is_active might already exist: {e}")
        try:
            await conn.execute(text("ALTER TABLE chunks ADD COLUMN IF NOT EXISTS revision_id UUID REFERENCES file_revisions(id) ON DELETE CASCADE"))
        except Exception as e:
            print(f"Column revision_id might already exist: {e}")

    async with AsyncSession(engine) as db:
        print("Migrating sources to file_revisions...")
        sources_res = await db.execute(select(Source))
        sources = sources_res.scalars().all()
        
        for source in sources:
            if not source.content:
                continue
                
            # Check if revision already exists
            existing_rev = await db.execute(select(FileRevision).where(FileRevision.source_id == source.id))
            if existing_rev.scalars().first():
                continue

            content_bytes = source.content.encode('utf-8')
            file_hash = hashlib.sha256(content_bytes).hexdigest()
            size_bytes = len(content_bytes)

            rev = FileRevision(
                id=uuid.uuid4(),
                source_id=source.id,
                version=1,
                file_hash=file_hash,
                mime_type="text/plain",
                size_bytes=size_bytes,
                content=source.content
            )
            db.add(rev)
            await db.flush() # get rev.id

            # Link chunks to this revision
            chunks_res = await db.execute(select(Chunk).where(Chunk.source_id == source.id))
            chunks = chunks_res.scalars().all()
            for chunk in chunks:
                chunk.revision_id = rev.id

        await db.commit()
        print("Migration completed successfully.")

if __name__ == "__main__":
    asyncio.run(run_migration())
