import json
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert
from pydantic import BaseModel, Field

from ..core.config import settings
from ..core.llm import model_manager, TaskType
from ..db.models import Entity, Claim, ClaimRelation, claim_entities
from .retrieval import hybrid_search

logger = logging.getLogger(__name__)

class ExtractedEntity(BaseModel):
    claim_index: int = Field(description="Индекс утверждения (от 0), к которому относится эта сущность")
    canonical_name: str = Field(description="Normalized canonical name in lowercase")
    entity_type: str = Field(description="technology, activity, concept, goal, or person")
    description: str = Field(description="Short description of the entity")
    aliases: List[str] = Field(description="Other names or abbreviations")

class EntitiesList(BaseModel):
    entities: List[ExtractedEntity]

class ExtractedRelation(BaseModel):
    source_claim_index: int = Field(description="Индекс нового утверждения (от 0)")
    target_claim_id: str = Field(description="The UUID of the target claim this new claim relates to")
    relation_type: str = Field(..., description="supports, contradicts, related_to, derived_from")
    confidence: float = Field(..., ge=0.0, le=1.0)
    evidence_summary: str = Field(
        ...,
        min_length=10,
        description="Краткое объяснение связи (1 предложение), обосновывающее, почему эти утверждения связаны."
    )

class RelationsList(BaseModel):
    relations: List[ExtractedRelation]


async def extract_and_save_entities_batch(db: AsyncSession, claims: List[Claim]) -> None:
    if not claims: return
    
    prompt = "Пожалуйста, извлеки сущности из следующих утверждений:\n\n"
    for i, c in enumerate(claims):
        prompt += f"[CLAIM {i}]\n{c.content}\n\n"
        
    try:
        response_model = await model_manager.generate_structured(
            task_type=TaskType.EXTRACTION,
            schema=EntitiesList,
            prompt=prompt,
            system_instruction="You are an entity extractor. Extract named entities, concepts, and technologies. Map them to the correct claim_index."
        )
        
        for ent in response_model.entities:
            if ent.claim_index < 0 or ent.claim_index >= len(claims):
                continue
            claim = claims[ent.claim_index]
            
            try:
                async with db.begin_nested():
                    stmt = insert(Entity).values(
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
                        await db.execute(claim_entities.insert().values(claim_id=claim.id, entity_id=inserted_id))
            except Exception as e:
                logger.error(f"[GraphExtractor] Failed to insert entity {ent.canonical_name}: {e}")
    except Exception as e:
        logger.error(f"[GraphExtractor] Entity extraction batch failed: {e}")


async def extract_and_save_relations_batch(db: AsyncSession, new_claims: List[Claim]) -> None:
    if not new_claims: return
    
    # 1. Retrieve candidates for all new claims (we will just query for each and combine, or just take the first few)
    # To save tokens, we might just process claims one by one internally or combine the candidates.
    # Let's process them iteratively since candidate retrieval requires searching per claim.
    for i, new_claim in enumerate(new_claims):
        retrieved = await hybrid_search(db, original_query=new_claim.content, search_query=new_claim.content, limit=3)
        if not retrieved: continue
        
        chunk_ids = [c["chunk_id"] for c in retrieved]
        stmt = select(Claim).where(Claim.chunk_id.in_(chunk_ids), Claim.id != new_claim.id).limit(5)
        candidates_res = await db.execute(stmt)
        candidates = candidates_res.scalars().all()
        
        if not candidates: continue
        
        candidates_text = "\n".join([f"ID: {c.id} | Claim: {c.content}" for c in candidates])
        prompt = f"[CLAIM 0]\n'{new_claim.content}'\n\nCandidates:\n{candidates_text}"
        
        try:
            response_model = await model_manager.generate_structured(
                task_type=TaskType.EXTRACTION,
                schema=RelationsList,
                prompt=prompt,
                system_instruction="""Analyze if the New Claim has logical relations to any of the Candidates.
                Only output relations if confidence >= 0.5.
                Valid types: supports, contradicts, related_to, derived_from.
                Set source_claim_index to 0.
                """
            )
            
            for rel in response_model.relations:
                if rel.confidence < 0.5: continue
                if rel.target_claim_id == str(new_claim.id): continue
                
                try:
                    async with db.begin_nested():
                        stmt_dup = select(ClaimRelation).where(
                            ClaimRelation.source_claim_id == new_claim.id,
                            ClaimRelation.target_claim_id == rel.target_claim_id,
                            ClaimRelation.relation_type == rel.relation_type
                        )
                        dup = (await db.execute(stmt_dup)).first()
                        if dup: continue
                        
                        new_rel = ClaimRelation(
                            source_claim_id=new_claim.id,
                            target_claim_id=rel.target_claim_id,
                            relation_type=rel.relation_type,
                            confidence=rel.confidence,
                            evidence_summary=rel.evidence_summary,
                            evidence_claim_ids=[new_claim.id, rel.target_claim_id],
                            evidence_chunk_ids=chunk_ids
                        )
                        db.add(new_rel)
                except Exception as e:
                    logger.error(f"[GraphExtractor] Failed to insert relation: {e}")
                
        except Exception as e:
            logger.error(f"[GraphExtractor] Relation extraction failed: {e}")

