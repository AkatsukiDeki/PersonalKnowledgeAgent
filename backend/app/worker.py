import logging
import uuid
import os
from datetime import datetime, timezone
from arq.connections import RedisSettings
from arq.cron import cron
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from .core.config import settings
from .db.session import async_session_factory
from .db.models import Source, Claim, Chunk
from .media.pipeline import MediaPipeline
from .knowledge.ingestion import process_source_chunks_bg

logger = logging.getLogger(__name__)

async def startup(ctx):
    logger.info("[ARQ Worker] Starting up worker...")
    ctx["pipeline"] = MediaPipeline()
    # Предзагрузка моделей STT
    from .media.pipeline import get_stt_service
    get_stt_service()
    # Redis client is automatically available in ctx["redis"]

async def shutdown(ctx):
    logger.info("[ARQ Worker] Shutting down worker...")


async def process_media_source_task(
    ctx,
    task_id: str,
    file_path: str,
    title: str,
    domain: str = None,
    importance: str = "normal",
    retranscribe: bool = False,
    language: str = "ru"
):
    redis = ctx["redis"]
    pipeline: MediaPipeline = ctx["pipeline"]
    progress_key = f"task:progress:{task_id}"

    async def update_progress(status: str, step: str, pct: int, error: str = None, source_id: str = None):
        meta = {
            "status": status,
            "step": step,
            "progress": pct,
            "error": error
        }
        if source_id:
            meta["source_id"] = source_id
        import json
        await redis.set(progress_key, json.dumps(meta), ex=3600)
    
    await update_progress("in_progress", "started", 5)
    
    source_id_str = None
    try:
        # 1. Извлечение текста (бывший синхронный вызов ingest_file_revision)
        await update_progress("in_progress", "parsing", 10)
        with open(file_path, "rb") as f:
            file_bytes = f.read()

        from .knowledge.file_ingestion import ingest_file_revision
        
        async with async_session_factory() as session:
            source, _ = await ingest_file_revision(
                db=session,
                filename=os.path.basename(file_path),
                file_bytes=file_bytes,
                title=title,
                domain=domain,
                importance=importance,
                original_path=file_path
            )
            source_id_str = str(source.id)
            
            source.processing_status = "processing"
            source.status = "processing"
            source.processing_stage = "transcribing"
            source.processing_started_at = datetime.now(timezone.utc)
            await session.commit()
            
            # 2. Выполнение полного ML/Graph пайплайна
            await update_progress("in_progress", "transcribing", 20, source_id=source_id_str)
            await pipeline.process(
                source=source,
                session=session,
                retranscribe=retranscribe,
                language=language
            )

            # 3. Финализация
            source.processing_status = "completed"
            source.status = "completed"
            source.processing_stage = "completed"
            source.processing_completed_at = datetime.now(timezone.utc)
            await session.commit()
            
        await update_progress("completed", "done", 100, source_id=source_id_str)
        logger.info(f"[ARQ Worker] Source {source_id_str} processed successfully.")
        return {"status": "completed", "source_id": source_id_str}

    except Exception as e:
        logger.exception(f"[ARQ Worker] Failed to process media: {e}")
        await update_progress("failed", "error", 0, error=str(e), source_id=source_id_str)
        
        if source_id_str:
            # Обновляем fallback ошибку в Postgres
            async with async_session_factory() as session:
                stmt = select(Source).where(Source.id == source_id_str)
                res = await session.execute(stmt)
                source = res.scalar_one_or_none()
                if source:
                    source.processing_status = "failed"
                    source.status = "failed"
                    source.processing_stage = "failed"
                    source.processing_error = str(e)
                    await session.commit()
        raise


# --- Legacy / Backwards Compatibility Tasks ---

async def process_media_transcription(
    ctx,
    source_id: str,
    retranscribe: bool = False,
    language: str = "ru",
    enable_demucs: bool = False,
    fast_mode: bool = True
):
    redis = ctx["redis"]
    pipeline: MediaPipeline = ctx["pipeline"]
    lock_key = f"media:source:{source_id}:processing"
    
    lock_acquired = await redis.set(lock_key, b"1", ex=3600, nx=True)
    if not lock_acquired:
        logger.warning(f"[ARQ Worker] Task for source {source_id} dropped: already running.")
        return {"status": "skipped", "reason": "lock_active"}

    try:
        async with async_session_factory() as session:
            stmt = select(Source).where(Source.id == source_id)
            res = await session.execute(stmt)
            source = res.scalar_one_or_none()
            if not source:
                logger.error(f"[ARQ Worker] Source {source_id} not found in DB.")
                return {"status": "failed", "reason": "source_not_found"}

            source.processing_status = "processing"
            source.status = "processing"
            source.processing_stage = "transcribing"
            source.processing_started_at = datetime.now(timezone.utc)
            source.processing_error = None
            await session.commit()

            await pipeline.process(
                source=source,
                session=session,
                retranscribe=retranscribe,
                language=language,
                enable_demucs=enable_demucs,
                fast_mode=fast_mode
            )

            source.processing_status = "completed"
            source.status = "completed"
            source.processing_stage = "completed"
            source.processing_completed_at = datetime.now(timezone.utc)
            await session.commit()

            logger.info(f"[ARQ Worker] Source {source_id} processed successfully.")
            return {"status": "completed", "source_id": source_id}

    except Exception as e:
        logger.exception(f"[ARQ Worker] Pipeline error on source {source_id}: {e}")
        async with async_session_factory() as session:
            stmt = select(Source).where(Source.id == source_id)
            res = await session.execute(stmt)
            source = res.scalar_one_or_none()
            if source:
                source.processing_status = "failed"
                source.status = "failed"
                source.processing_stage = "failed"
                source.processing_error = str(e)
                await session.commit()
        raise e
    finally:
        await redis.delete(lock_key)

async def fast_transcribe(ctx, audio_bytes: bytes, language: str = "ru") -> str:
    from .media.pipeline import get_stt_service
    import tempfile
    import os
    from pathlib import Path
    stt = get_stt_service()
    
    fd, temp_path = tempfile.mkstemp(suffix=".ogg")
    try:
        with open(temp_path, "wb") as f:
            f.write(audio_bytes)
            
        segments = stt.transcribe(Path(temp_path), language=language)
        text = " ".join([seg["text"] for seg in segments]).strip()
        return text
    finally:
        os.close(fd)
        if os.path.exists(temp_path):
            os.remove(temp_path)

# --- Knowledge Graph / DB Maintenance Tasks ---

async def _safe_reindex(ctx, source_id: uuid.UUID):
    async with async_session_factory() as db:
        try:
            source = await db.get(Source, source_id)
            if not source:
                return

            old_claims_stmt = select(Claim).where(Claim.source_id == source_id, Claim.is_active == True)
            old_claims = (await db.execute(old_claims_stmt)).scalars().all()
            for claim in old_claims:
                claim.is_active = False
            await db.flush()

            old_chunks_stmt = select(Chunk).where(Chunk.source_id == source_id, Chunk.is_active == True)
            old_chunks = (await db.execute(old_chunks_stmt)).scalars().all()
            for chunk in old_chunks:
                chunk.is_active = False
            await db.flush()

            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.error(f"[ReIndex] Error during pre-cleanup for {source_id}: {e}")
            return

    await process_source_chunks_bg(ctx, source_id)
    logger.info(f"[ReIndex] Safe re-index completed for source {source_id}")


async def relink_durable_claims_task(ctx):
    from .knowledge.graph_linker import relink_durable_claims
    logger.info("[ARQ Worker] Starting relink_durable_claims_task")
    async with async_session_factory() as db:
        await relink_durable_claims(db)
    logger.info("[ARQ Worker] Finished relink_durable_claims_task")


class WorkerSettings:
    functions = [
        process_media_source_task,
        process_media_transcription,
        fast_transcribe,
        process_source_chunks_bg,
        _safe_reindex,
        relink_durable_claims_task
    ]
    cron_jobs = [
        cron(relink_durable_claims_task, hour=set(range(24)), minute=0)
    ]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    queue_name = settings.ARQ_QUEUE_NAME if hasattr(settings, "ARQ_QUEUE_NAME") else "arq:queue"
    max_jobs = 3
    job_timeout = 3600
