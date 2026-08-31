import asyncio
import time
import statistics
import sys
import os
from typing import List, Dict, Any

# Ensure we can import app
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

# Импорты ядра PKA
from app.db.session import async_session_factory
from app.knowledge.retrieval import hybrid_search
from app.knowledge.embeddings.factory import get_embedding_provider
from app.core.llm import model_manager as llm_service
from app.core.profiler import LatencyProfiler

TEST_QUERIES = [
    {
        "id": "short_keyword",
        "query": "Docker compose volumes",
        "description": "Короткий ключевой запрос"
    },
    {
        "id": "realistic_semantic",
        "query": "Как устроена изоляция контейнеров и монтирование томов в DevSecOps пайплайне?",
        "description": "Реалистичный поисковый запрос (DevSecOps)"
    },
    {
        "id": "complex_long",
        "query": "Архитектурные различия между моделями извлечения концептов Map-Reduce и прямым чанкингом для построения графа знаний",
        "description": "Длинный концептуальный запрос"
    }
]

async def benchmark_pipeline():
    print("=" * 80)
    print("🚀 ЗАПУСК БЕНЧМАРКА LOCAL RAG (BASELINE v1.7.0)")
    print("=" * 80)

    async with async_session_factory() as db:
        res = await db.execute(text("SELECT COUNT(*) FROM chunks"))
        chunk_count = res.scalar()
        print(f"Total chunks in DB: {chunk_count}")
        
        for scenario in TEST_QUERIES:
            q = scenario["query"]
            print(f"\n[Сценарий: {scenario['id']}] — {scenario['description']}")
            print(f"Query: \"{q}\"")
            print("-" * 80)

            # 1. Cold Embedding Run
            embedding_provider = get_embedding_provider()
            
            t0 = time.perf_counter()
            vec = await embedding_provider.embed_query(q)
            cold_emb_ms = (time.perf_counter() - t0) * 1000

            # 2. Warm Embedding Run
            t0 = time.perf_counter()
            vec_warm = await embedding_provider.embed_query(q)
            warm_emb_ms = (time.perf_counter() - t0) * 1000

            print(f"• Embedding Latency: Cold = {cold_emb_ms:.1f} ms | Warm (Cache Hit) = {warm_emb_ms:.2f} ms")

            # 3. Hybrid Search Runs (5 итераций для p50 / p95)
            timings_history: List[Dict[str, int]] = []
            
            results = []
            for iteration in range(5):
                profiler = LatencyProfiler()
                results = await hybrid_search(
                    db=db,
                    original_query=q,
                    search_query=q,
                    limit=5,
                    profiler=profiler
                )
                timings_history.append(profiler.timings)

            # Агрегация метрик
            t_sql_vals = [t.get("t_sql_ms", 0) for t in timings_history]
            t_vec_vals = [t.get("t_vector_ms", 0) for t in timings_history]
            t_bm25_vals = [t.get("t_bm25_ms", 0) for t in timings_history]
            t_rrf_vals = [t.get("t_rrf_ms", 0) for t in timings_history]
            
            print(f"• SQL/Retrieval Total: p50 = {statistics.median(t_sql_vals):.1f} ms | p95 = {max(t_sql_vals):.1f} ms")
            if any(t_vec_vals):
                print(f"  └── Vector (pgvector): p50 = {statistics.median(t_vec_vals):.1f} ms")
                print(f"  └── Text (BM25 GIN): p50 = {statistics.median(t_bm25_vals):.1f} ms")
                print(f"  └── RRF (Python): p50 = {statistics.median(t_rrf_vals):.1f} ms")
            print(f"• Top-K Chunks retrieved: {len(results)}")

            # 4. LLM TTFT & Generation Benchmark
            t_start_llm = time.perf_counter()
            ttft_ms = None
            total_tokens = 0
            
            # Собираем контекст
            context_str = "\n".join([r["text_content"] for r in results]) if results else ""
            
            from app.core.llm import TaskType
            async for token in llm_service.stream_text(
                task_type=TaskType.ROUTINE_QA,
                prompt=q,
                system_instruction=f"Контекст:\n{context_str}\n\nОтветь на вопрос."
            ):
                if ttft_ms is None:
                    ttft_ms = (time.perf_counter() - t_start_llm) * 1000
                total_tokens += 1
                
            total_gen_ms = (time.perf_counter() - t_start_llm) * 1000
            tok_sec = (total_tokens / (total_gen_ms / 1000)) if total_gen_ms > 0 else 0

            print(f"• LLM Prefill & TTFT: {ttft_ms:.1f} ms")
            print(f"• LLM Generation: {total_gen_ms:.1f} ms ({total_tokens} tokens @ {tok_sec:.1f} tok/s)")
            print(f"• TOTAL REQUEST TIME: {(warm_emb_ms + statistics.median(t_sql_vals) + total_gen_ms):.1f} ms")

if __name__ == "__main__":
    asyncio.run(benchmark_pipeline())
