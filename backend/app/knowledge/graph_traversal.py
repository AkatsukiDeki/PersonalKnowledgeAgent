import logging
import uuid
from typing import List, Dict, Set, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db.models import Claim, ClaimRelation, Entity, claim_entities

logger = logging.getLogger(__name__)

# Приоритет ребер. Больше значение = выше приоритет при ранжировании
EDGE_PRIORITY = {
    "supersedes": 3,
    "contradicts": 3,
    "depends_on": 3,
    "applies_to": 2,
    "used_in": 2,
    "supports": 1,
}

class GraphTraversalEngine:
    def __init__(self, db: AsyncSession):
        self.db = db
        
    async def traverse_from_claims(self, seed_claim_ids: List[uuid.UUID], max_depth: int = 2, limit_neighbors: int = 5) -> str:
        """
        Многошаговый обход графа (Multi-Hop) от заданных стартовых узлов (утверждений).
        """
        if not seed_claim_ids:
            return ""
            
        visited_claims: Set[uuid.UUID] = set(seed_claim_ids)
        current_layer: Set[uuid.UUID] = set(seed_claim_ids)
        
        all_relations_text = []
        
        for depth in range(1, max_depth + 1):
            if not current_layer:
                break
                
            next_layer = set()
            
            # 1. Прямые связи через ClaimRelation (исходящие)
            stmt_out = select(ClaimRelation, Claim).join(Claim, ClaimRelation.target_claim_id == Claim.id).where(
                ClaimRelation.source_claim_id.in_(current_layer)
            )
            out_rels = (await self.db.execute(stmt_out)).all()
            
            # 2. Прямые связи через ClaimRelation (входящие)
            stmt_in = select(ClaimRelation, Claim).join(Claim, ClaimRelation.source_claim_id == Claim.id).where(
                ClaimRelation.target_claim_id.in_(current_layer)
            )
            in_rels = (await self.db.execute(stmt_in)).all()
            
            # Собираем и ранжируем
            edges = []
            
            for rel, target_claim in out_rels:
                if target_claim.id not in visited_claims:
                    edges.append({
                        "source_id": rel.source_claim_id,
                        "target_claim": target_claim,
                        "type": rel.relation_type,
                        "conf": rel.confidence,
                        "priority": EDGE_PRIORITY.get(rel.relation_type, 0)
                    })
                    
            for rel, source_claim in in_rels:
                if source_claim.id not in visited_claims:
                    edges.append({
                        "source_id": rel.target_claim_id, # perspective from current layer
                        "target_claim": source_claim,
                        "type": f"<-{rel.relation_type}-", # Reverse notation
                        "conf": rel.confidence,
                        "priority": EDGE_PRIORITY.get(rel.relation_type, 0)
                    })
            
            # 3. Транзитные связи через Entity
            stmt_entities = select(claim_entities).where(claim_entities.c.claim_id.in_(current_layer))
            entities_links = (await self.db.execute(stmt_entities)).mappings().all()
            entity_ids = [e["entity_id"] for e in entities_links]
            
            if entity_ids:
                stmt_entity_claims = select(claim_entities, Claim).join(Claim, claim_entities.c.claim_id == Claim.id).where(
                    claim_entities.c.entity_id.in_(entity_ids),
                    claim_entities.c.claim_id.notin_(visited_claims)
                )
                entity_claims_rels = (await self.db.execute(stmt_entity_claims)).all()
                for c_id, ent_id, e_claim in entity_claims_rels:
                     edges.append({
                        "source_id": None, # Transitive, not direct
                        "target_claim": e_claim,
                        "type": "shares_entity",
                        "conf": 1.0,
                        "priority": 1 # Lower priority
                     })
                     
            # Sort edges by priority and limit
            edges.sort(key=lambda x: (x["priority"], x["conf"]), reverse=True)
            edges = edges[:limit_neighbors]
            
            # Process selected edges
            for edge in edges:
                target_claim = edge["target_claim"]
                next_layer.add(target_claim.id)
                visited_claims.add(target_claim.id)
                
                # We need source claim text
                if edge["source_id"]:
                    source_claim = await self.db.get(Claim, edge["source_id"])
                    source_text = source_claim.content if source_claim else "Unknown"
                    if edge["type"].startswith("<-"):
                        all_relations_text.append(f"[GRAPH RELATION] \"{target_claim.content}\" --({edge['type'][2:-2]})--> \"{source_text}\" (conf: {edge['conf']:.2f})")
                    else:
                        all_relations_text.append(f"[GRAPH RELATION] \"{source_text}\" --({edge['type']})--> \"{target_claim.content}\" (conf: {edge['conf']:.2f})")
                else:
                    all_relations_text.append(f"[GRAPH RELATION] Транзитная связь через сущность --> \"{target_claim.content}\"")
                    
            current_layer = next_layer
            
        if not all_relations_text:
            return ""
            
        return "\n".join(all_relations_text)
