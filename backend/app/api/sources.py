"""Sources API v2.0 — upload, list, get, edit, soft-delete documents."""

import os
import uuid
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, UploadFile, File, Form, Query
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Source, Chunk, Claim
from ..db.session import get_db
from ..knowledge.ingestion import create_source_db, process_source_chunks_bg
from ..knowledge.file_ingestion import ingest_file_revision
from ..schemas.source import SourceCreate, SourceResponse, SourceDetailResponse, SourceUpdateContent
from ..parsers.factory import parse_file, is_supported, get_file_extension

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sources", tags=["Sources"])

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "sources")


def _ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


# ──────────────────────────────────────────────
#  POST /sources/upload  — multipart file upload
# ──────────────────────────────────────────────
@router.post("/upload", response_model=SourceResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_source(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    domain: Optional[str] = Form(None),
    importance: str = Form("normal"),
    db: AsyncSession = Depends(get_db),
):
    """Upload a file, parse it, persist the original binary, and kick off the ingestion pipeline."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    if not is_supported(file.filename):
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.filename}")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    # 1. Save the original binary to disk temporarily or permanently
    # (We can use a random uuid for the temp path if it's new, but we'll store it under Source ID)
    _ensure_data_dir()
    
    # 2. Call idempotency ingestion
    title = os.path.splitext(file.filename)[0]
    
    try:
        source, ingest_status = await ingest_file_revision(
            db=db,
            filename=file.filename,
            file_bytes=file_bytes,
            title=title,
            domain=domain,
            importance=importance,
            original_path=None # We will update this below
        )
    except Exception as e:
        logger.error(f"[Sources] Parse/Ingest error for {file.filename}: {e}")
        raise HTTPException(status_code=422, detail=f"Failed to ingest file: {e}")

    # Now that we have a source_id, save the file properly
    source_dir = os.path.join(DATA_DIR, str(source.id))
    os.makedirs(source_dir, exist_ok=True)
    original_path = os.path.join(source_dir, file.filename)
    if ingest_status != "unchanged":
        with open(original_path, "wb") as f:
            f.write(file_bytes)
        source.original_file_path = original_path
        await db.commit()

    # 3. Kick off background ingestion only if changed
    if ingest_status != "unchanged":
        background_tasks.add_task(process_source_chunks_bg, source.id)

    chunks_count = await _count(db, Chunk, Chunk.source_id == source.id)
    claims_count = await _count(db, Claim, Claim.source_id == source.id)
    return _enrich_source_response(source, chunks_count, claims_count)


# ──────────────────────────────────────────────
#  POST /sources/  — legacy JSON text create
# ──────────────────────────────────────────────
@router.post("/", response_model=SourceResponse, status_code=status.HTTP_202_ACCEPTED)
@router.post("", response_model=SourceResponse, status_code=status.HTTP_202_ACCEPTED, include_in_schema=False)
async def create_source(payload: SourceCreate, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    try:
        source, ingest_status = await ingest_file_revision(
            db=db,
            filename=payload.title + ".txt",
            file_bytes=payload.content.encode('utf-8'),
            title=payload.title,
            domain=payload.meta_info.get("domain", None),
            importance=payload.meta_info.get("importance", "normal"),
            original_path=None
        )
        
        source.source_type = payload.source_type
        if payload.meta_info:
            source.meta_info = payload.meta_info
            
        await db.commit()
        await db.refresh(source)

        if ingest_status != "unchanged":
            background_tasks.add_task(process_source_chunks_bg, source.id)
            
        chunks_count = await _count(db, Chunk, Chunk.source_id == source.id)
        claims_count = await _count(db, Claim, Claim.source_id == source.id)
        return _enrich_source_response(source, chunks_count, claims_count)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
#  GET /sources/  — list with filters
# ──────────────────────────────────────────────
@router.get("/", response_model=List[SourceResponse])
@router.get("", response_model=List[SourceResponse], include_in_schema=False)
async def list_sources(
    domain: Optional[str] = Query(None),
    file_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    include_deleted: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """List sources with optional filtering."""
    stmt = select(Source).order_by(Source.created_at.desc())

    if not include_deleted:
        stmt = stmt.where(Source.is_deleted == False)
    if domain:
        stmt = stmt.where(Source.domain == domain)
    if file_type:
        stmt = stmt.where(Source.file_type == file_type)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(or_(Source.title.ilike(pattern), Source.content.ilike(pattern)))

    result = await db.execute(stmt)
    sources = result.scalars().all()

    # Batch fetch counts
    enriched = []
    for src in sources:
        chunks_count = await _count(db, Chunk, Chunk.source_id == src.id)
        claims_count = await _count(db, Claim, Claim.source_id == src.id)
        enriched.append(_enrich_source_response(src, chunks_count, claims_count))

    return enriched


# ──────────────────────────────────────────────
#  GET /sources/{id}  — detail view
# ──────────────────────────────────────────────
@router.get("/{source_id}", response_model=SourceDetailResponse)
async def get_source_detail(source_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Full detail of a source including chunks and claims."""
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    # Fetch chunks
    chunks_stmt = select(Chunk).where(Chunk.source_id == source_id).order_by(Chunk.chunk_index)
    chunks = (await db.execute(chunks_stmt)).scalars().all()

    # Fetch claims
    claims_stmt = select(Claim).where(Claim.source_id == source_id).order_by(Claim.created_at.desc())
    claims = (await db.execute(claims_stmt)).scalars().all()

    resp = SourceDetailResponse(
        id=source.id,
        title=source.title,
        content=source.content,
        source_type=source.source_type,
        meta_info=source.meta_info,
        file_type=source.file_type,
        original_file_path=source.original_file_path,
        raw_content=source.raw_content,
        domain=source.domain,
        version=source.version,
        is_deleted=source.is_deleted,
        metadata_info=source.metadata_info,
        status=source.status,
        error_message=source.error_message,
        started_at=source.started_at,
        completed_at=source.completed_at,
        created_at=source.created_at,
        updated_at=source.updated_at,
        chunks_count=len(chunks),
        claims_count=len(claims),
        chunks=[{"id": str(c.id), "chunk_index": c.chunk_index, "text_content": c.text_content[:300]} for c in chunks],
        claims=[{
            "id": str(c.id),
            "content": c.content,
            "claim_type": c.claim_type,
            "category": c.category,
            "confidence": c.confidence,
            "is_active": c.is_active,
            "superseded_by": str(c.superseded_by) if c.superseded_by else None,
        } for c in claims],
    )
    return resp


# ──────────────────────────────────────────────
#  PUT /sources/{id}  — edit & safe re-index
# ──────────────────────────────────────────────
@router.put("/{source_id}", response_model=SourceResponse)
async def update_source_content(
    source_id: uuid.UUID,
    payload: SourceUpdateContent,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Save edited normalised text and trigger safe re-index pipeline."""
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    if source.is_deleted:
        raise HTTPException(status_code=400, detail="Cannot edit a deleted source")

    # Bump version
    source.version += 1
    source.raw_content = payload.raw_content
    source.content = payload.raw_content  # normalised text becomes the new content
    if payload.domain is not None:
        source.domain = payload.domain
    source.status = "pending"  # will be re-processed

    await db.commit()
    await db.refresh(source)

    # Kick off safe re-index: mark old claims as inactive, re-chunk, re-extract
    background_tasks.add_task(_safe_reindex, source.id)

    chunks_count = await _count(db, Chunk, Chunk.source_id == source.id)
    claims_count = await _count(db, Claim, Claim.source_id == source.id)
    return _enrich_source_response(source, chunks_count, claims_count)


# ──────────────────────────────────────────────
#  DELETE /sources/{id}  — soft delete
# ──────────────────────────────────────────────
@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(source_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Soft-delete a source and deactivate its claims (preserving graph history)."""
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    source.is_deleted = True

    # Deactivate all claims from this source
    claims_stmt = select(Claim).where(Claim.source_id == source_id, Claim.is_active == True)
    claims = (await db.execute(claims_stmt)).scalars().all()
    for claim in claims:
        claim.is_active = False

    await db.commit()
    logger.info(f"[Sources] Soft-deleted source {source_id}, deactivated {len(claims)} claims")


# ──────────────────────────────────────────────
#  Safe Re-index Pipeline
# ──────────────────────────────────────────────
async def _safe_reindex(source_id: uuid.UUID):
    """Background task: deactivate old claims, delete old chunks, re-run ingestion."""
    from ..db.session import async_session_factory

    async with async_session_factory() as db:
        try:
            source = await db.get(Source, source_id)
            if not source:
                return

            logger.info(f"[ReIndex] Starting safe re-index for source {source_id} v{source.version}")

            # 1. Mark all existing claims from this source as inactive
            old_claims_stmt = select(Claim).where(Claim.source_id == source_id, Claim.is_active == True)
            old_claims = (await db.execute(old_claims_stmt)).scalars().all()
            for claim in old_claims:
                claim.is_active = False
            await db.flush()
            logger.info(f"[ReIndex] Deactivated {len(old_claims)} old claims")

            # 2. Deactivate old chunks (they are superseded by the new ones)
            old_chunks_stmt = select(Chunk).where(Chunk.source_id == source_id, Chunk.is_active == True)
            old_chunks = (await db.execute(old_chunks_stmt)).scalars().all()
            for chunk in old_chunks:
                chunk.is_active = False
            await db.flush()
            logger.info(f"[ReIndex] Deactivated {len(old_chunks)} old chunks")

            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.error(f"[ReIndex] Error during pre-cleanup for {source_id}: {e}")
            return

    # 3. Run the standard ingestion pipeline on the updated content
    await process_source_chunks_bg(source_id)
    logger.info(f"[ReIndex] Safe re-index completed for source {source_id}")


# ──────────────────────────────────────────────
#  Helpers
# ──────────────────────────────────────────────
async def _count(db: AsyncSession, model, *filters) -> int:
    stmt = select(func.count()).select_from(model).where(*filters)
    return (await db.scalar(stmt)) or 0


def _enrich_source_response(source: Source, chunks_count: int, claims_count: int) -> SourceResponse:
    """Build a SourceResponse with computed counts."""
    return SourceResponse(
        id=source.id,
        title=source.title,
        content=source.content,
        source_type=source.source_type,
        meta_info=source.meta_info,
        file_type=source.file_type,
        original_file_path=source.original_file_path,
        raw_content=source.raw_content,
        domain=source.domain,
        version=source.version,
        is_deleted=source.is_deleted,
        metadata_info=source.metadata_info,
        status=source.status,
        error_message=source.error_message,
        started_at=source.started_at,
        completed_at=source.completed_at,
        created_at=source.created_at,
        updated_at=source.updated_at,
        chunks_count=chunks_count,
        claims_count=claims_count,
    )