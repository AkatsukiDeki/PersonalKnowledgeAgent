"""Dependency injection helpers for API endpoints."""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_db as _get_db


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield a database session (thin wrapper for DI clarity)."""
    async for session in _get_db():
        yield session

from fastapi import Depends, HTTPException
from sqlalchemy import select
from ..db.models import UserProfile

async def get_current_user(db: AsyncSession = Depends(get_db)) -> UserProfile:
    user = (await db.execute(select(UserProfile).limit(1))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User profile not found")
    return user
