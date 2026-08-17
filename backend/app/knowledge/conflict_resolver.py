import json
import logging
from typing import List, Optional
from pydantic import BaseModel, Field
from google import genai
from ..core.config import settings
from ..core.llm import tenacity_retry_reasoning_llm, model_manager, get_genai_client
from ..db.models import Claim, ClaimConflict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

logger = logging.getLogger(__name__)

client = get_genai_client()

class ConflictResolution(BaseModel):
    relation: str = Field(description="Must be one of: UPDATE, DIRECT_CONTRADICTION, CONTEXTUAL, INDEPENDENT")
    confidence: float = Field(description="Confidence score from 0.0 to 1.0")
    explanation: str = Field(description="Explanation of the decision")

SYSTEM_PROMPT = """Вы — интеллектуальный анализатор конфликтов и эволюции знаний (Conflict Resolver).
Вам даны два утверждения (факта): СТАРЫЙ ФАКТ и НОВЫЙ ФАКТ.
Определите, как новый факт соотносится со старым.

ВОЗМОЖНЫЕ ОТНОШЕНИЯ (relation):
1. UPDATE: Новый факт отменяет или обновляет старый (эволюция во времени, смена мнений/стека/привычек).
2. DIRECT_CONTRADICTION: Прямое неразрешимое противоречие, где непонятно, что именно правда, и требуется вмешательство пользователя.
3. CONTEXTUAL: Оба факта верны, но в разных условиях (например, один для монолитов, другой для микросервисов).
4. INDEPENDENT: Факты говорят о разном и не конфликтуют.

ВЕРНИТЕ РЕЗУЛЬТАТ В СТРОГОМ ФОРМАТЕ JSON по схеме.
"""

@tenacity_retry_reasoning_llm
async def analyze_claim_pair(new_claim: Claim, old_claim: Claim) -> Optional[ConflictResolution]:
    prompt = f"""
СТАРЫЙ ФАКТ (ID: {old_claim.id}):
{old_claim.content}

НОВЫЙ ФАКТ (ID: {new_claim.id}):
{new_claim.content}

Пожалуйста, классифицируйте отношение.
"""
    try:
        from ..core.llm import TaskType
        resolution = await model_manager.generate_structured(
            task_type=TaskType.EXTRACTION,
            schema=ConflictResolution,
            prompt=prompt,
            system_instruction=SYSTEM_PROMPT
        )
        return resolution
    except Exception as e:
        logger.error(f"Failed to analyze claim pair: {e}")
        return None

async def resolve_conflicts_for_new_claims(db: AsyncSession, new_claims: List[Claim]):
    """
    Called in the ingestion pipeline for newly extracted claims.
    """
    if not new_claims:
        return
        
    for new_claim in new_claims:
        if not new_claim.category:
            continue
            
        # Find active claims in the same category
        stmt = select(Claim).where(
            and_(
                Claim.is_active == True,
                Claim.id != new_claim.id,
                Claim.source_id != new_claim.source_id  # optionally skip same source? Let's not.
            )
        ).order_by(Claim.created_at.desc()).limit(15)
        
        res = await db.execute(stmt)
        old_claims = res.scalars().all()
        
        for old_claim in old_claims:
            resolution = await analyze_claim_pair(new_claim, old_claim)
            if not resolution:
                continue
                
            if resolution.relation == "UPDATE" and resolution.confidence >= 0.85:
                # Auto-resolve: mark old as inactive and set superseded_by
                old_claim.is_active = False
                old_claim.superseded_by = new_claim.id
                logger.info(f"Auto-resolved UPDATE: {old_claim.id} superseded by {new_claim.id}")
                db.add(old_claim)
                
            elif resolution.relation == "DIRECT_CONTRADICTION" or (resolution.relation == "UPDATE" and resolution.confidence < 0.85):
                # Needs review: create ClaimConflict
                conflict = ClaimConflict(
                    claim_a_id=old_claim.id,
                    claim_b_id=new_claim.id,
                    status="unresolved",
                    resolution_summary=resolution.explanation
                )
                db.add(conflict)
                logger.info(f"Created conflict for review between {old_claim.id} and {new_claim.id}")
                
            elif resolution.relation == "CONTEXTUAL":
                # Both remain active, maybe we log it or add a ClaimRelation? 
                # For now, do nothing, they coexist peacefully.
                pass
                
    await db.commit()
