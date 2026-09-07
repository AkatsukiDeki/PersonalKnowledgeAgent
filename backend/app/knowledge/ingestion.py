"""Ingest a document: create Source, chunk text, embed, and persist to DB."""

from typing import Any, Dict, Optional, Sequence
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, date
import logging

logger = logging.getLogger(__name__)

from ..db.models import Source, Chunk
from .chunking import create_chunks
from .embeddings.factory import get_embedding_provider
from .claims_extractor import extract_claims_from_chunks
def parse_partial_date(date_str: str) -> Optional[date]:
    if not date_str: return None
    date_str = date_str.strip()
    try:
        if len(date_str) == 4:
            return date(int(date_str), 1, 1)
        elif len(date_str) == 7:
            return date(int(date_str[:4]), int(date_str[5:7]), 1)
        else:
            return date.fromisoformat(date_str[:10])
    except ValueError:
        return None
from .graph_extractor import extract_and_save_entities_batch, extract_and_save_relations_batch
from ..core.config import settings
from ..db.models import Claim
from ..core.error_tracker import record_error, resolve_granular_error
import asyncio
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


async def process_source_chunks_bg(ctx, source_id: uuid.UUID):
    """Background task to split content into chunks, embed, and persist."""
    from ..db.session import async_session_factory
    async with async_session_factory() as db:
        try:
            source = await db.get(Source, source_id)
            if not source:
                return

            source_content = source.content
            source_title = source.title
            source_type = source.source_type
            source_version = getattr(source, 'version', 1)

            source.status = "processing"
            source.started_at = datetime.utcnow()
            await db.commit()

            loop = asyncio.get_running_loop()
            raw_chunks: Sequence[str] = await loop.run_in_executor(None, create_chunks, source_content, 2500, 250)

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
                    version=source_version,
                    is_active=True
                )
                db_chunks.append(db_chunk)

            if db_chunks:
                db.add_all(db_chunks)

            await db.commit()
            await resolve_granular_error("chunking", source_id=source_id)

            # --- Phase 3A: Document Concept Extraction ---
            logger.info(f"[Ingestion] Source {source_id} completed chunking. Starting Concept Extraction.")
            all_new_claims = []

            from .extraction.router import select_extraction_strategy
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            
            strategy = select_extraction_strategy(source_type, len(source_content))
            concepts = await strategy.extract(source_content, source_title)
            
            if concepts:
                concept_texts = [f"{c.title}: {c.statement}" for c in concepts]
                concept_embeddings = await provider.embed_documents(concept_texts)
                
                for idx, c in enumerate(concepts):
                    emb = concept_embeddings[idx] if idx < len(concept_embeddings) else None
                    
                    claim = Claim(
                        source_id=source.id,
                        chunk_id=None,
                        content=f"{c.title}: {c.statement}",
                        embedding=emb,
                        claim_type="concept",
                        category="study",
                        confidence=1.0,
                        importance=1.0 if c.importance == "high" else 0.5,
                        memory_score=1.0 if c.importance == "high" else 0.5,
                        quote=c.supporting_excerpt[:500] if c.supporting_excerpt else None,
                        valid_from=parse_partial_date(c.valid_from) if hasattr(c, 'valid_from') else None,
                        valid_to=parse_partial_date(c.valid_to) if hasattr(c, 'valid_to') else None,
                        is_active=True,
                        meta_info={}
                    )
                    all_new_claims.append(claim)
                    db.add(claim)
                
                await db.flush() # get IDs for claims
                await db.commit()

            logger.info(f"[Ingestion] Extraction for {source_id} finished. {len(all_new_claims)} concepts extracted.")
            # --- Phase 3D: Conflict Resolution & Timeline ---
            # Check for conflicts between newly extracted claims and existing ones
            logger.info(f"[Ingestion] Running conflict resolver for {len(all_new_claims)} new concepts...")
            from .conflict_resolver import resolve_conflicts_for_new_claims
            await resolve_conflicts_for_new_claims(db, all_new_claims)

            # --- Phase 3E: Entity Graph Extraction ---
            logger.info(f"[Ingestion] Running EntityExtractor for Knowledge Graph...")
            from .entity_extractor import EntityExtractor
            from .graph_service import GraphService
            
            extractor = EntityExtractor()
            graph_service = GraphService(db)
            
            try:
                async with db.begin_nested():
                    triplets = await extractor.extract_triplets(source_content)
                    entity_id_map = {}
                    
                    # 1. Upsert Entities
                    for ent in triplets.get("entities", []):
                        if "name" in ent and "type" in ent:
                            eid = await graph_service.upsert_entity(
                                name=ent["name"],
                                entity_type=ent["type"],
                                description=ent.get("description", "")
                            )
                            entity_id_map[ent["name"]] = eid
                    
                    # 2. Add Relations
                    for rel in triplets.get("relations", []):
                        src_name = rel.get("source")
                        tgt_name = rel.get("target")
                        if src_name in entity_id_map and tgt_name in entity_id_map:
                            await graph_service.add_relation(
                                source_id=entity_id_map[src_name],
                                target_id=entity_id_map[tgt_name],
                                relation_type=rel.get("type", "relates_to"),
                                weight=rel.get("weight", 1.0)
                            )
                await db.commit()
                logger.info(f"[Ingestion] Extracted and saved graph triplets for {source_id}.")
            except Exception as e:
                logger.warning(f"[Ingestion] Graph extraction skipped due to error, base ingestion preserved for {source_id}: {e}")

            # --- Phase 4 & 5: Graph Linking & Timeline Evolution ---
            logger.info(f"[Ingestion] Running Graph Linker & Timeline Engine...")
            from .graph_linker import relink_durable_claims
            await relink_durable_claims(db, new_claims=all_new_claims)

            from .timeline_engine import build_timeline_events
            await build_timeline_events(db)
            # --------------------------------------------------

            await resolve_granular_error("extraction", source_id=source_id)
            await resolve_granular_error("ingestion", source_id=source_id)
            
            source = await db.get(Source, source_id)
            if source:
                source.status = "completed"
                source.completed_at = datetime.utcnow()
                await db.commit()

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