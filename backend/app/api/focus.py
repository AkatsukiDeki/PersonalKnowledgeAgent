import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ..db.session import get_db
from ..db.models import FocusSession, Source

router = APIRouter(prefix="/focus", tags=["Focus & Pomodoro"])

# --- Schemas ---

class StartFocusRequest(BaseModel):
    session_type: str = "focus"
    target_duration_min: int = 25
    subject_id: Optional[uuid.UUID] = None
    task_name: Optional[str] = None

class StartFocusResponse(BaseModel):
    session_id: uuid.UUID
    started_at: datetime

class FinishFocusRequest(BaseModel):
    session_id: uuid.UUID
    actual_duration_sec: int
    completed: bool
    interrupted: bool
    session_notes: Optional[str] = None

class FinishFocusResponse(BaseModel):
    status: str
    created_source_id: Optional[uuid.UUID] = None

class SubjectStat(BaseModel):
    subject_name: Optional[str]
    seconds: int

class StatsResponse(BaseModel):
    total_focus_seconds: int
    completed_sessions_count: int
    interrupted_sessions_count: int
    by_subject: List[SubjectStat]

# --- Endpoints ---

@router.post("/start", response_model=StartFocusResponse)
async def start_session(req: StartFocusRequest, db: AsyncSession = Depends(get_db)):
    session = FocusSession(
        session_type=req.session_type,
        target_duration_min=req.target_duration_min,
        subject_id=req.subject_id,
        task_name=req.task_name,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    
    return StartFocusResponse(
        session_id=session.id,
        started_at=session.created_at
    )

@router.post("/finish", response_model=FinishFocusResponse)
async def finish_session(req: FinishFocusRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FocusSession).where(FocusSession.id == req.session_id))
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Focus session not found")
        
    session.actual_duration_sec = req.actual_duration_sec
    session.completed = req.completed
    session.interrupted = req.interrupted
    session.session_notes = req.session_notes
    
    created_source_id = None
    
    if req.session_notes and len(req.session_notes.strip()) > 10:
        # Create a lightweight Source for the RAG
        note_title = f"Activity Note: {session.task_name or 'Focus Session'}"
        source = Source(
            title=note_title,
            source_type="focus_note",
            content=req.session_notes.strip(),
            raw_content=req.session_notes.strip(),
            subject_id=session.subject_id,
            status="completed",
            meta_info={
                "focus_session_id": str(session.id),
                "duration_sec": req.actual_duration_sec,
                "session_type": session.session_type,
                "tags": ["activity"]
            }
        )
        db.add(source)
        await db.flush()
        created_source_id = source.id
        
    await db.commit()
    
    return FinishFocusResponse(
        status="saved",
        created_source_id=created_source_id
    )

@router.get("/stats/today", response_model=StatsResponse)
async def get_today_stats(db: AsyncSession = Depends(get_db)):
    # Start of today (UTC)
    now = datetime.now(timezone.utc)
    start_of_day = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    
    # We query all sessions that started today
    result = await db.execute(
        select(FocusSession)
        .where(FocusSession.created_at >= start_of_day)
    )
    sessions = result.scalars().all()
    
    total_focus_sec = 0
    completed = 0
    interrupted = 0
    subject_totals = {}
    
    for s in sessions:
        if s.session_type == "focus":
            total_focus_sec += s.actual_duration_sec
            if s.completed:
                completed += 1
            if s.interrupted:
                interrupted += 1
                
            subj = str(s.subject_id) if s.subject_id else "Uncategorized"
            subject_totals[subj] = subject_totals.get(subj, 0) + s.actual_duration_sec
            
    # Normally we would join with Subjects to get the actual name. 
    # For simplicity, we just return the string representation of subject_id or 'Uncategorized'
    by_subject = [
        SubjectStat(subject_name=k, seconds=v)
        for k, v in subject_totals.items() if v > 0
    ]
    
    return StatsResponse(
        total_focus_seconds=total_focus_sec,
        completed_sessions_count=completed,
        interrupted_sessions_count=interrupted,
        by_subject=by_subject
    )
