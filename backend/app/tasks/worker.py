import logging
from datetime import datetime, timezone
from arq.connections import RedisSettings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..core.config import settings
from ..db.session import async_session_factory
from ..db.models import Source
from ..media.pipeline import MediaPipeline

logger = logging.getLogger(__name__)

async def startup(ctx):
    logger.info("[ARQ Worker] Initializing MediaPipeline runtime...")
    ctx["pipeline"] = MediaPipeline()
    # Предзагрузка весов Whisper в VRAM
    from ..media.pipeline import get_stt_service
    get_stt_service()
    ctx["redis"] = ctx["redis"]

async def shutdown(ctx):
    logger.info("[ARQ Worker] Shutting down worker...")

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
    
    # 1. Защита от дублей: атомарный Redis Lock с TTL 1 час
    lock_acquired = await redis.set(lock_key, b"1", ex=3600, nx=True)
    if not lock_acquired:
        logger.warning(f"[ARQ Worker] Task for source {source_id} dropped: already running.")
        return {"status": "skipped", "reason": "lock_active"}

    try:
        async with async_session_factory() as session:
            # 2. Обновление статуса в БД: processing
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

            # 3. Вызов доменного пайплайна
            await pipeline.process(
                source=source,
                session=session,
                retranscribe=retranscribe,
                language=language,
                enable_demucs=enable_demucs,
                fast_mode=fast_mode
            )

            # 4. Успешное завершение
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
        # Снятие блокировки
        await redis.delete(lock_key)

from ..knowledge.ingestion import process_source_chunks_bg
from ..db.models import Claim, Chunk
import uuid

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
    from ..knowledge.graph_linker import relink_durable_claims
    logger.info("[ARQ Worker] Starting relink_durable_claims_task")
    async with async_session_factory() as db:
        await relink_durable_claims(db)
    logger.info("[ARQ Worker] Finished relink_durable_claims_task")


class MediaWorkerSettings:
    functions = [process_media_transcription]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    queue_name = settings.ARQ_QUEUE_MEDIA
    max_jobs = 1          # Строгая изоляция: 1 тяжелый процесс на узел
    job_timeout = 3600    # 1 час лимит выполнения

class KnowledgeWorkerSettings:
    from arq.cron import cron
    functions = [process_source_chunks_bg, _safe_reindex, relink_durable_claims_task]
    cron_jobs = [
        cron(relink_durable_claims_task, hour=set(range(24)), minute=0)
    ]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    queue_name = settings.ARQ_QUEUE_KNOWLEDGE
    max_jobs = 3          # Легкая очередь для графов и LLM
    job_timeout = 3600    # 1 час лимит выполнения

