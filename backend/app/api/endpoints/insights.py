from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel

from app.api.deps import get_db
from app.db.models import Insight, Decision, ConversationMemory, Claim

router = APIRouter()

class InsightResponse(BaseModel):
    id: UUID
    insight_type: str
    title: str
    description: str
    evidence_links: List[str]
    domains_involved: List[str]
    importance_score: float
    created_at: datetime
    
    class Config:
        from_attributes = True

@router.get("/", response_model=List[InsightResponse])
async def get_insights(db: AsyncSession = Depends(get_db)):
    """Retrieve all proactive insights."""
    result = await db.execute(select(Insight).order_by(Insight.importance_score.desc(), Insight.created_at.desc()))
    insights = result.scalars().all()
    return insights

@router.post("/generate")
async def trigger_generate_insights(background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    """Manually trigger the proactive insight generation pipeline."""
    async def bg_task():
        from app.db.session import async_session_factory
        from app.knowledge.insights_engine import InsightsEngine
        async with async_session_factory() as session:
            engine = InsightsEngine(session)
            await engine.run_all_heuristics()
            
    background_tasks.add_task(bg_task)
    return {"status": "Insight generation queued"}

class EvidenceItemResponse(BaseModel):
    id: str
    type: str
    text: str
    domain: Optional[str] = None
    conversation_id: Optional[str] = None

class InsightEvidenceResponse(BaseModel):
    insight_id: UUID
    title: str
    evidence: List[EvidenceItemResponse]

@router.get("/{insight_id}/evidence", response_model=InsightEvidenceResponse)
async def get_insight_evidence(insight_id: UUID, db: AsyncSession = Depends(get_db)):
    insight = await db.get(Insight, insight_id)
    if not insight:
        raise HTTPException(status_code=404, detail="Insight not found")
        
    evidence_list = []
    
    for link in insight.evidence_links:
        # Try to resolve link
        try:
            uid = UUID(link)
            # Try Decision
            dec = await db.get(Decision, uid)
            if dec:
                evidence_list.append({
                    "id": str(dec.id),
                    "type": "decision",
                    "text": dec.decision,
                    "domain": dec.domain
                })
                continue
            # Try Memory
            mem = await db.get(ConversationMemory, uid)
            if mem:
                evidence_list.append({
                    "id": str(mem.id),
                    "type": "memory",
                    "text": mem.problem,
                    "domain": None,
                    "conversation_id": str(mem.conversation_id) if getattr(mem, "conversation_id", None) else None
                })
                continue
            # Try Claim
            claim = await db.get(Claim, uid)
            if claim:
                evidence_list.append({
                    "id": str(claim.id),
                    "type": "claim",
                    "text": claim.content,
                    "domain": None
                })
                continue
        except Exception:
            pass
            
    return InsightEvidenceResponse(
        insight_id=insight.id,
        title=insight.title,
        evidence=evidence_list
    )
