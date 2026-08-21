"""Ingest a document: create Source, chunk text, embed, and persist to DB."""

from typing import Any, Dict, Optional, Sequence
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

from ..db.models import Source, Chunk
from .chunking import create_chunks
from .embeddings.factory import get_embedding_provider
from .claims_extractor import extract_claims_from_chunks
from .graph_extractor import extract_and_save_entities_batch, extract_and_save_relations_batch
from ..core.config import settings
from ..db.models import Claim
from ..core.error_tracker import record_error, resolve_granular_error

import uuid

async def create_source_db(
        db: AsyncSession,
        title: str,
        content: str,
        source_type: str = "note",
        meta_info: Optional[Dict[str, Any]] = None,
) -> Source:
    """Create a Source and persist to DB (fast path)."""
    try:
        new_source = Source(
            title=title,
            content=content,
            source_type=source_type,
            meta_info=meta_info or {},
        )
        db.add(new_source)
        await db.commit()
        await db.refresh(new_source)
        return new_source
    except Exception:
        await db.rollback()
        raise


async def process_source_chunks_bg(source_id: uuid.UUID):
    """Background task to split content into chunks, embed, and persist."""
    from ..db.session import async_session_factory
    async with async_session_factory() as db:
        try:
            source = await db.get(Source, source_id)
            if not source:
                return

            source.status = "processing"
            source.started_at = datetime.utcnow()
            await db.commit()

            raw_chunks: Sequence[str] = create_chunks(source.content)

            provider = get_embedding_provider()
            embeddings = await provider.embed_documents(list(raw_chunks)) if raw_chunks else []

            db_chunks = []
            for idx, (text_chunk, embedding_vector) in enumerate(zip(raw_chunks, embeddings)):
                
                if len(embedding_vector) != settings.EMBEDDING_DIMENSION:
                    raise ValueError(f"Model dimension mismatch! Expected {settings.EMBEDDING_DIMENSION}, got {len(embedding_vector)}")

                db_chunk = Chunk(
                    source_id=source.id,
                    chunk_index=idx,
                    text_content=text_chunk,
                    embedding=embedding_vector,
                    tsv=func.to_tsvector("russian", text_chunk),
                    version=source.version,
                    is_active=True
                )
                db_chunks.append(db_chunk)

            if db_chunks:
                db.add_all(db_chunks)

            source.status = "completed"
            source.completed_at = datetime.utcnow()
            await db.commit()
            await resolve_granular_error("chunking", source_id=source_id)

            # --- Phase 3A: Batch Extraction & Commit ---
            logger.info(f"[Ingestion] Source {source_id} completed chunking. Starting Batch Extraction.")
            all_new_claims = []

            from .claims_extractor import extract_claims_from_chunks
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            from ..db.models import Entity, claim_entities

            # Batch processing
            batch_size = settings.EXTRACTION_BATCH_SIZE
            for i in range(0, len(db_chunks), batch_size):
                batch = db_chunks[i:i + batch_size]
                batch_texts = [c.text_content for c in batch]

                try:
                    claims_data = await extract_claims_from_chunks(batch_texts)
                    if claims_data:
                        # 1. Prepare and insert claims
                        from sqlalchemy import select
                        claim_texts = [c.content for c in claims_data.claims]
                        if claim_texts:
                            claim_embeddings = await provider.embed_documents(claim_texts)
                        else:
                            claim_embeddings = []

                        batch_claims = []
                        chunk_idx_to_claim = {}

                        for i_claim, c in enumerate(claims_data.claims):
                            if c.chunk_index < 0 or c.chunk_index >= len(batch):
                                continue
                            chunk = batch[c.chunk_index]
                            emb = claim_embeddings[i_claim] if i_claim < len(claim_embeddings) else None

                            # Поиск дубликатов (Cosine Sim >= 0.88 -> Distance <= 0.12)
                            existing_claim = None
                            if emb:
                                stmt = select(Claim).filter(Claim.embedding.cosine_distance(emb) <= 0.12).order_by(Claim.embedding.cosine_distance(emb)).limit(1)
                                result = await db.execute(stmt)
                                existing_claim = result.scalars().first()

                            if existing_claim:
                                existing_claim.recurrence += 1
                                # Обновляем memory_score, например: importance * (1.0 + min(recurrence, 10)/20.0)
                                existing_claim.memory_score = existing_claim.importance * (1.0 + min(existing_claim.recurrence, 10) / 20.0)

                                if c.temporal_context:
                                    if "temporal_context" not in existing_claim.meta_info:
                                        existing_claim.meta_info["temporal_context"] = c.temporal_context
                                    else:
                                        existing_claim.meta_info["temporal_context"] += f"; {c.temporal_context}"

                                db.add(existing_claim)
                                chunk_idx_to_claim[c.chunk_index] = existing_claim
                            else:
                                meta = {}
                                if c.temporal_context:
                                    meta["temporal_context"] = c.temporal_context

                                claim = Claim(
                                    source_id=source.id,
                                    chunk_id=chunk.id,
                                    content=c.content,
                                    embedding=emb,
                                    claim_type=c.claim_type,
                                    category=c.category,
                                    confidence=c.confidence,
                                    importance=c.importance,
                                    memory_score=c.importance,
                                    meta_info=meta
                                )
                                batch_claims.append(claim)
                                chunk_idx_to_claim[c.chunk_index] = claim

                        if batch_claims:
                            db.add_all(batch_claims)
                            await db.flush() # get IDs for claims

                            # 2. Prepare and insert entities
                            for ent in claims_data.entities:
                                if ent.chunk_index not in chunk_idx_to_claim:
                                    continue
                                claim = chunk_idx_to_claim[ent.chunk_index]

                                stmt = pg_insert(Entity).values(
                                    canonical_name=ent.canonical_name.strip().lower(),
                                    entity_type=ent.entity_type,
                                    description=ent.description,
                                    aliases=ent.aliases,
                                    meta_info={}
                                )
                                stmt = stmt.on_conflict_do_update(
                                    index_elements=["canonical_name"],
                                    set_=dict(description=stmt.excluded.description)
                                ).returning(Entity.id)

                                res = await db.execute(stmt)
                                inserted_id = res.scalar_one_or_none()
                                if inserted_id:
                                    stmt_link = pg_insert(claim_entities).values(
                                        claim_id=claim.id,
                                        entity_id=inserted_id
                                    ).on_conflict_do_nothing(
                                        index_elements=['claim_id', 'entity_id']
                                    )
                                    await db.execute(stmt_link)

                            # Note: Relations are currently skipped from intra-batch until ClaimRelation logic is updated

                            all_new_claims.extend(batch_claims)

                    await db.commit()
                except Exception as batch_err:
                    await db.rollback()
                    logger.error(f"[Ingestion] Failed to process extraction batch for source {source_id}: {batch_err}")
                    await record_error(batch_err, "extraction", source_id=source_id, context={"batch_start_index": i})

            logger.info(f"[Ingestion] Extraction for {source_id} finished. {len(all_new_claims)} claims extracted.")
            # --- Phase 3D: Conflict Resolution & Timeline ---
            # Check for conflicts between newly extracted claims and existing ones
            logger.info(f"[Ingestion] Running conflict resolver for {len(all_new_claims)} new claims...")
            from .conflict_resolver import resolve_conflicts_for_new_claims
            await resolve_conflicts_for_new_claims(db, all_new_claims)

            # --- Phase 4 & 5: Graph Linking & Timeline Evolution ---
            logger.info(f"[Ingestion] Running Graph Linker & Timeline Engine...")
            from .graph_linker import relink_durable_claims
            await relink_durable_claims(db, new_claims=all_new_claims)

            from .timeline_engine import build_timeline_events
            await build_timeline_events(db)
            # --------------------------------------------------

            await resolve_granular_error("extraction", source_id=source_id)
            await resolve_granular_error("ingestion", source_id=source_id)

        except Exception as e:
            await db.rollback()
            await record_error(e, "ingestion", source_id=source_id)
            source = await db.get(Source, source_id)
            if source:
                source.status = "failed"
                source.error_message = str(e)
                source.completed_at = datetime.utcnow()
                await db.commit()
            logger.error(f"[Ingestion] Background chunking failed for {source_id}: {e}")