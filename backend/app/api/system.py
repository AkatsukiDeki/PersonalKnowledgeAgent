from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..db.session import get_db
from ..db.models import SystemError
from ..core.error_tracker import resolve_granular_error

router = APIRouter()

@router.get("/errors")
async def list_errors(
    status: Optional[str] = None,
    stage: Optional[str] = None,
    source_id: Optional[UUID] = None,
    limit: int = Query(50, le=100),
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(SystemError).order_by(SystemError.last_seen.desc())
    if status:
        stmt = stmt.where(SystemError.status == status)
    if stage:
        stmt = stmt.where(SystemError.stage == stage)
    if source_id:
        stmt = stmt.where(SystemError.source_id == source_id)
        
    stmt = stmt.offset(offset).limit(limit)
    res = await db.execute(stmt)
    errors = res.scalars().all()
    
    return [
        {
            "id": e.id,
            "fingerprint": e.fingerprint,
            "job_id": e.job_id,
            "source_id": e.source_id,
            "chunk_id": e.chunk_id,
            "stage": e.stage,
            "error_type": e.error_type,
            "exception_class": e.exception_class,
            "location": e.location,
            "provider": e.provider,
            "model": e.model,
            "message": e.message,
            "occurrences": e.occurrences,
            "retry_count": e.retry_count,
            "status": e.status,
            "first_seen": e.first_seen,
            "last_seen": e.last_seen,
            "resolved_at": e.resolved_at
        }
        for e in errors
    ]

@router.get("/errors/{error_id}")
async def get_error(error_id: UUID, db: AsyncSession = Depends(get_db)):
    error = await db.get(SystemError, error_id)
    if not error:
        raise HTTPException(status_code=404, detail="Error not found")
    
    return {
        "id": error.id,
        "fingerprint": error.fingerprint,
        "job_id": error.job_id,
        "source_id": error.source_id,
        "chunk_id": error.chunk_id,
        "stage": error.stage,
        "error_type": error.error_type,
        "exception_class": error.exception_class,
        "location": error.location,
        "provider": error.provider,
        "model": error.model,
        "message": error.message,
        "traceback": error.traceback,
        "context": error.context,
        "occurrences": error.occurrences,
        "retry_count": error.retry_count,
        "status": error.status,
        "first_seen": error.first_seen,
        "last_seen": error.last_seen,
        "resolved_at": error.resolved_at
    }

@router.post("/errors/{error_id}/resolve")
async def resolve_error_endpoint(error_id: UUID, db: AsyncSession = Depends(get_db)):
    error = await db.get(SystemError, error_id)
    if not error:
        raise HTTPException(status_code=404, detail="Error not found")
    
    import datetime
    error.status = "resolved"
    error.resolved_at = datetime.datetime.utcnow()
    await db.commit()
    return {"status": "resolved"}

@router.post("/errors/{error_id}/ignore")
async def ignore_error_endpoint(error_id: UUID, db: AsyncSession = Depends(get_db)):
    error = await db.get(SystemError, error_id)
    if not error:
        raise HTTPException(status_code=404, detail="Error not found")
    
    error.status = "ignored"
    await db.commit()
    return {"status": "ignored"}

@router.post("/errors/{error_id}/retry")
async def retry_error_endpoint(error_id: UUID, db: AsyncSession = Depends(get_db)):
    error = await db.get(SystemError, error_id)
    if not error:
        raise HTTPException(status_code=404, detail="Error not found")
    
    error.status = "retrying"
    error.retry_count += 1
    await db.commit()
    # Actual retry logic would go here, e.g. re-triggering ingestion job for the source_id
    return {"status": "retrying", "retry_count": error.retry_count}
