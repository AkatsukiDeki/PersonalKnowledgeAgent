import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from .deps import get_db
from ..db.models import Claim, ClaimRelation
from ..schemas.graph import GraphClaimResponse, GraphTopologyResponse, GraphNode, GraphLink

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
async def get_graph_topology(
    category: str = None,
    limit: int = 150,
    include_superseded: bool = False,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Claim).order_by(Claim.created_at.desc())
    if not include_superseded:
        stmt = stmt.where(Claim.is_active == True)
    if category:
        stmt = stmt.where(Claim.category == category)
        
    stmt = stmt.limit(limit).options(selectinload(Claim.entities))
    
    claims = (await db.execute(stmt)).scalars().all()
    
    if not claims:
        return GraphTopologyResponse(nodes=[], links=[])

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
            domain=getattr(c, 'domain', None),
            memory_score=getattr(c, 'memory_score', None)
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
        
    return GraphTopologyResponse(nodes=nodes, links=links)
