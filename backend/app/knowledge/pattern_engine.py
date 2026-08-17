import json
import logging
import uuid
from typing import List, Dict, Any
from datetime import datetime, timedelta, timezone
from google.genai import types
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, text, func

from ..core.config import settings
from ..core.llm import tenacity_retry_reasoning_llm, model_manager, get_genai_client
from ..db.models import Claim, Pattern
from ..schemas.pattern import PatternExtractionResult

logger = logging.getLogger(__name__)
client = get_genai_client()

SYSTEM_PROMPT = """Вы — аналитический движок (Pattern Engine), синтезирующий высокоуровневые макро-инсайты из разрозненных фактов.
Ваша цель: найти устойчивые поведенческие, когнитивные, продуктовые или архитектурные инварианты, связывающие факты МИНИМУМ из 2-х независимых доменов (например, спорт и программирование, или учеба и работа).

СТРОГИЕ ПРАВИЛА:
1. КРОСС-ДОМЕННОСТЬ: Каждый паттерн обязан опираться на факты как минимум из двух разных доменов (категорий).
2. ДОКАЗУЕМОСТЬ: Вы обязаны указать точные ID фактов (evidence_claim_ids), на которых основан паттерн. Минимум 2 факта.
3. ТИПЫ ПАТТЕРНОВ: Только behavioral (поведение), cognitive (мышление), productivity (продуктивность) или architectural (архитектура).
4. УВЕРЕННОСТЬ: Выдавайте паттерны только если вы уверены в них (confidence >= 0.75).
5. ЯЗЫК: Пишите title, description и evidence_summary на русском языке.

Вы получите на вход список фактов в формате JSON.
Синтезируйте паттерны и верните ответ в строгом JSON-формате по запрошенной схеме.
"""

async def check_triggers_and_fetch_candidates(db: AsyncSession) -> List[Claim]:
    async with db.begin():
        locked = await db.scalar(text("SELECT pg_try_advisory_xact_lock(424242);"))
        if not locked:
            logger.info("[PatternEngine] Task already running in another worker (Phase 1 lock failed), skipping.")
            return []

        stmt_last = select(func.max(Pattern.created_at))
        last_run = await db.scalar(stmt_last)
        if not last_run:
            last_run = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=365)
        
        stmt_stats = select(
            func.count(Claim.id),
            func.count(Claim.category.distinct())
        ).where(Claim.created_at > last_run)
        
        res = await db.execute(stmt_stats)
        row = res.first()
        new_claims_count = row[0] if row and row[0] else 0
        unique_new_domains = row[1] if row and row[1] else 0
        
        if last_run.tzinfo is not None:
            last_run = last_run.replace(tzinfo=None)
            
        time_since_last_run = datetime.now(timezone.utc).replace(tzinfo=None) - last_run
        
        trigger = True
            
        VALID_CLAIM_TYPES_FOR_PATTERNS = {
            "habit", "observation", "preference", "plan", 
            "decision", "approach", "rule", "fact"
        }
        stmt_categories = select(Claim.category).distinct().where(Claim.category.isnot(None))
        res_categories = await db.execute(stmt_categories)
        categories = [row[0] for row in res_categories.all() if row[0]]
        
        candidates = []
        for cat in categories:
            stmt = (
                select(Claim)
                .where(Claim.category == cat)
                .where(
                    (Claim.claim_type.in_(VALID_CLAIM_TYPES_FOR_PATTERNS)) | 
                    (Claim.claim_type.is_(None))
                )
                .where(Claim.confidence >= 0.70)
                .order_by(desc(Claim.created_at))
                .limit(10)
            )
            res = await db.execute(stmt)
            candidates.extend(res.scalars().all())
            if len(candidates) >= 40:
                break
                
        return candidates[:40]

@tenacity_retry_reasoning_llm
async def discover_patterns(claims: List[Claim]) -> List[Dict[str, Any]]:
    if len(claims) < 2:
        return []

    claims_data = []
    for c in claims:
        claims_data.append({
            "id": str(c.id),
            "content": c.content,
            "category": c.category,
            "claim_type": c.claim_type
        })
        
    prompt_text = f"Проанализируй следующие факты и найди кросс-доменные паттерны:\n\n{json.dumps(claims_data, ensure_ascii=False, indent=2)}"
    
    current_model = model_manager.get_model('fast')
    logger.info(f"[PatternEngine] Attempting extraction with local Ollama")
    try:
        from ..core.llm import TaskType
        result = await model_manager.generate_structured(
            task_type=TaskType.EXTRACTION,
            schema=PatternExtractionResult,
            prompt=prompt_text,
            system_instruction=SYSTEM_PROMPT
        )
        # convert pydantic model to list of dicts for backward compatibility
        return [p.model_dump() for p in result.patterns]
    except Exception as e:
        logger.error(f"[PatternEngine] Extraction failed: {e}")
        return []

async def save_patterns_phase3(db: AsyncSession, patterns_data: List[Dict[str, Any]]) -> List[Pattern]:
    async with db.begin():
        locked = await db.scalar(text("SELECT pg_try_advisory_xact_lock(424242);"))
        if not locked:
            logger.info("[PatternEngine] Task already running (Phase 3 lock failed), skipping save.")
            return []
            
        created_patterns = []
        for pd in patterns_data:
            confidence = float(pd.get("confidence", 0.0))
            domains = pd.get("domains", [])
            evidence_ids = pd.get("evidence_claim_ids", [])
            
            if confidence < 0.75:
                continue
            if len(domains) < 2:
                continue
            if len(evidence_ids) < 2:
                continue
                
            valid_uuids = []
            for eid in evidence_ids:
                try:
                    valid_uuids.append(uuid.UUID(eid))
                except ValueError:
                    pass
            if len(valid_uuids) < 2:
                continue
                
            pattern = Pattern(
                title=pd.get("title", ""),
                description=pd.get("description", ""),
                pattern_type=pd.get("pattern_type", "behavioral"),
                domains=domains,
                confidence=confidence,
                evidence_summary=pd.get("evidence_summary", ""),
                evidence_claim_ids=valid_uuids
            )
            db.add(pattern)
            created_patterns.append(pattern)
            
        return created_patterns

async def run_pattern_discovery_pipeline(db: AsyncSession) -> List[Pattern]:
    candidates = await check_triggers_and_fetch_candidates(db)
    if not candidates:
        return []
        
    raw_patterns = await discover_patterns(candidates)
    if not raw_patterns:
        logger.info("No patterns discovered by LLM.")
        return []
        
    saved_patterns = await save_patterns_phase3(db, raw_patterns)
    if saved_patterns:
        logger.info(f"Saved {len(saved_patterns)} new cross-domain patterns.")
    return saved_patterns
