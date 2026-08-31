import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi import Query
from sqlalchemy import and_, func
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from sqlalchemy.orm import selectinload

from .deps import get_db
from ..db.models import Claim, ClaimRelation, Decision, Source
from ..schemas.graph import GraphClaimResponse, GraphTopologyResponse, GraphNode, GraphLink, BridgeContextResponse, \
    CrossDomainBridgeItem, BridgeClaimItem

router = APIRouter(prefix="/graph", tags=["Graph"])


@router.get("/claims/{claim_id}", response_model=GraphClaimResponse)
async def get_claim_graph(
    claim_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Claim).where(Claim.id == claim_id).options(selectinload(Claim.entities))
    result = await db.execute(stmt)
    claim = result.scalar_one_or_none()
    
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    stmt_rels = select(ClaimRelation).where(
        or_(
            ClaimRelation.source_claim_id == claim_id,
            ClaimRelation.target_claim_id == claim_id
        )
    )
    rels = (await db.execute(stmt_rels)).scalars().all()
    
    formatted = []
    for rel in rels:
        is_source = str(rel.source_claim_id) == str(claim_id)
        other_id = rel.target_claim_id if is_source else rel.source_claim_id
        other_claim = await db.get(Claim, other_id)
        
        if other_claim:
            formatted.append({
                "id": rel.id,
                "relation_type": rel.relation_type,
                "confidence": rel.confidence,
                "evidence_summary": rel.evidence_summary,
                "is_source": is_source,
                "related_claim_id": other_id,
                "related_claim_content": other_claim.content
            })

    return GraphClaimResponse(
        claim=claim,
        relations=formatted
    )

@router.get("/topology", response_model=GraphTopologyResponse)
@router.get("", response_model=GraphTopologyResponse)
async def get_graph_topology(
    category: str = None,
    limit: int = 150,
    include_superseded: bool = False,
    db: AsyncSession = Depends(get_db),
):
    from ..db.models import Source
    stmt = select(Claim, Source.domain).join(Source, Claim.source_id == Source.id).order_by(Claim.created_at.desc())
    if not include_superseded:
        stmt = stmt.where(Claim.is_active == True)
    if category:
        stmt = stmt.where(Claim.category == category)
        
    stmt = stmt.limit(limit).options(selectinload(Claim.entities))
    
    res = await db.execute(stmt)
    rows = res.all()
    
    if not rows:
        return GraphTopologyResponse(nodes=[], links=[])

    claims = [row[0] for row in rows]
    domains = {row[0].id: row[1] for row in rows}

    claim_ids = [c.id for c in claims]
    
    stmt_rels = select(ClaimRelation).where(
        ClaimRelation.source_claim_id.in_(claim_ids),
        ClaimRelation.target_claim_id.in_(claim_ids)
    )
    rels = (await db.execute(stmt_rels)).scalars().all()
    
    nodes = []
    links = []
    
    entity_nodes = {}
    
    for c in claims:
        nodes.append(GraphNode(
            id=str(c.id),
            label=c.content,
            group="claim",
            category=c.category or "unknown",
            val=4,
            is_active=c.is_active,
            confidence=c.confidence,
            created_at=c.created_at,
            source_id=str(c.source_id) if getattr(c, 'source_id', None) else None,
            chunk_id=str(c.chunk_id) if getattr(c, 'chunk_id', None) else None,
            superseded_by=str(c.superseded_by) if getattr(c, 'superseded_by', None) else None,
            content=c.content,
            kind=getattr(c, 'kind', None),
            domain=domains.get(c.id) or c.category,
            memory_score=getattr(c, 'memory_score', None),
            importance=getattr(c, 'importance', None),
        ))
        
        for e in c.entities:
            if str(e.id) not in entity_nodes:
                entity_nodes[str(e.id)] = GraphNode(
                    id=str(e.id),
                    label=e.canonical_name,
                    group="entity",
                    category=e.entity_type or "entity",
                    val=6,
                    aliases=e.aliases,
                    is_active=True
                )
            
            links.append(GraphLink(
                source=str(c.id),
                target=str(e.id),
                type="MENTIONS",
                color="#64748b"
            ))
            
    nodes.extend(list(entity_nodes.values()))
    
    for rel in rels:
        color = "#ef4444" if rel.relation_type.upper() == "CONTRADICTS" or rel.relation_type.upper() == "SUPERSEDES" else "#3b82f6"
        links.append(GraphLink(
            source=str(rel.source_claim_id),
            target=str(rel.target_claim_id),
            type=rel.relation_type.upper(),
            color=color,
            confidence=rel.confidence,
            evidence_summary=rel.evidence_summary
        ))
        
    # Fetch decisions and project them into the graph
    dec_stmt = select(Decision)
    # optionally filter by include_superseded if needed
    if not include_superseded:
        dec_stmt = dec_stmt.where(Decision.status != "superseded")
    decisions = (await db.execute(dec_stmt)).scalars().all()
    
    for d in decisions:
        nodes.append(GraphNode(
            id=str(d.id),
            label=d.decision[:50] + "..." if len(d.decision) > 50 else d.decision,
            group="decision",
            category="decision",
            val=5,
            is_active=d.status != "superseded",
            content=d.decision,
            rationale=d.rationale,
            alternatives=d.alternatives,
            memory_id=str(d.memory_id)
        ))
        # If we wanted to link decisions to claims or entities, we would do it here.
        # For now, decisions will just be floating nodes, or they can be linked to the conversation memory node.
        # Since the graph might not have conversation memory nodes, we'll just return the decision nodes.

    return GraphTopologyResponse(nodes=nodes, links=links)


from typing import Literal
from pydantic import BaseModel
from ..core.ollama_client import OllamaClient
from ..core.security import limiter
from fastapi import Request
from ..core.config import settings

class GraphCopilotRequest(BaseModel):
    action: Literal["explain_connections", "active_recall", "find_blindspots"]
    node_type: str = "unknown"
    
class GraphCopilotResponse(BaseModel):
    result_text: str

GRAPH_COPILOT_PROMPTS = {
    "explain_connections": """Ты — Graph Copilot в персональной базе знаний.
Твоя задача — объяснить связи выбранного узла графа с его соседями. Проанализируй данные в <graph_context> и опиши причинно-следственные, смысловые или иерархические связи.
Отвечай емко, без лишних вступлений.""",

    "active_recall": """Ты — Graph Copilot.
На основе данных из <graph_context> о выбранном узле и его соседях, сгенерируй 2-3 проверочных вопроса (Active Recall) для проверки понимания темы пользователем. 
Вопросы должны заставлять думать о неочевидных связях, а не просто вспоминать сухие факты.""",

    "find_blindspots": """Ты — Graph Copilot.
Проанализируй предоставленный <graph_context> (выбранный узел и его связи).
Найди логические дыры, недостающую информацию или оборванные смысловые ветки. Укажи, каких знаний не хватает для полноты картины, и задай 1-2 вопроса, которые помогут пользователю заполнить эти пробелы."""
}

@router.post("/{node_id}/copilot-action", response_model=GraphCopilotResponse)
@limiter.limit("20/minute")
async def run_graph_copilot(
    request: Request,
    node_id: str,
    payload: GraphCopilotRequest,
    db: AsyncSession = Depends(get_db)
):
    nid = None
    try:
        nid = uuid.UUID(node_id)
    except ValueError:
        pass

    context_text = f"Node ID: {node_id}\nType: {payload.node_type}\n"
    system_prompt = GRAPH_COPILOT_PROMPTS.get(payload.action)

    if nid:
        if payload.node_type == "edge":
            ClaimA = aliased(Claim, name="claim_a")
            ClaimB = aliased(Claim, name="claim_b")
            SourceA = aliased(Source, name="source_a")
            SourceB = aliased(Source, name="source_b")

            stmt = (
                select(ClaimRelation, ClaimA, SourceA, ClaimB, SourceB)
                .join(ClaimA, ClaimRelation.source_claim_id == ClaimA.id)
                .join(SourceA, ClaimA.source_id == SourceA.id)
                .join(ClaimB, ClaimRelation.target_claim_id == ClaimB.id)
                .join(SourceB, ClaimB.source_id == SourceB.id)
                .where(ClaimRelation.id == nid)
            )
            result = (await db.execute(stmt)).first()
            if result:
                rel, c_a, s_a, c_b, s_b = result
                snippet = getattr(rel, "evidence_snippet", None) or getattr(rel, "evidence_summary", "")
                
                if not snippet and not c_a.content and not c_b.content:
                    return GraphCopilotResponse(result_text="Недостаточно доказательной базы для анализа этой связи (отсутствует текст и контекст).")

                context_text = f"""Domain A: {s_a.domain or 'General'}
Claim A: {c_a.content}

Domain B: {s_b.domain or 'General'}
Claim B: {c_b.content}

Relation Type: {rel.relation_type}
Evidence Snippet: {snippet}"""

                if payload.action == "explain_connections":
                    system_prompt = """Инструкция:
1. Объясни точную логическую связь между Claim A и Claim B строго на основе приведенного контекста.
2. Не додумывай факты за пределами <graph_context>.
3. Сформулируй практический вывод на стыке двух доменов."""
            else:
                context_text += "No detailed text found in DB for this relation UUID.\n"
        else:
            stmt = select(Claim).where(Claim.id == nid)
            claim = (await db.execute(stmt)).scalar_one_or_none()
            
            if claim:
                context_text = f"Узел: {claim.content}\nТип: Утверждение\n"
                
                rels_stmt = select(ClaimRelation).where(
                    or_(ClaimRelation.source_claim_id == nid, ClaimRelation.target_claim_id == nid)
                )
                rels = (await db.execute(rels_stmt)).scalars().all()
                if rels:
                    context_text += "\nСвязи:\n"
                    for r in rels:
                        # Fetch the neighbor's content for readable context
                        other_id = r.target_claim_id if r.source_claim_id == nid else r.source_claim_id
                        other_claim = await db.get(Claim, other_id)
                        other_label = other_claim.content[:80] if other_claim else str(other_id)
                        context_text += f"- [{r.relation_type}] → \"{other_label}\"\n"
            else:
                # Try Subject
                from ..db.models import Subject
                subject = await db.get(Subject, nid)
                if subject:
                    context_text = f"Узел: {subject.title}\nТип: Тема обучения\nОписание: {subject.description or 'нет описания'}\n"
                else:
                    # Try Source
                    source = await db.get(Source, nid)
                    if source:
                        context_text = f"Узел: {source.title}\nТип: Источник знаний\nДомен: {source.domain or 'не указан'}\n"
                    else:
                        context_text += "Узел с таким ID не найден в базе данных.\n"
    else:
        context_text += "No detailed text found in DB for this node ID."

    if not system_prompt:
        system_prompt = "Ты — умный помощник. Отвечай на основе предоставленного графа."

    user_prompt = f"<graph_context>\n{context_text}\n</graph_context>"
    
    ollama = OllamaClient()
    try:
        result = await ollama.generate(
            model=settings.OLLAMA_QA_MODEL,
            prompt=user_prompt,
            system=system_prompt
        )
        return GraphCopilotResponse(result_text=result.strip())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM Error: {str(e)}")


@router.get("/bridges/context", response_model=BridgeContextResponse)
async def get_bridge_context(
    domain_a: str = Query(..., min_length=1, max_length=50, description="First domain name"),
    domain_b: str = Query(..., min_length=1, max_length=50, description="Second domain name"),
    limit: int = Query(default=5, ge=1, le=20, description="Maximum number of top bridges to return"),
    db: AsyncSession = Depends(get_db)
):
    norm_domain_a = domain_a.strip().lower()
    norm_domain_b = domain_b.strip().lower()

    if norm_domain_a == norm_domain_b:
        raise HTTPException(
            status_code=400, 
            detail="domain_a and domain_b must be distinct to retrieve cross-domain bridges."
        )

    SourceA = aliased(Source, name="source_a")
    SourceB = aliased(Source, name="source_b")
    ClaimA = aliased(Claim, name="claim_a")
    ClaimB = aliased(Claim, name="claim_b")

    stmt = (
        select(ClaimRelation, ClaimA, SourceA, ClaimB, SourceB)
        .join(ClaimA, ClaimRelation.source_claim_id == ClaimA.id)
        .join(SourceA, ClaimA.source_id == SourceA.id)
        .join(ClaimB, ClaimRelation.target_claim_id == ClaimB.id)
        .join(SourceB, ClaimB.source_id == SourceB.id)
        .where(
            and_(
                ClaimA.is_active.is_(True),
                ClaimB.is_active.is_(True),
                SourceA.status != "failed",
                SourceB.status != "failed",
                getattr(ClaimA, "is_superseded", False).is_(False) if hasattr(Claim, "is_superseded") else True,
                getattr(ClaimB, "is_superseded", False).is_(False) if hasattr(Claim, "is_superseded") else True,
                or_(
                    and_(
                        func.lower(SourceA.domain) == norm_domain_a,
                        func.lower(SourceB.domain) == norm_domain_b
                    ),
                    and_(
                        func.lower(SourceA.domain) == norm_domain_b,
                        func.lower(SourceB.domain) == norm_domain_a
                    )
                )
            )
        )
    )

    result = await db.execute(stmt)
    rows = result.all()

    if not rows:
        return BridgeContextResponse(
            domain_a=domain_a.strip(),
            domain_b=domain_b.strip(),
            total_bridges=0,
            top_bridges=[],
            evidence_sufficient=False
        )

    scored_bridges = []
    seen_pairs = set()

    for rel, c_a, s_a, c_b, s_b in rows:
        pair_key = tuple(sorted([str(c_a.id), str(c_b.id)]))
        if pair_key in seen_pairs:
            continue
        seen_pairs.add(pair_key)

        snippet = getattr(rel, "evidence_summary", None) or c_a.content
        snippet_len = len(snippet.strip()) if snippet else 0
        
        confidence = float(getattr(rel, "confidence", 1.0) or 1.0)
        evidence_score = round(
            (0.6 * confidence) + (0.4 * min(1.0, snippet_len / 150.0)),
            3
        )
        
        rel_weight = float(getattr(rel, "weight", 1.0) or 1.0)
        composite_rank = (rel_weight * 0.5) + (evidence_score * 0.5)

        bridge_item = CrossDomainBridgeItem(
            bridge_id=str(rel.id),
            relation_type=str(getattr(rel, "relation_type", "relates_to")),
            strength=rel_weight,
            evidence_score=evidence_score,
            source_claim=BridgeClaimItem(
                id=str(c_a.id),
                content=c_a.content,
                source_id=str(s_a.id),
                source_title=s_a.title,
                domain=s_a.domain or "General",
                confidence=confidence,
                is_superseded=bool(getattr(c_a, "is_superseded", False)) if hasattr(Claim, "is_superseded") else False
            ),
            target_claim=BridgeClaimItem(
                id=str(c_b.id),
                content=c_b.content,
                source_id=str(s_b.id),
                source_title=s_b.title,
                domain=s_b.domain or "General",
                confidence=confidence,
                is_superseded=bool(getattr(c_b, "is_superseded", False)) if hasattr(Claim, "is_superseded") else False
            ),
            supporting_snippet=snippet if snippet_len > 0 else None
        )

        scored_bridges.append((composite_rank, bridge_item))

    scored_bridges.sort(key=lambda x: x[0], reverse=True)
    top_items = [item for _, item in scored_bridges[:limit]]

    is_sufficient = len(top_items) > 0 and any(b.evidence_score >= 0.55 for b in top_items)

    return BridgeContextResponse(
        domain_a=domain_a.strip(),
        domain_b=domain_b.strip(),
        total_bridges=len(scored_bridges),
        top_bridges=top_items,
        evidence_sufficient=is_sufficient
    )
