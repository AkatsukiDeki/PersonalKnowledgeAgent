"""Hybrid search: vector (HNSW) + full-text (GIN) with RRF fusion."""

from typing import Any, Dict, List

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .embeddings.factory import get_embedding_provider


async def hybrid_search(
    db: AsyncSession,
    original_query: str,
    search_query: str,
    limit: int = 5,
    include_history: bool = False,
) -> List[Dict[str, Any]]:
    """Run hybrid vector + full-text search with Reciprocal Rank Fusion."""

    provider = get_embedding_provider()
    query_embedding = await provider.embed_query(search_query)

    active_filter = "" if include_history else "JOIN claims cl ON cl.chunk_id = c.id WHERE cl.is_active = True AND c.is_active = True"

    sql = text(f"""
    WITH vector_search AS (
        SELECT DISTINCT c.id, c.source_id, c.text_content, c.embedding, (c.embedding <=> CAST(:embedding AS vector)) as distance
        FROM chunks c
        {active_filter}
        ORDER BY distance
        LIMIT 20
    ),
    ranked_vector AS (
        SELECT id, source_id, text_content, distance,
               ROW_NUMBER() OVER (ORDER BY distance) as rank
        FROM vector_search
    ),
    text_search AS (
        SELECT DISTINCT c.id, c.source_id, c.text_content,
               ts_rank_cd(c.tsv, plainto_tsquery('russian', :combined_query)) as score
        FROM chunks c
        {active_filter}
        {("AND" if include_history else "AND") if active_filter else "WHERE"} c.tsv @@ plainto_tsquery('russian', :combined_query)
        ORDER BY score DESC
        LIMIT 20
    ),
    ranked_text AS (
        SELECT id, source_id, text_content,
               ROW_NUMBER() OVER (ORDER BY score DESC) as rank
        FROM text_search
    )
    SELECT
        COALESCE(v.id, t.id) as chunk_id,
        COALESCE(v.source_id, t.source_id) as source_id,
        COALESCE(v.text_content, t.text_content) as text_content,
        COALESCE(1.0 / (60 + v.rank), 0.0) + COALESCE(1.0 / (60 + t.rank), 0.0) as rrf_score,
        COALESCE(1.0 - v.distance, 0.0) as similarity
    FROM ranked_vector v
    FULL OUTER JOIN ranked_text t ON v.id = t.id
    ORDER BY rrf_score DESC
    LIMIT :limit
    """)

    result = await db.execute(sql, {
        "embedding": str(list(query_embedding)),
        "combined_query": f"{original_query} {search_query}",
        "limit": limit,
    })

    return [dict(row) for row in result.mappings().all()]