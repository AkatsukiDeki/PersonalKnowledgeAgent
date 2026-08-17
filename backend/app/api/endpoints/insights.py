from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from uuid import UUID

from app.api.deps import get_db
from app.db.models import Pattern
from app.knowledge.insight_engine import generate_proactive_insights
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

class InsightResponse(BaseModel):
    id: UUID
    title: str
    description: str
    pattern_type: str
    confidence: float
    importance: float
    domains: List[str]
    evidence_summary: str
    evidence_claim_ids: List[UUID]
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True

@router.get("/pending", response_model=List[InsightResponse])
async def get_pending_insights(db: AsyncSession = Depends(get_db)):
    """Retrieve all candidate insights awaiting user review."""
    result = await db.execute(select(Pattern).where(Pattern.status == "pending_review").order_by(Pattern.created_at.desc()))
    patterns = result.scalars().all()
    
    response_list = []
    for p in patterns:
        response_list.append({
            "id": p.id,
            "title": p.title,
            "description": p.description,
            "pattern_type": p.pattern_type,
            "confidence": p.confidence or 0.8,
            "importance": getattr(p, "importance", 0.75) or 0.75,
            "domains": p.domains or [],
            "evidence_summary": p.evidence_summary or "",
            "evidence_claim_ids": p.evidence_claim_ids or [],
            "status": p.status,
            "created_at": p.created_at
        })
    return response_list

@router.post("/{pattern_id}/accept", response_model=InsightResponse)
async def accept_insight(pattern_id: UUID, db: AsyncSession = Depends(get_db)):
    """Accept an insight, making it an active L3 pattern."""
    pattern = await db.get(Pattern, pattern_id)
    if not pattern:
        raise HTTPException(status_code=404, detail="Pattern not found")
        
    pattern.status = "accepted"
    pattern.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(pattern)
    return pattern

@router.post("/{pattern_id}/dismiss", response_model=InsightResponse)
async def dismiss_insight(pattern_id: UUID, db: AsyncSession = Depends(get_db)):
    """Dismiss an insight, hiding it from future reviews."""
    pattern = await db.get(Pattern, pattern_id)
    if not pattern:
        raise HTTPException(status_code=404, detail="Pattern not found")
        
    pattern.status = "dismissed"
    pattern.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(pattern)
    return pattern

@router.post("/generate")
async def trigger_generate_insights(background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    """Manually trigger the proactive insight generation pipeline."""
    async def bg_task():
        from app.db.session import async_session_factory
        async with async_session_factory() as session:
            await generate_proactive_insights(session)
            
    background_tasks.add_task(bg_task)
    return {"status": "Insight generation queued"}

class InsightEvidenceResponse(BaseModel):
    pattern_id: UUID
    title: str
    evidence: List[dict]

@router.get("/{pattern_id}/evidence", response_model=InsightEvidenceResponse)
async def get_insight_evidence(pattern_id: UUID, db: AsyncSession = Depends(get_db)):
    from app.db.models import Claim, Chunk, Source
    
    pattern = await db.get(Pattern, pattern_id)
    if not pattern:
        raise HTTPException(status_code=404, detail="Pattern not found")
        
    evidence_list = []
    if pattern.evidence_claim_ids:
        claims = (await db.execute(select(Claim).where(Claim.id.in_(pattern.evidence_claim_ids)))).scalars().all()
        for c in claims:
            chunk = await db.get(Chunk, c.chunk_id)
            source = await db.get(Source, c.source_id)
            evidence_list.append({
                "claim_id": str(c.id),
                "claim_text": c.content,
                "kind": c.kind,
                "confidence": c.confidence,
                "chunk_text": chunk.text_content if chunk else "",
                "source_title": source.title if source else "Unknown",
                "source_importance": source.importance if source else "normal"
            })
            
    return InsightEvidenceResponse(
        pattern_id=pattern.id,
        title=pattern.title,
        evidence=evidence_list
    )
