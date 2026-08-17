"""Dependency injection helpers for API endpoints."""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_db as _get_db


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield a database session (thin wrapper for DI clarity)."""
    async for session in _get_db():
        yield session
