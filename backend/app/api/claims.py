import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
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


class ClaimUpdate(BaseModel):
    is_active: bool


@router.patch("/{claim_id}", response_model=ClaimResponse)
async def update_claim(
    claim_id: uuid.UUID,
    payload: ClaimUpdate,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Claim).where(Claim.id == claim_id).options(selectinload(Claim.entities))
    result = await db.execute(stmt)
    claim = result.scalar_one_or_none()
    
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
        
    claim.is_active = payload.is_active
    await db.commit()
    await db.refresh(claim)
    return claim
