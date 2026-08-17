import uuid
from typing import List
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .deps import get_db
from ..db.models import Entity
from ..schemas.entity import EntityResponse

router = APIRouter(prefix="/entities", tags=["Entities"])


@router.get("/", response_model=List[EntityResponse])
async def list_entities(
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Entity).order_by(Entity.created_at.desc()).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()
