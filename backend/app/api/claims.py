import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from .deps import get_db
from ..db.models import Claim
from ..schemas.claim import ClaimResponse

router = APIRouter(prefix="/claims", tags=["Claims"])


@router.get("/", response_model=List[ClaimResponse])
async def list_claims(
    source_id: Optional[uuid.UUID] = Query(None, description="Filter claims by source_id"),
    include_history: bool = Query(False, description="Include superseded claims"),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Claim).options(selectinload(Claim.entities)).order_by(Claim.created_at.desc()).limit(limit)
    if not include_history:
        stmt = stmt.where(Claim.is_active == True)
    if source_id:
        stmt = stmt.where(Claim.source_id == source_id)
        
    result = await db.execute(stmt)
    claims = result.scalars().all()
    return claims
