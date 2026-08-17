import re
import hashlib
import logging
import traceback
from datetime import datetime, timedelta
from uuid import UUID
from typing import Any
from sqlalchemy import select, delete, update
from sqlalchemy.dialects.postgresql import insert
from app.core.config import settings
from app.db.session import async_session_factory
from app.db.models import SystemError

logger = logging.getLogger("error_tracker")

# Маскирование чувствительных данных (ключи, токены, заголовки авторизации)
SECRET_PATTERNS = [
    (re.compile(r'(?i)(api[_-]?key|bearer|token|secret|password)["\s:=]+([a-zA-Z0-9_\-\.]{8,})'), r'\1="***REDACTED***"'),
    (re.compile(r'(?i)(authorization:\s*bearer\s+)([a-zA-Z0-9_\-\.]+)'), r'\1***REDACTED***'),
]

def sanitize_text(text: str | None, max_len: int = 4000) -> str | None:
    if not text:
        return text
    sanitized = text
    for pattern, repl in SECRET_PATTERNS:
        sanitized = pattern.sub(repl, sanitized)
    return sanitized[:max_len]

def compute_stable_fingerprint(
    stage: str,
    error_type: str,
    exception_class: str,
    location: str,
    provider: str | None,
    model: str | None
) -> str:
    raw = f"{stage}|{error_type}|{exception_class}|{location}|{provider or 'none'}|{model or 'none'}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

async def record_error(
    error: Exception,
    stage: str,
    *,
    job_id: str | None = None,
    source_id: UUID | None = None,
    chunk_id: UUID | None = None,
    provider: str | None = None,
    model: str | None = None,
    context: dict[str, Any] | None = None
) -> None:
    """Fail-safe регистрация ошибки. Падение трекера не прерывает основной поток."""
    try:
        tb = traceback.extract_tb(error.__traceback__)
        loc = tb[-1] if tb else None
        location_str = f"{loc.filename}:{loc.lineno}" if loc else "unknown"
        
        exc_class = type(error).__name__
        err_type = exc_class if not hasattr(error, "status_code") else f"HTTP_{error.status_code}"
        
        fingerprint = compute_stable_fingerprint(
            stage=stage,
            error_type=err_type,
            exception_class=exc_class,
            location=location_str,
            provider=provider,
            model=model
        )
        
        clean_msg = sanitize_text(str(error), max_len=1000)
        clean_tb = sanitize_text(traceback.format_exc(), max_len=4000)
        clean_ctx = {k: sanitize_text(str(v), 200) for k, v in (context or {}).items()}

        now = datetime.utcnow()

        # Идемпотентный атомарный UPSERT через PostgreSQL on_conflict_do_update
        stmt = insert(SystemError).values(
            fingerprint=fingerprint,
            job_id=job_id,
            source_id=source_id,
            chunk_id=chunk_id,
            stage=stage,
            error_type=err_type,
            exception_class=exc_class,
            location=location_str,
            provider=provider,
            model=model,
            message=clean_msg,
            traceback=clean_tb,
            context=clean_ctx,
            occurrences=1,
            status="open",
            first_seen=now,
            last_seen=now
        ).on_conflict_do_update(
            index_elements=[SystemError.fingerprint],
            set_={
                "occurrences": SystemError.occurrences + 1,
                "last_seen": now,
                "status": "open",
                "message": clean_msg,
                "traceback": clean_tb,
                "context": clean_ctx,
                "job_id": job_id or SystemError.job_id,
                "source_id": source_id or SystemError.source_id,
                "chunk_id": chunk_id or SystemError.chunk_id,
            }
        )

        async with async_session_factory() as db:
            await db.execute(stmt)
            await db.commit()

    except Exception as tracker_exc:
        # Fallback: логируем сбой самого трекера, не бросая исключение наружу
        logger.error(f"[ErrorTracker Fallback] Failed to record error: {tracker_exc}. Original: {error}")

async def resolve_granular_error(
    stage: str,
    *,
    job_id: str | None = None,
    source_id: UUID | None = None,
    chunk_id: UUID | None = None
) -> int:
    """Точечное разрешение ошибки строго для конкретного этапа/объекта."""
    try:
        now = datetime.utcnow()
        async with async_session_factory() as db:
            stmt = update(SystemError).where(
                SystemError.stage == stage,
                SystemError.status.in_(["open", "retrying"])
            )
            if job_id:
                stmt = stmt.where(SystemError.job_id == job_id)
            if source_id:
                stmt = stmt.where(SystemError.source_id == source_id)
            if chunk_id:
                stmt = stmt.where(SystemError.chunk_id == chunk_id)
                
            stmt = stmt.values(status="resolved", resolved_at=now)
            res = await db.execute(stmt)
            await db.commit()
            return res.rowcount
    except Exception as e:
        logger.error(f"[ErrorTracker Fallback] Failed to resolve errors: {e}")
        return 0

async def purge_expired_errors(retention_days: int | None = None) -> int:
    """Очистка только решенных/игнорируемых ошибок старше retention-окна."""
    days = retention_days if retention_days is not None else getattr(settings, "ERROR_RETENTION_DAYS", 7)
    cutoff = datetime.utcnow() - timedelta(days=days)
    try:
        async with async_session_factory() as db:
            stmt = delete(SystemError).where(
                SystemError.status.in_(["resolved", "ignored"]),
                SystemError.last_seen < cutoff
            )
            res = await db.execute(stmt)
            await db.commit()
            return res.rowcount
    except Exception as e:
        logger.error(f"[ErrorTracker Fallback] Purge failed: {e}")
        return 0
