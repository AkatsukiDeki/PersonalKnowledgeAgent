import logging
import uuid
import os
from datetime import datetime, timezone
from arq.connections import RedisSettings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from .core.config import settings
from .db.session import async_session_factory
from .db.models import Source
from .media.pipeline import MediaPipeline

logger = logging.getLogger(__name__)

async def startup(ctx):
    logger.info("[ARQ Worker] Starting up worker...")
    ctx["pipeline"] = MediaPipeline()
    # Предзагрузка моделей STT
    from .media.pipeline import get_stt_service
    get_stt_service()

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


class WorkerSettings:
    functions = [process_media_source_task]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    queue_name = settings.ARQ_QUEUE_NAME if hasattr(settings, "ARQ_QUEUE_NAME") else "arq:queue"
    max_jobs = 2
    job_timeout = 600
