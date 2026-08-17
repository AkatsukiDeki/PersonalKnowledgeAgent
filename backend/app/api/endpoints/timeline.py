from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from app.api.deps import get_db
from app.db.models import TimelineEvent
from app.knowledge.timeline_engine import build_timeline_events
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

router = APIRouter(prefix="/timeline", tags=["Timeline"])

class TimelineEventResponse(BaseModel):
    id: UUID
    event_type: str
    old_claim_id: Optional[UUID]
    new_claim_id: UUID
    source_id: Optional[UUID]
    title: str
    description: str
    domain: Optional[str]
    timestamp: datetime
    
    class Config:
        from_attributes = True

@router.get("/", response_model=List[TimelineEventResponse])
async def get_timeline_events(
    domain: Optional[str] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(TimelineEvent).order_by(TimelineEvent.timestamp.desc()).limit(limit)
    if domain:
        stmt = stmt.where(TimelineEvent.domain == domain)
        
    res = await db.execute(stmt)
    events = res.scalars().all()
    return events

@router.post("/rebuild")
async def rebuild_timeline(background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    """Triggers the timeline engine manually to process any unprocessed evolution edges."""
    background_tasks.add_task(build_timeline_events, db)
    return {"status": "Rebuild task queued"}
