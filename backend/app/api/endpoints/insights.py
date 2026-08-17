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
    domains: List[str]
    evidence_summary: str
    evidence_claim_ids: List[UUID]
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True

@router.get("/pending", response_model=List[InsightResponse])
async def get_pending_insights(db: AsyncSession = Depends(get_db)):
    """Get list of candidate insights pending user review."""
    stmt = select(Pattern).where(Pattern.status == "pending_review").order_by(Pattern.created_at.desc())
    res = await db.execute(stmt)
    return res.scalars().all()

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
