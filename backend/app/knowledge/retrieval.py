"""Hybrid search: vector (HNSW) + full-text (GIN) with RRF fusion."""

import time
import logging
from typing import Any, Dict, List

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .embeddings.factory import get_embedding_provider

logger = logging.getLogger(__name__)


async def hybrid_search(
    db: AsyncSession,
    original_query: str,
    search_query: str,
    limit: int = 5,
    include_history: bool = False,
) -> List[Dict[str, Any]]:
    """Run hybrid vector + full-text search with micro-benchmarking."""

    # 1. Замер времени генерации эмбеддинга
    t_emb_start = time.perf_counter()
    provider = get_embedding_provider()
    query_embedding = await provider.embed_query(search_query)
    emb_str = str(list(query_embedding))
    t_emb_duration = time.perf_counter() - t_emb_start

    # 2. Замер времени выполнения SQL в Postgres
    t_sql_start = time.perf_counter()
    sql = text("""
    WITH vector_search AS (
        SELECT c.id, c.source_id, c.text_content, 
               (c.embedding <=> CAST(:embedding AS vector)) as distance
        FROM chunks c
        WHERE (:include_history = TRUE OR c.is_active = TRUE)
          AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> CAST(:embedding AS vector)
        LIMIT 10
    ),
    ranked_vector AS (
        SELECT id, source_id, text_content, distance,
               ROW_NUMBER() OVER (ORDER BY distance) as rank
        FROM vector_search
    ),
    text_search AS (
        SELECT c.id, c.source_id, c.text_content,
               ts_rank_cd(c.tsv, plainto_tsquery('russian', :combined_query)) as score
        FROM chunks c
        WHERE (:include_history = TRUE OR c.is_active = TRUE)
          AND c.tsv @@ plainto_tsquery('russian', :combined_query)
        ORDER BY score DESC
        LIMIT 10
    ),
    ranked_text AS (
        SELECT id, source_id, text_content,
               ROW_NUMBER() OVER (ORDER BY score DESC) as rank
        FROM text_search
    ),
    combined AS (
        SELECT COALESCE(v.id, t.id) as id,
               COALESCE(v.source_id, t.source_id) as source_id,
               COALESCE(v.text_content, t.text_content) as text_content,
               v.rank as v_rank,
               t.rank as t_rank,
               v.distance
        FROM ranked_vector v
        FULL OUTER JOIN ranked_text t ON v.id = t.id
    )
    SELECT
        id as chunk_id,
        source_id,
        text_content,
        COALESCE(1.0 / (60 + v_rank), 0.0) + COALESCE(1.0 / (60 + t_rank), 0.0) as rrf_score,
        COALESCE(1.0 - distance, 0.0) as similarity
    FROM combined
    ORDER BY rrf_score DESC
    LIMIT :limit
    """)

    import re
    # Очистка и усечение запроса для GIN-индекса (предотвращает зависания на кусках кода)
    raw_combined = f"{original_query} {search_query}"
    safe_text_query = re.sub(r'[^\w\s]', ' ', raw_combined)
    safe_text_query = " ".join(safe_text_query.split()[:30])

    result = await db.execute(sql, {
        "embedding": emb_str,
        "combined_query": safe_text_query,
        "limit": limit,
        "include_history": include_history,
    })
    rows = [dict(row) for row in result.mappings().all()]
    t_sql_duration = time.perf_counter() - t_sql_start

    print(f"  └── [HYBRID SEARCH BREAKDOWN] Embedding calc: {t_emb_duration:.3f}s | Postgres SQL: {t_sql_duration:.3f}s")

    return rows