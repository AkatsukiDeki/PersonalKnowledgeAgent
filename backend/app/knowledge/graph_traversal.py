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

    async def traverse_from_claims(
        self,
        seed_claim_ids: List[uuid.UUID],
        max_depth: int = 2,
        limit_neighbors: int = 5
    ) -> str:
        """
        Многошаговый обход графа (Multi-Hop) за 1 SQL-запрос.
        - Исключает N+1 через JOIN исходного и целевого утверждений.
        - Отслеживает visited_ids для защиты от циклических зависимостей.
        - Применяет ранжирование связей и лимит соседей.
        """
        if not seed_claim_ids:
            return ""

        from sqlalchemy import literal, func, union_all, case, and_
        from sqlalchemy.orm import aliased
        from sqlalchemy.dialects.postgresql import array

        # Веса типов связей для детерминированного приоритета
        priority_case = case(
            (ClaimRelation.relation_type == "supersedes", 4),
            (ClaimRelation.relation_type == "contradicts", 3),
            (ClaimRelation.relation_type == "depends_on", 3),
            (ClaimRelation.relation_type == "supports", 2),
            (ClaimRelation.relation_type == "applies_to", 2),
            (ClaimRelation.relation_type == "used_in", 2),
            else_=0
        )

        # 1. Приводим ребра к двунаправленному виду: u -> v
        # Исходящие
        out_edges = select(
            ClaimRelation.source_claim_id.label("from_id"),
            ClaimRelation.target_claim_id.label("to_id"),
            ClaimRelation.relation_type.label("relation_type"),
            ClaimRelation.confidence.label("confidence"),
            priority_case.label("priority")
        )
        # Входящие (инвертируем направление, помечая реверс)
        in_edges = select(
            ClaimRelation.target_claim_id.label("from_id"),
            ClaimRelation.source_claim_id.label("to_id"),
            func.concat("<-", ClaimRelation.relation_type, "-").label("relation_type"),
            ClaimRelation.confidence.label("confidence"),
            priority_case.label("priority")
        )
        unified_edges = union_all(out_edges, in_edges).subquery("unified_edges")

        # 2. Anchor (Базовый уровень CTE)
        # Начинаем с seed-узлов на глубине 0
        anchor_stmt = select(
            literal(None, type_=unified_edges.c.from_id.type).label("source_id"),
            Claim.id.label("target_id"),
            literal(None, type_=unified_edges.c.relation_type.type).label("relation_type"),
            literal(1.0).label("confidence"),
            literal(0).label("priority"),
            literal(0).label("depth"),
            array([Claim.id]).label("visited_ids")
        ).where(Claim.id.in_(seed_claim_ids))

        graph_cte = anchor_stmt.cte(name="graph_traversal", recursive=True)

        # 3. Recursive Part CTE
        # Раскрываем соседей, фильтруя циклы через проверку в массиве visited_ids
        recurse_stmt = select(
            graph_cte.c.target_id.label("source_id"),
            unified_edges.c.to_id.label("target_id"),
            unified_edges.c.relation_type.label("relation_type"),
            unified_edges.c.confidence.label("confidence"),
            unified_edges.c.priority.label("priority"),
            (graph_cte.c.depth + 1).label("depth"),
            func.array_append(graph_cte.c.visited_ids, unified_edges.c.to_id).label("visited_ids")
        ).join(
            unified_edges,
            unified_edges.c.from_id == graph_cte.c.target_id
        ).where(
            and_(
                graph_cte.c.depth < max_depth,
                # Защита от циклов: узел не должен присутствовать в истории текущего пути
                ~unified_edges.c.to_id.op("=")(func.any(graph_cte.c.visited_ids))
            )
        )

        graph_cte = graph_cte.union_all(recurse_stmt)

        # 4. Оконная фильтрация (ROW_NUMBER) и сбор контента Claim без N+1
        SourceClaim = aliased(Claim, name="source_claim")
        TargetClaim = aliased(Claim, name="target_claim")

        ranked_subq = select(
            graph_cte.c.source_id,
            graph_cte.c.target_id,
            graph_cte.c.relation_type,
            graph_cte.c.confidence,
            graph_cte.c.depth,
            func.row_number().over(
                partition_by=[graph_cte.c.source_id, graph_cte.c.depth],
                order_by=[graph_cte.c.priority.desc(), graph_cte.c.confidence.desc()]
            ).label("rn")
        ).where(graph_cte.c.depth > 0).subquery("ranked_edges")

        final_query = (
            select(
                ranked_subq.c.depth,
                ranked_subq.c.relation_type,
                ranked_subq.c.confidence,
                SourceClaim.content.label("source_content"),
                TargetClaim.content.label("target_content")
            )
            .join(SourceClaim, SourceClaim.id == ranked_subq.c.source_id)
            .join(TargetClaim, TargetClaim.id == ranked_subq.c.target_id)
            .where(ranked_subq.c.rn <= limit_neighbors)
            .order_by(ranked_subq.c.depth.asc(), ranked_subq.c.confidence.desc())
        )

        rows = (await self.db.execute(final_query)).all()
        if not rows:
            return ""

        # Формирование итогового графового контекста
        formatted_relations = []
        for row in rows:
            rel = (
                f"[Hop {row.depth}] \"{row.source_content}\" "
                f"--({row.relation_type})--> "
                f"\"{row.target_content}\" (conf: {row.confidence:.2f})"
            )
            formatted_relations.append(rel)

        return "\n".join(formatted_relations)
