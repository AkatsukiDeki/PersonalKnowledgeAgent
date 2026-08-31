"""Hybrid search: vector (HNSW) + full-text (GIN) with RRF fusion."""

import time
import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .embeddings.factory import get_embedding_provider

logger = logging.getLogger(__name__)


async def hybrid_search(
    db: AsyncSession,
    original_query: str,
    search_query: str,
    source_ids: Optional[List[str]] = None,
    limit: int = 5,
    include_history: bool = False,
    profiler = None,
) -> List[Dict[str, Any]]:
    """Run hybrid vector + full-text search with micro-benchmarking."""

    # 1. Замер времени генерации эмбеддинга
    t_emb_start = time.perf_counter()
    provider = get_embedding_provider()
    query_embedding = await provider.embed_query(search_query)
    emb_str = str(list(query_embedding))
    t_emb_duration = time.perf_counter() - t_emb_start
    if profiler:
        profiler.timings["t_emb_ms"] = int(t_emb_duration * 1000)

    # 2. Vector Search
    t_vec_start = time.perf_counter()
    sql_vector = text("""
        SELECT c.id, c.source_id, c.text_content, 
               (c.embedding <=> CAST(:embedding AS vector)) as distance
        FROM chunks c
        WHERE (:include_history = TRUE OR c.is_active = TRUE)
          AND (:has_source_filter = FALSE OR c.source_id = ANY(:source_ids))
          AND c.embedding IS NOT NULL
        ORDER BY distance
        LIMIT 10
    """)
    res_vec = await db.execute(sql_vector, {
        "embedding": emb_str,
        "include_history": include_history,
        "has_source_filter": source_ids is not None and len(source_ids) > 0,
        "source_ids": source_ids if source_ids else [],
    })
    vector_rows = [dict(row) for row in res_vec.mappings().all()]
    t_vec_duration = time.perf_counter() - t_vec_start

    # 3. Full-Text Search (BM25)
    t_bm25_start = time.perf_counter()
    import re
    # Очистка и усечение запроса для GIN-индекса
    raw_combined = f"{original_query} {search_query}"
    safe_text_query = re.sub(r'[^\w\s]', ' ', raw_combined)
    safe_text_query = " ".join(safe_text_query.split()[:30])

    sql_text = text("""
        SELECT c.id, c.source_id, c.text_content,
               ts_rank_cd(c.tsv, plainto_tsquery('russian', :combined_query)) as score
        FROM chunks c
        WHERE (:include_history = TRUE OR c.is_active = TRUE)
          AND (:has_source_filter = FALSE OR c.source_id = ANY(:source_ids))
          AND c.tsv @@ plainto_tsquery('russian', :combined_query)
        ORDER BY score DESC
        LIMIT 10
    """)
    res_text = await db.execute(sql_text, {
        "combined_query": safe_text_query,
        "include_history": include_history,
        "has_source_filter": source_ids is not None and len(source_ids) > 0,
        "source_ids": source_ids if source_ids else [],
    })
    text_rows = [dict(row) for row in res_text.mappings().all()]
    t_bm25_duration = time.perf_counter() - t_bm25_start

    # 4. RRF Merge
    t_rrf_start = time.perf_counter()
    v_rank = {row['id']: i+1 for i, row in enumerate(vector_rows)}
    t_rank = {row['id']: i+1 for i, row in enumerate(text_rows)}

    all_ids = set(v_rank.keys()) | set(t_rank.keys())
    rows_by_id = {row['id']: row for row in vector_rows + text_rows}

    merged = []
    for cid in all_ids:
        vr = v_rank.get(cid)
        tr = t_rank.get(cid)
        rrf_score = (1.0 / (60 + vr) if vr else 0.0) + (1.0 / (60 + tr) if tr else 0.0)
        row = rows_by_id[cid]
        merged.append({
            "chunk_id": cid,
            "source_id": row["source_id"],
            "text_content": row["text_content"],
            "rrf_score": rrf_score,
            "similarity": 1.0 - row["distance"] if "distance" in row else 0.0
        })

    merged.sort(key=lambda x: x["rrf_score"], reverse=True)
    rows = merged[:limit]
    t_rrf_duration = time.perf_counter() - t_rrf_start
    t_sql_duration = t_vec_duration + t_bm25_duration + t_rrf_duration
    if profiler:
        profiler.timings["t_sql_ms"] = int(t_sql_duration * 1000)
        profiler.timings["t_vector_ms"] = int(t_vec_duration * 1000)
        profiler.timings["t_bm25_ms"] = int(t_bm25_duration * 1000)
        profiler.timings["t_rrf_ms"] = int(t_rrf_duration * 1000)

    print(f"  └── [HYBRID SEARCH BREAKDOWN] Embedding calc: {t_emb_duration:.3f}s | Vector: {t_vec_duration:.3f}s | Text: {t_bm25_duration:.3f}s | Merge: {t_rrf_duration:.3f}s")

    return rows