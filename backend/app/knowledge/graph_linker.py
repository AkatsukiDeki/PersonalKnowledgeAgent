import json
import logging
import uuid
from typing import List, Literal, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from ..core.llm import model_manager, TaskType
from ..db.models import Claim, ClaimRelation
from .retrieval import hybrid_search

logger = logging.getLogger(__name__)


class ExtractedRelation(BaseModel):
    source_claim_id: uuid.UUID
    target_claim_id: uuid.UUID
    relation_type: Literal[
        "used_in",
        "applies_to",
        "depends_on",
        "supersedes",
        "supports",
        "contradicts"
    ]
    confidence: float
    evidence_summary: str = Field(description="Краткое объяснение связи (1 предложение)")


class RelationsList(BaseModel):
    relations: List[ExtractedRelation]


async def relink_durable_claims(db: AsyncSession, new_claims: Optional[List[Claim]] = None) -> None:
    """
    Analyzes claims and creates 6 strict functional edges between them using vector pre-filtering.
    """
    if new_claims is not None:
        claims_to_process = new_claims
    else:
        stmt = select(Claim).where(Claim.is_active == True, Claim.memory_score >= 0.60)
        claims_res = await db.execute(stmt)
        claims_to_process = claims_res.scalars().all()
    
    logger.info(f"[GraphLinker] Found {len(claims_to_process)} claims for relinking.")
    
    from ..db.models import Chunk
    
    for i, claim in enumerate(claims_to_process):
        logger.info(f"[GraphLinker] Processing claim {i+1}/{len(claims_to_process)}: {claim.id}")
        
        chunk = await db.get(Chunk, claim.chunk_id)
        if not chunk or not chunk.embedding:
            continue
            
        # Search for candidates to link to using pgvector cosine distance
        # cos(E_new, E_existing) >= 0.65 => distance <= 0.35
        distance = Chunk.embedding.cosine_distance(chunk.embedding)
        candidates_stmt = (
            select(Claim)
            .join(Chunk, Claim.chunk_id == Chunk.id)
            .where(
                Claim.is_active == True,
                Claim.id != claim.id,
                distance <= 0.35
            )
            .order_by(distance)
            .limit(10)
        )
        candidates_res = await db.execute(candidates_stmt)
        candidates = candidates_res.scalars().all()
        
        if not candidates:
            continue
            
        candidates_text = "\n".join([f"ID: {c.id} | Claim: {c.content}" for c in candidates])
        prompt = f"Source Claim:\nID: {claim.id} | Claim: '{claim.content}'\n\nCandidate Claims:\n{candidates_text}"
        
        try:
            response_model = await model_manager.generate_structured(
                task_type=TaskType.EXTRACTION,
                schema=RelationsList,
                prompt=prompt,
                system_instruction="""Analyze if the Source Claim has strict logical relations to any of the Candidate Claims.
                Only output relations if confidence >= 0.70.
                Valid types: used_in, applies_to, depends_on, supersedes, supports, contradicts.
                Return source_claim_id as the ID of the Source Claim, and target_claim_id as the ID of the related Candidate Claim.
                """
            )
            
            for rel in response_model.relations:
                if rel.confidence < 0.70:
                    continue
                if rel.source_claim_id == rel.target_claim_id:
                    continue
                    
                # Create relation
                async with db.begin_nested():
                    # Check if already exists
                    stmt_dup = select(ClaimRelation).where(
                        ClaimRelation.source_claim_id == rel.source_claim_id,
                        ClaimRelation.target_claim_id == rel.target_claim_id,
                        ClaimRelation.relation_type == rel.relation_type
                    )
                    dup = (await db.execute(stmt_dup)).first()
                    if dup:
                        continue
                        
                    new_rel = ClaimRelation(
                        source_claim_id=rel.source_claim_id,
                        target_claim_id=rel.target_claim_id,
                        relation_type=rel.relation_type,
                        confidence=rel.confidence,
                        evidence_summary=rel.evidence_summary,
                        evidence_claim_ids=[rel.source_claim_id, rel.target_claim_id],
                        evidence_chunk_ids=[]
                    )
                    db.add(new_rel)
                    
            await db.commit()
            
        except Exception as e:
            logger.error(f"[GraphLinker] Failed to extract relations for claim {claim.id}: {e}")
            await db.rollback()
