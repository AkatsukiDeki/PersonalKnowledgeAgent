from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import List
from datetime import date

from app.db.session import get_db
from app.db.models import DailyReadiness, UserProfile
from app.schemas.readiness import ReadinessCreate, ReadinessResponse
from app.api.endpoints.planner import get_current_user

router = APIRouter()

@router.get("/today", response_model=ReadinessResponse)
async def get_today_readiness(
    current_user: UserProfile = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get the current user's baseline readiness for today."""
    stmt = select(DailyReadiness).where(
        DailyReadiness.user_id == current_user.id,
        DailyReadiness.date == date.today(),
        DailyReadiness.is_baseline == True
    ).order_by(DailyReadiness.created_at.desc())
    
    result = await db.execute(stmt)
    readiness = result.scalars().first()
    
    if not readiness:
        raise HTTPException(status_code=404, detail="No baseline readiness found for today")
        
    return readiness

@router.get("/history", response_model=List[ReadinessResponse])
async def get_readiness_history(
    limit: int = 14,
    current_user: UserProfile = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get the readiness history."""
    stmt = select(DailyReadiness).where(
        DailyReadiness.user_id == current_user.id,
        DailyReadiness.is_baseline == True
    ).order_by(DailyReadiness.date.desc()).limit(limit)
    
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("", response_model=ReadinessResponse)
async def create_readiness(
    readiness_in: ReadinessCreate,
    current_user: UserProfile = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Submit a readiness check (morning baseline or on-demand)."""
    
    # Calculate sleep score (0-10)
    # Score_{sleep} = min(10, (Fact / 8.0) * 8 + (Quality - 3))
    sleep_score = min(10.0, (readiness_in.sleep_hours / 8.0) * 8.0 + (readiness_in.sleep_quality - 3))
    sleep_score = max(0.0, sleep_score)
    
    # Calculate CNS Score (0-10)
    # This requires looking at the user's historical baseline for tapping count.
    # Get max tapping count in the last 30 days
    stmt = select(func.max(DailyReadiness.tapping_count)).where(
        DailyReadiness.user_id == current_user.id,
        DailyReadiness.is_baseline == True
    )
    result = await db.execute(stmt)
    historical_max = result.scalar()
    
    if not historical_max or historical_max < 20:
        historical_max = max(readiness_in.tapping_count, 40) # Fallback to a reasonable max if no history
        
    # Tapping relative performance
    tapping_ratio = readiness_in.tapping_count / historical_max
    
    # Subjective score (out of 15)
    subjective_total = readiness_in.mental_clarity + readiness_in.physical_freshness + readiness_in.motivation
    subjective_ratio = subjective_total / 15.0
    
    # Combine objective (tapping) and subjective metrics (e.g., 60% objective, 40% subjective)
    cns_score = (tapping_ratio * 6.0) + (subjective_ratio * 4.0)
    cns_score = min(10.0, max(0.0, cns_score))
    
    # Create DB model
    db_readiness = DailyReadiness(
        user_id=current_user.id,
        date=date.today(),
        sleep_hours=readiness_in.sleep_hours,
        sleep_quality=readiness_in.sleep_quality,
        tapping_count=readiness_in.tapping_count,
        mental_clarity=readiness_in.mental_clarity,
        physical_freshness=readiness_in.physical_freshness,
        motivation=readiness_in.motivation,
        sleep_score=round(sleep_score, 1),
        cns_score=round(cns_score, 1),
        is_baseline=readiness_in.is_baseline
    )
    
    db.add(db_readiness)
    await db.commit()
    await db.refresh(db_readiness)
    
    return db_readiness
