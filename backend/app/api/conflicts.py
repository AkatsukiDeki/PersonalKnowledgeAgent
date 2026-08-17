from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional, Literal
from pydantic import BaseModel
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from datetime import datetime

from ..db.session import get_db
from ..db.models import ClaimConflict, Claim

router = APIRouter()

# Schemas
class ClaimInfo(BaseModel):
    id: uuid.UUID
    content: str
    claim_type: str
    category: str
    confidence: float
    is_active: bool
    source_title: Optional[str] = None
    source_domain: Optional[str] = None

class ConflictResponse(BaseModel):
    id: uuid.UUID
    status: str
    resolution_summary: Optional[str]
    created_at: datetime
    claim_a: ClaimInfo
    claim_b: ClaimInfo

class EditClaimRequest(BaseModel):
    claim_id: uuid.UUID
    new_content: str

class ResolveConflictRequest(BaseModel):
    strategy: Literal["supersede", "coexist", "edit"]
    winner_claim_id: Optional[uuid.UUID] = None
    edited_claims: Optional[List[EditClaimRequest]] = None
    resolution_notes: Optional[str] = None


@router.get("/", response_model=List[ConflictResponse])
async def get_conflicts(
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ClaimConflict).options(
        joinedload(ClaimConflict.claim_a).joinedload(Claim.source),
        joinedload(ClaimConflict.claim_b).joinedload(Claim.source)
    )
    if status_filter:
        stmt = stmt.where(ClaimConflict.status == status_filter)
        
    stmt = stmt.order_by(ClaimConflict.created_at.desc())
    
    result = await db.execute(stmt)
    conflicts = result.scalars().all()
    
    response = []
    for c in conflicts:
        claim_a_info = ClaimInfo(
            id=c.claim_a.id,
            content=c.claim_a.content,
            claim_type=c.claim_a.claim_type,
            category=c.claim_a.category,
            confidence=c.claim_a.confidence,
            is_active=c.claim_a.is_active,
            source_title=c.claim_a.source.title if c.claim_a.source else None,
            source_domain=c.claim_a.source.domain if c.claim_a.source else None,
        )
        claim_b_info = ClaimInfo(
            id=c.claim_b.id,
            content=c.claim_b.content,
            claim_type=c.claim_b.claim_type,
            category=c.claim_b.category,
            confidence=c.claim_b.confidence,
            is_active=c.claim_b.is_active,
            source_title=c.claim_b.source.title if c.claim_b.source else None,
            source_domain=c.claim_b.source.domain if c.claim_b.source else None,
        )
        response.append(ConflictResponse(
            id=c.id,
            status=c.status,
            resolution_summary=c.resolution_summary,
            created_at=c.created_at,
            claim_a=claim_a_info,
            claim_b=claim_b_info
        ))
        
    return response

@router.post("/{conflict_id}/resolve", response_model=ConflictResponse)
async def resolve_conflict(
    conflict_id: uuid.UUID,
    payload: ResolveConflictRequest,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ClaimConflict).options(
        joinedload(ClaimConflict.claim_a).joinedload(Claim.source),
        joinedload(ClaimConflict.claim_b).joinedload(Claim.source)
    ).where(ClaimConflict.id == conflict_id)
    
    result = await db.execute(stmt)
    conflict = result.scalars().first()
    
    if not conflict:
        raise HTTPException(status_code=404, detail="Conflict not found")
        
    if conflict.status == "resolved":
        raise HTTPException(status_code=400, detail="Conflict is already resolved")

    if payload.strategy == "supersede":
        if not payload.winner_claim_id:
            raise HTTPException(status_code=400, detail="winner_claim_id is required for supersede strategy")
            
        if payload.winner_claim_id == conflict.claim_a_id:
            conflict.claim_b.is_active = False
            conflict.claim_b.superseded_by = conflict.claim_a_id
        elif payload.winner_claim_id == conflict.claim_b_id:
            conflict.claim_a.is_active = False
            conflict.claim_a.superseded_by = conflict.claim_b_id
        else:
            raise HTTPException(status_code=400, detail="winner_claim_id must be one of the conflicting claims")
            
    elif payload.strategy == "coexist":
        # Both claims remain active, they are just contextually different.
        pass
        
    elif payload.strategy == "edit":
        if not payload.edited_claims:
            raise HTTPException(status_code=400, detail="edited_claims is required for edit strategy")
            
        for edit_req in payload.edited_claims:
            if edit_req.claim_id == conflict.claim_a_id:
                target_claim = conflict.claim_a
            elif edit_req.claim_id == conflict.claim_b_id:
                target_claim = conflict.claim_b
            else:
                raise HTTPException(status_code=400, detail=f"Claim {edit_req.claim_id} not part of this conflict")
                
            # Save original content in metadata
            meta = dict(target_claim.meta_info) if target_claim.meta_info else {}
            if "previous_versions" not in meta:
                meta["previous_versions"] = []
            
            meta["previous_versions"].append({
                "content": target_claim.content,
                "edited_at": datetime.utcnow().isoformat()
            })
            
            target_claim.meta_info = meta
            target_claim.content = edit_req.new_content

    conflict.status = "resolved"
    if payload.resolution_notes:
        conflict.resolution_summary = payload.resolution_notes
        
    await db.commit()
    await db.refresh(conflict)
    
    # Return updated info
    claim_a_info = ClaimInfo(
        id=conflict.claim_a.id,
        content=conflict.claim_a.content,
        claim_type=conflict.claim_a.claim_type,
        category=conflict.claim_a.category,
        confidence=conflict.claim_a.confidence,
        is_active=conflict.claim_a.is_active,
        source_title=conflict.claim_a.source.title if conflict.claim_a.source else None,
        source_domain=conflict.claim_a.source.domain if conflict.claim_a.source else None,
    )
    claim_b_info = ClaimInfo(
        id=conflict.claim_b.id,
        content=conflict.claim_b.content,
        claim_type=conflict.claim_b.claim_type,
        category=conflict.claim_b.category,
        confidence=conflict.claim_b.confidence,
        is_active=conflict.claim_b.is_active,
        source_title=conflict.claim_b.source.title if conflict.claim_b.source else None,
        source_domain=conflict.claim_b.source.domain if conflict.claim_b.source else None,
    )
    return ConflictResponse(
        id=conflict.id,
        status=conflict.status,
        resolution_summary=conflict.resolution_summary,
        created_at=conflict.created_at,
        claim_a=claim_a_info,
        claim_b=claim_b_info
    )
