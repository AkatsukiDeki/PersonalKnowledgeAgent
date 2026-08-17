import pytest
import uuid
import hashlib
from app.db.models import Source, FileRevision, Chunk, Claim
from sqlalchemy import select
from app.knowledge.file_ingestion import ingest_file_revision

@pytest.mark.asyncio
async def test_file_ingestion_idempotency(db_session):
    filename = "test_doc.md"
    content1 = b"# Hello World\nThis is a test."
    title = "test_doc"

    # First ingestion
    source1, status1 = await ingest_file_revision(
        db=db_session,
        filename=filename,
        file_bytes=content1,
        title=title,
        domain="test",
        importance="normal"
    )

    assert status1 == "created"
    assert source1.version == 1
    assert source1.title == title
    assert source1.importance == "normal"

    # Find the revision
    revs = (await db_session.execute(select(FileRevision).where(FileRevision.source_id == source1.id))).scalars().all()
    assert len(revs) == 1
    assert revs[0].version == 1

    # Ingest same file again
    source2, status2 = await ingest_file_revision(
        db=db_session,
        filename=filename,
        file_bytes=content1,
        title=title,
        domain="test",
        importance="important"
    )

    assert status2 == "unchanged"
    assert source2.id == source1.id
    assert source2.version == 1 # Version should not bump

    # Ingest updated file
    content2 = b"# Hello World\nThis is an updated test."
    source3, status3 = await ingest_file_revision(
        db=db_session,
        filename=filename,
        file_bytes=content2,
        title=title,
        domain="test",
        importance="important"
    )

    assert status3 == "updated"
    assert source3.id == source1.id
    assert source3.version == 2
    assert source3.importance == "important"

    # There should now be two revisions
    revs = (await db_session.execute(select(FileRevision).where(FileRevision.source_id == source1.id))).scalars().all()
    assert len(revs) == 2
