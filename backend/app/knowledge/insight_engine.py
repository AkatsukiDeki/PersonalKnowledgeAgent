import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List, Dict, Any, Set
import uuid

from ..db.models import Claim, ClaimRelation, Pattern, Source
from ..core.llm import model_manager, TaskType
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

class InsightExtraction(BaseModel):
    title: str = Field(description="Краткий заголовок паттерна (3-5 слов)")
    description: str = Field(description="Детальное описание выявленной закономерности, принципа или паттерна на основе фактов")
    pattern_type: str = Field(description="Тип паттерна: architectural_invariance, team_habit, process_rule, code_convention")
    confidence: float = Field(description="Уверенность в паттерне (от 0.0 до 1.0)")
    domains: List[str] = Field(description="Список доменов, к которым относится паттерн (например, 'backend', 'architecture')")

async def generate_proactive_insights(db: AsyncSession) -> List[Pattern]:
    """
    1. Selects Active Durable Claims (memory_score >= 0.60) not yet in accepted/pending Patterns.
    2. Clusters them using Graph Connected Components (claim_relations), fallback to Domain.
    3. Feeds clusters to LLM to synthesize Candidate Insights (Patterns with status 'pending_review').
    """
    logger.info("[InsightEngine] Starting proactive insight generation...")

    # 1. Fetch claims already part of patterns
    existing_patterns = (await db.execute(select(Pattern))).scalars().all()
    used_claim_ids = set()
    for p in existing_patterns:
        for cid in p.evidence_claim_ids:
            used_claim_ids.add(cid)

    # 2. Fetch Durable Claims
    stmt = select(Claim).where(
        Claim.is_active == True,
        Claim.lifecycle_status == 'active',
        Claim.memory_score >= 0.60
    )
    durable_claims = (await db.execute(stmt)).scalars().all()
    
    available_claims = [c for c in durable_claims if c.id not in used_claim_ids]
    if not available_claims:
        logger.info("[InsightEngine] No unpatterned durable claims found. Exiting.")
        return []

    available_claims_map = {c.id: c for c in available_claims}

    # 3. Cluster using ClaimRelations (Graph Component Analysis)
    relations_stmt = select(ClaimRelation)
    all_relations = (await db.execute(relations_stmt)).scalars().all()
    
    adj_list: Dict[uuid.UUID, List[uuid.UUID]] = {cid: [] for cid in available_claims_map.keys()}
    for rel in all_relations:
        if rel.source_claim_id in adj_list and rel.target_claim_id in adj_list:
            # We want clustering for functional edges like used_in, depends_on, supports, applies_to
            if rel.relation_type in ("used_in", "depends_on", "supports", "applies_to"):
                adj_list[rel.source_claim_id].append(rel.target_claim_id)
                adj_list[rel.target_claim_id].append(rel.source_claim_id)

    visited: Set[uuid.UUID] = set()
    clusters: List[List[Claim]] = []

    def dfs(start_id: uuid.UUID, current_cluster: List[Claim]):
        stack = [start_id]
        while stack:
            curr = stack.pop()
            if curr not in visited:
                visited.add(curr)
                current_cluster.append(available_claims_map[curr])
                for neighbor in adj_list.get(curr, []):
                    if neighbor not in visited:
                        stack.append(neighbor)

    for cid in available_claims_map.keys():
        if cid not in visited:
            cluster = []
            dfs(cid, cluster)
            if len(cluster) > 1: # Only components of size >= 2
                clusters.append(cluster)

    # 4. Fallback to Domain clustering for unvisited/isolated claims
    isolated_claims = [c for c in available_claims if c.id not in visited or len(adj_list.get(c.id, [])) == 0]
    domain_clusters: Dict[str, List[Claim]] = {}
    
    # We need to fetch source domain for isolated claims
    # To avoid N+1, load sources in bulk
    isolated_source_ids = {c.source_id for c in isolated_claims}
    if isolated_source_ids:
        sources_res = await db.execute(select(Source).where(Source.id.in_(isolated_source_ids)))
        source_map = {s.id: s.domain for s in sources_res.scalars().all()}
        
        for c in isolated_claims:
            domain = source_map.get(c.source_id, "general")
            if not domain:
                domain = "general"
            if domain not in domain_clusters:
                domain_clusters[domain] = []
            domain_clusters[domain].append(c)
            
        for domain, claims in domain_clusters.items():
            if len(claims) >= 3: # Min 3 claims for domain fallback
                clusters.append(claims)

    new_patterns = []
    
    # 5. Synthesize Insights via LLM
    for i, cluster in enumerate(clusters):
        if len(cluster) < 2:
            continue
            
        logger.info(f"[InsightEngine] Analyzing cluster {i+1}/{len(clusters)} with {len(cluster)} claims...")
        
        claims_text = "\n".join([f"- {c.content}" for c in cluster[:15]]) # limit context
        prompt = f"""You are a proactive knowledge insight engine. Analyze the following established facts and engineer a deep, non-obvious insight or architectural pattern that unifies them.

FACTS:
{claims_text}

Generate a single overarching pattern or principle (Insight) derived from these facts. If there is no clear pattern, generate an insight explaining their relationship."""

        try:
            insight_data = await model_manager.generate_structured(
                task_type=TaskType.EXTRACTION,
                schema=InsightExtraction,
                prompt=prompt,
                system_instruction="Analyze facts and synthesize high-level patterns."
            )
            
            if insight_data.confidence >= 0.60:
                evidence_ids = [c.id for c in cluster[:15]]
                pattern = Pattern(
                    title=insight_data.title,
                    description=insight_data.description,
                    pattern_type=insight_data.pattern_type,
                    confidence=insight_data.confidence,
                    domains=insight_data.domains if insight_data.domains else ["general", "insight"],
                    evidence_summary=f"Synthesized from {len(evidence_ids)} durable claims.",
                    evidence_claim_ids=evidence_ids,
                    status="pending_review"
                )
                db.add(pattern)
                new_patterns.append(pattern)
                logger.info(f"[InsightEngine] Generated candidate insight: {pattern.title}")
                
        except Exception as e:
            logger.error(f"[InsightEngine] Failed to synthesize insight for cluster: {e}")

    if new_patterns:
        await db.commit()
    
    return new_patterns
