import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from ..db.models import ClaimRelation, Claim, TimelineEvent, Source
from ..core.llm import model_manager, TaskType
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

class TimelineEventExtraction(BaseModel):
    event_type: str = Field(description="decision_change, tool_replacement, strategy_shift, or other")
    title: str = Field(description="Краткий заголовок события (3-5 слов)")
    description: str = Field(description="Детальное объяснение, почему старое утверждение было заменено или отменено новым")

async def build_timeline_events(db: AsyncSession) -> None:
    """
    Finds supersedes/contradicts relations without a corresponding TimelineEvent
    and generates an event.
    """
    logger.info("[TimelineEngine] Scanning for new evolution edges...")
    
    stmt = select(ClaimRelation).where(
        ClaimRelation.relation_type.in_(["supersedes", "contradicts"])
    )
    relations_objs = (await db.execute(stmt)).scalars().all()
    
    # Detach data from session to avoid MissingGreenlet on expired objects after db.commit()
    relations_data = [
        {
            "id": r.id,
            "source_claim_id": r.source_claim_id,
            "target_claim_id": r.target_claim_id,
            "relation_type": r.relation_type,
            "evidence_summary": r.evidence_summary
        }
        for r in relations_objs
    ]
    
    for rel_data in relations_data:
        # Check if event already exists for this edge
        # We identify by old_claim_id (target) and new_claim_id (source)
        # Note: relation is source -> target (source supersedes target)
        existing = await db.execute(select(TimelineEvent).where(
            TimelineEvent.new_claim_id == rel_data["source_claim_id"],
            TimelineEvent.old_claim_id == rel_data["target_claim_id"]
        ))
        if existing.scalars().first():
            continue
            
        # Get claims
        new_claim = await db.get(Claim, rel_data["source_claim_id"])
        old_claim = await db.get(Claim, rel_data["target_claim_id"])
        
        if not new_claim or not old_claim:
            continue
            
        prompt = f"""Analyze the knowledge evolution based on these two claims:
Old (Superseded/Contradicted) Claim: "{old_claim.content}"
New (Active) Claim: "{new_claim.content}"
Relation Type: {rel_data["relation_type"]}
Evidence from Graph Linker: "{rel_data["evidence_summary"]}"

Generate a timeline event describing this shift."""

        try:
            extraction = await model_manager.generate_structured(
                task_type=TaskType.EXTRACTION,
                schema=TimelineEventExtraction,
                prompt=prompt,
                system_instruction="Ты — аналитик эволюции персональной базы знаний.\nПРАВИЛА:\n1. ЯЗЫК: Все заголовки и описания сдвигов знаний пиши СТРОГО на русском языке (или выбранном в настройках).\n2. Обосновывай, ЧТО изменилось в понимании, КАКОЙ старый клейм устарел и ПОЧЕМУ новый вывод предпочтительнее."
            )
            
            # Determine source_id (usually from the new claim)
            source_id = new_claim.source_id
            
            # Fetch source to get domain
            source = await db.get(Source, source_id)
            domain = source.domain if source else None
            
            event = TimelineEvent(
                event_type=extraction.event_type,
                old_claim_id=old_claim.id,
                new_claim_id=new_claim.id,
                source_id=source_id,
                title=extraction.title,
                description=extraction.description,
                domain=domain
            )
            db.add(event)
            await db.commit()
            logger.info(f"[TimelineEngine] Generated event: {event.title}")
            
        except Exception as e:
            logger.error(f"[TimelineEngine] Failed to process relation {rel_data['id']}: {e}")
            await db.rollback()
