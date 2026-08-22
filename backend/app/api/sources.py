"""Sources API v2.0 — upload, list, get, edit, soft-delete documents."""

import os
import uuid
import logging
import re
import asyncio
import urllib.request
from typing import List, Optional, Any
from html.parser import HTMLParser
from pydantic import BaseModel

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    BackgroundTasks,
    UploadFile,
    File,
    Form,
    Query,
)
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Source, Chunk, Claim
from ..db.session import get_db, async_session_factory
from ..knowledge.ingestion import process_source_chunks_bg
from ..knowledge.file_ingestion import ingest_file_revision
from ..schemas.source import (
    SourceCreate,
    SourceResponse,
    SourceDetailResponse,
    SourceUpdateContent,
)
from ..parsers.factory import is_supported
from ..core.queue import task_queue

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sources", tags=["Sources"])

DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
    "sources",
)


class MLStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self.reset()
        self.strict = False
        self.convert_charrefs = True
        self.text = []
        self.skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ["script", "style", "nav", "header", "footer"]:
            self.skip = True

    def handle_endtag(self, tag):
        if tag in ["script", "style", "nav", "header", "footer"]:
            self.skip = False

    def handle_data(self, d):
        if not self.skip:
            self.text.append(d)

    def get_data(self):
        return "".join(self.text)


class URLUpload(BaseModel):
    url: str
    title: Optional[str] = None
    domain: Optional[str] = None
    importance: str = "normal"
    folder: Optional[str] = None


def _ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


async def _count(db: AsyncSession, model: Any, *filters) -> int:
    stmt = select(func.count()).select_from(model).where(*filters)
    return (await db.scalar(stmt)) or 0


def _enrich_source_response(source: Source, chunks_count: int, claims_count: int) -> SourceResponse:
    return SourceResponse(
        id=source.id,
        title=source.title,
        content=source.content,
        source_type=source.source_type,
        meta_info=source.meta_info or {},
        file_type=source.file_type,
        original_file_path=source.original_file_path,
        raw_content=source.raw_content,
        domain=source.domain,
        folder=getattr(source, "folder", None),
        version=source.version,
        is_deleted=source.is_deleted,
        metadata_info=source.metadata_info or {},
        status=source.status,
        error_message=source.error_message,
        started_at=source.started_at,
        completed_at=source.completed_at,
        created_at=source.created_at,
        updated_at=source.updated_at,
        chunks_count=chunks_count,
        claims_count=claims_count,
    )


@router.post("/url", response_model=SourceResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_url(
    payload: URLUpload,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    req = urllib.request.Request(
        payload.url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
    )
    try:
        loop = asyncio.get_event_loop()

        def fetch():
            with urllib.request.urlopen(req, timeout=15) as response:
                return response.read().decode("utf-8", errors="ignore")

        html = await loop.run_in_executor(None, fetch)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch URL: {str(e)}")

    s = MLStripper()
    s.feed(html)
    text_content = s.get_data().strip()
    text_content = re.sub(r"\n\s*\n", "\n\n", text_content)

    if not text_content:
        raise HTTPException(status_code=400, detail="Could not extract text from URL.")

    title = payload.title or payload.url.split("//")[-1].split("/")[0]
    filename = f"{title[:30]}.txt"

    try:
        source, ingest_status = await ingest_file_revision(
            db=db,
            filename=filename,
            file_bytes=text_content.encode("utf-8"),
            title=title,
            domain=payload.domain,
            importance=payload.importance,
            original_path=None,
        )

        source.source_type = "web_page"
        if not source.meta_info:
            source.meta_info = {}
        source.meta_info["url"] = payload.url
        source.is_deleted = False

        if payload.folder is not None:
            source.folder = None if payload.folder in ("", "root", "none") else payload.folder

        await db.commit()
        await db.refresh(source)

        if ingest_status != "unchanged" or source.status == "pending":
            task_queue.enqueue(process_source_chunks_bg, source.id)

        chunks_count = await _count(db, Chunk, Chunk.source_id == source.id)
        claims_count = await _count(db, Claim, Claim.source_id == source.id)
        return _enrich_source_response(source, chunks_count, claims_count)
    except Exception as e:
        logger.error(f"[Sources] Parse/Ingest error for URL {payload.url}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to ingest URL: {e}")


@router.post("/upload", response_model=SourceResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_source(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    domain: Optional[str] = Form(None),
    importance: str = Form("normal"),
    folder: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    if not is_supported(file.filename):
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.filename}")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    _ensure_data_dir()
    source_title = title.strip() if (title and title.strip()) else os.path.splitext(file.filename)[0]

    try:
        source, ingest_status = await ingest_file_revision(
            db=db,
            filename=file.filename,
            file_bytes=file_bytes,
            title=source_title,
            domain=domain,
            importance=importance,
            original_path=None,
        )
    except Exception as e:
        logger.error(f"[Sources] Parse/Ingest error for {file.filename}: {e}")
        raise HTTPException(status_code=422, detail=f"Failed to ingest file: {e}")

    source.is_deleted = False
    if folder is not None:
        source.folder = None if folder in ("", "root", "none") else folder

    source_dir = os.path.join(DATA_DIR, str(source.id))
    os.makedirs(source_dir, exist_ok=True)
    original_path = os.path.join(source_dir, file.filename)

    with open(original_path, "wb") as f:
        f.write(file_bytes)
    source.original_file_path = original_path

    await db.commit()
    await db.refresh(source)

    if ingest_status != "unchanged" or source.status == "pending":
        task_queue.enqueue(process_source_chunks_bg, source.id)

    chunks_count = await _count(db, Chunk, Chunk.source_id == source.id)
    claims_count = await _count(db, Claim, Claim.source_id == source.id)
    return _enrich_source_response(source, chunks_count, claims_count)


@router.post("/", response_model=SourceResponse, status_code=status.HTTP_202_ACCEPTED)
@router.post("", response_model=SourceResponse, status_code=status.HTTP_202_ACCEPTED, include_in_schema=False)
async def create_source(
    payload: SourceCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    try:
        source, ingest_status = await ingest_file_revision(
            db=db,
            filename=payload.title + ".txt",
            file_bytes=payload.content.encode("utf-8"),
            title=payload.title,
            domain=payload.domain,
            importance=payload.importance,
            original_path=None,
        )

        source.source_type = payload.source_type
        source.is_deleted = False
        if payload.meta_info:
            source.meta_info = payload.meta_info
        if payload.folder is not None:
            source.folder = None if payload.folder in ("", "root", "none") else payload.folder

        await db.commit()
        await db.refresh(source)

        if ingest_status != "unchanged" or source.status == "pending":
            task_queue.enqueue(process_source_chunks_bg, source.id)

        chunks_count = await _count(db, Chunk, Chunk.source_id == source.id)
        claims_count = await _count(db, Claim, Claim.source_id == source.id)
        return _enrich_source_response(source, chunks_count, claims_count)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[SourceResponse])
@router.get("", response_model=List[SourceResponse], include_in_schema=False)
async def list_sources(
    domain: Optional[str] = Query(None),
    file_type: Optional[str] = Query(None),
    folder: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    include_deleted: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Source).order_by(Source.created_at.desc())

    if not include_deleted:
        stmt = stmt.where(Source.is_deleted == False)
    if domain:
        stmt = stmt.where(Source.domain == domain)
    if folder:
        stmt = stmt.where(Source.folder == folder)
    if file_type:
        stmt = stmt.where(Source.file_type == file_type)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(or_(Source.title.ilike(pattern), Source.content.ilike(pattern)))

    result = await db.execute(stmt)
    sources = result.scalars().all()

    enriched = []
    for src in sources:
        chunks_count = await _count(db, Chunk, Chunk.source_id == src.id)
        claims_count = await _count(db, Claim, Claim.source_id == src.id)
        enriched.append(_enrich_source_response(src, chunks_count, claims_count))

    return enriched


@router.get("/{source_id}", response_model=SourceDetailResponse)
async def get_source_detail(source_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    chunks_stmt = select(Chunk).where(Chunk.source_id == source_id).order_by(Chunk.chunk_index)
    chunks = (await db.execute(chunks_stmt)).scalars().all()

    claims_stmt = select(Claim).where(Claim.source_id == source_id).order_by(Claim.created_at.desc())
    claims = (await db.execute(claims_stmt)).scalars().all()

    return SourceDetailResponse(
        id=source.id,
        title=source.title,
        content=source.content,
        source_type=source.source_type,
        meta_info=source.meta_info or {},
        file_type=source.file_type,
        original_file_path=source.original_file_path,
        raw_content=source.raw_content,
        domain=source.domain,
        folder=getattr(source, "folder", None),
        version=source.version,
        is_deleted=source.is_deleted,
        metadata_info=source.metadata_info or {},
        status=source.status,
        error_message=source.error_message,
        started_at=source.started_at,
        completed_at=source.completed_at,
        created_at=source.created_at,
        updated_at=source.updated_at,
        chunks_count=len(chunks),
        claims_count=len(claims),
        chunks=[{"id": str(c.id), "chunk_index": c.chunk_index, "text_content": c.text_content[:300]} for c in chunks],
        claims=[
            {
                "id": str(c.id),
                "content": c.content,
                "claim_type": c.claim_type,
                "category": c.category,
                "confidence": c.confidence,
                "is_active": c.is_active,
                "superseded_by": str(c.superseded_by) if c.superseded_by else None,
            }
            for c in claims
        ],
    )


@router.put("/{source_id}", response_model=SourceResponse)
async def update_source_content(
    source_id: uuid.UUID,
    payload: SourceUpdateContent,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    if source.is_deleted:
        raise HTTPException(status_code=400, detail="Cannot edit a deleted source")

    source.version += 1
    source.raw_content = payload.raw_content
    source.content = payload.raw_content
    if payload.domain is not None:
        source.domain = payload.domain
    source.status = "pending"

    await db.commit()
    await db.refresh(source)

    task_queue.enqueue(_safe_reindex, source.id)

    chunks_count = await _count(db, Chunk, Chunk.source_id == source.id)
    claims_count = await _count(db, Claim, Claim.source_id == source.id)
    return _enrich_source_response(source, chunks_count, claims_count)


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(source_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    source.is_deleted = True

    claims_stmt = select(Claim).where(Claim.source_id == source_id, Claim.is_active == True)
    claims = (await db.execute(claims_stmt)).scalars().all()
    for claim in claims:
        claim.is_active = False

    await db.commit()
    logger.info(f"[Sources] Soft-deleted source {source_id}, deactivated {len(claims)} claims")


async def _safe_reindex(source_id: uuid.UUID):
    async with async_session_factory() as db:
        try:
            source = await db.get(Source, source_id)
            if not source:
                return

            old_claims_stmt = select(Claim).where(Claim.source_id == source_id, Claim.is_active == True)
            old_claims = (await db.execute(old_claims_stmt)).scalars().all()
            for claim in old_claims:
                claim.is_active = False
            await db.flush()

            old_chunks_stmt = select(Chunk).where(Chunk.source_id == source_id, Chunk.is_active == True)
            old_chunks = (await db.execute(old_chunks_stmt)).scalars().all()
            for chunk in old_chunks:
                chunk.is_active = False
            await db.flush()

            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.error(f"[ReIndex] Error during pre-cleanup for {source_id}: {e}")
            return

    await process_source_chunks_bg(source_id)
    logger.info(f"[ReIndex] Safe re-index completed for source {source_id}")
