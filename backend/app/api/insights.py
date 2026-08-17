from typing import List, Dict, Any
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from ..db.session import get_db
from ..db.models import Pattern

router = APIRouter()

@router.get("/pending", response_model=List[Dict[str, Any]])
async def get_pending_insights(db: AsyncSession = Depends(get_db)):
    """Get all proactive insights pending review."""
    stmt = select(Pattern).where(Pattern.status == "pending_review").order_by(Pattern.created_at.desc())
    res = await db.execute(stmt)
    patterns = res.scalars().all()
    
    result = []
    for p in patterns:
        result.append({
            "id": str(p.id),
            "title": p.title,
            "description": p.description,
            "evidence_summary": p.evidence_summary,
            "domains": p.domains,
            "confidence": p.confidence,
            "status": p.status,
            "created_at": p.created_at.isoformat() if p.created_at else None
        })
    return result

@router.post("/{pattern_id}/accept")
async def accept_insight(pattern_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Accept a proactive insight."""
    stmt = (
        update(Pattern)
        .where(Pattern.id == pattern_id)
        .values(status="accepted")
    )
    res = await db.execute(stmt)
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="Insight not found")
    await db.commit()
    return {"status": "accepted"}

@router.post("/{pattern_id}/dismiss")
async def dismiss_insight(pattern_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Dismiss a proactive insight."""
    stmt = (
        update(Pattern)
        .where(Pattern.id == pattern_id)
        .values(status="dismissed")
    )
    res = await db.execute(stmt)
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="Insight not found")
    await db.commit()
    return {"status": "dismissed"}
