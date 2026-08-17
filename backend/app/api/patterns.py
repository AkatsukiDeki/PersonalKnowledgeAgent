import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from ..db.session import get_db
from ..db.models import Pattern
from ..schemas.pattern import PatternResponse
from ..knowledge.pattern_engine import run_pattern_discovery_pipeline

router = APIRouter()

@router.get("/", response_model=List[PatternResponse])
async def list_patterns(
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
    offset: int = 0
):
    """Get all discovered patterns."""
    stmt = select(Pattern).order_by(desc(Pattern.created_at)).offset(offset).limit(limit)
    res = await db.execute(stmt)
    patterns = res.scalars().all()
    return patterns

@router.post("/discover", response_model=List[PatternResponse])
async def trigger_pattern_discovery(
    db: AsyncSession = Depends(get_db)
):
    """Manually trigger the cross-domain pattern discovery pipeline."""
    try:
        new_patterns = await run_pattern_discovery_pipeline(db)
        return new_patterns
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
