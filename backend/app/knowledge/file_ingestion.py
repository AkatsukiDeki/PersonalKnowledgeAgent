import os
import uuid
import hashlib
import logging
from typing import Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..db.models import Source, FileRevision, Chunk, Claim
from ..parsers.factory import parse_file

logger = logging.getLogger(__name__)

async def ingest_file_revision(
    db: AsyncSession,
    filename: str,
    file_bytes: bytes,
    title: Optional[str] = None,
    domain: Optional[str] = None,
    importance: str = "normal",
    original_path: Optional[str] = None
) -> Tuple[Source, str]:
    """
    Ingests a file with strict versioning and SHA-256 idempotency.
    Returns (Source, status) where status is "created", "updated", or "unchanged".
    """
    if not title:
        title = os.path.splitext(filename)[0]

    # Calculate SHA-256
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    size_bytes = len(file_bytes)

    # Find logical source
    stmt = select(Source).where(Source.title == title)
    source = (await db.execute(stmt)).scalars().first()

    status = "created"

    if source:
        # Check for exact duplicate in this source
        rev_stmt = select(FileRevision).where(FileRevision.source_id == source.id, FileRevision.file_hash == file_hash)
        existing_rev = (await db.execute(rev_stmt)).scalars().first()
        if existing_rev:
            logger.info(f"[Ingestion] Exact file duplicate found for '{title}' (hash: {file_hash}). Skipping.")
            return source, "unchanged"

        status = "updated"
        source.version += 1
        source.importance = importance
        if domain:
            source.domain = domain
        
        # Deactivate old chunks and claims
        old_chunks = (await db.execute(select(Chunk).where(Chunk.source_id == source.id, Chunk.is_active == True))).scalars().all()
        for c in old_chunks:
            c.is_active = False

        old_claims = (await db.execute(select(Claim).where(Claim.source_id == source.id, Claim.is_active == True))).scalars().all()
        for c in old_claims:
            c.is_active = False
            c.lifecycle_status = "superseded"
    else:
        # Create new logical source
        source_id = uuid.uuid4()
        source = Source(
            id=source_id,
            title=title,
            source_type="file",
            importance=importance,
            domain=domain,
            version=1
        )
        db.add(source)

    await db.flush() # ensure source gets an id if new

    # Parse content
    normalised_text, file_type, metadata = parse_file(filename, file_bytes)

    # Update deprecated fields on Source for temporary backwards compatibility
    source.file_type = file_type
    source.raw_content = normalised_text
    source.content = normalised_text
    source.original_file_path = original_path
    source.metadata_info = metadata
    source.status = "pending"

    # Create new file revision
    new_rev = FileRevision(
        id=uuid.uuid4(),
        source_id=source.id,
        version=source.version,
        file_hash=file_hash,
        mime_type="application/octet-stream", # Or infer from file_type
        size_bytes=size_bytes,
        content=normalised_text
    )
    db.add(new_rev)
    await db.commit()
    await db.refresh(source)
    await db.refresh(new_rev)

    return source, status
