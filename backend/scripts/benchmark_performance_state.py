import asyncio
import io
import time
import httpx
from datetime import datetime, timezone
from sqlalchemy import select, func

from backend.app.db.session import async_session_factory as get_session_context
from backend.app.db.models import (
    Source,
    FileRevision,
    Chunk,
    Claim,
    ClaimRelation,
    Pattern,
    TimelineEvent,
)

BASE_URL = "http://localhost:8000/api/v1"


class Color:
    PURPLE = "\033[95m"
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    BOLD = "\033[1m"
    END = "\033[0m"


def header(title: str):
    print(f"\n{Color.PURPLE}{'=' * 70}\n⚡ {title}\n{'=' * 70}{Color.END}")


async def get_system_snapshot():
    """Снимает мгновенный слепок количественного состояния БД."""
    async with get_session_context() as db:
        sources = (await db.execute(select(func.count(Source.id)))).scalar() or 0
        chunks = (await db.execute(select(func.count(Chunk.id)))).scalar() or 0
        claims = (await db.execute(select(func.count(Claim.id)))).scalar() or 0
        durable = (
            await db.execute(
                select(func.count(Claim.id)).where(Claim.memory_score >= 0.60)
            )
        ).scalar() or 0
        relations = (
            await db.execute(select(func.count(ClaimRelation.id)))
        ).scalar() or 0
        patterns = (
            await db.execute(select(func.count(Pattern.id)))
        ).scalar() or 0
        events = (
            await db.execute(select(func.count(TimelineEvent.id)))
        ).scalar() or 0

        return {
            "sources": sources,
            "chunks": chunks,
            "claims": claims,
            "durable": durable,
            "ephemeral": claims - durable,
            "relations": relations,
            "patterns": patterns,
            "timeline_events": events,
        }


async def run_performance_benchmark():
    header("PKA v2.1: БЕНЧМАРК ВРЕМЕНИ И СОСТОЯНИЯ ПАМЯТИ")

    # 1. Фиксация начального состояния
    initial_state = await get_system_snapshot()
    print(f"{Color.CYAN}Начальное состояние БД:{Color.END}")
    print(
        f"  • Источники: {initial_state['sources']} | Чанки: {initial_state['chunks']} | "
        f"Утверждения: {initial_state['claims']} (Durable: {initial_state['durable']}) | "
        f"Связи графа: {initial_state['relations']} | Инсайты: {initial_state['patterns']}"
    )

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=180.0) as client:
        # -----------------------------------------------------------------
        # ЭТАП 1: Замер скорости Ingestion (L1 Chunks -> L2 Claims Extraction)
        # -----------------------------------------------------------------
        header("ЭТАП 1: Замер загрузки и извлечения фактов (Ingestion & Claims)")

        test_article = """
# Архитектура распределенного кеширования в PKA v2.1

В новой версии системы мы отказались от локального memory-кеша и перешли на Redis Cluster.
Причина: необходимость синхронизации состояния между несколькими инстансами воркеров.

## Ключевые решения
1. Redis используется как L2-кеш для эмбеддингов и частых поисковых запросов.
2. PostgreSQL + pgvector остается основным источником истины для долговременных Claims.
3. Время жизни ключей в кеше (TTL) установлено на 3600 секунд для снижения нагрузки на GPU при повторном поиске.
4. Ограничение: максимальный объем одного значения в кеше — 64 КБ.
        """

        file_bytes = test_article.encode("utf-8")
        file_size_kb = len(file_bytes) / 1024

        print(f"  • Размер тестового документа: {file_size_kb:.2f} КБ")
        t0 = time.perf_counter()

        resp = await client.post(
            "/sources/upload",
            files={"file": ("caching_architecture.md", io.BytesIO(file_bytes), "text/markdown")},
            data={"importance": "high", "domain": "programming"},
        )
        t_upload = time.perf_counter() - t0

        if resp.status_code == 200:
            print(f"  {Color.GREEN}✓ Upload & Dispatch Latency:{Color.END} {t_upload * 1000:.1f} мс")
        else:
            print(f"  {Color.RED}✗ Ошибка загрузки: HTTP {resp.status_code}{Color.END}")

        # Ожидание фоновой экстракции
        print("  • Ожидание фоновой экстракции фактов (L1 -> L2)...", end="", flush=True)
        wait_start = time.perf_counter()
        claims_extracted = 0
        
        # Полный цикл ожидания до 45 секунд
        for _ in range(45):
            await asyncio.sleep(1.0)
            cur = await get_system_snapshot()
            if cur["claims"] > initial_state["claims"]:
                claims_extracted = cur["claims"] - initial_state["claims"]
                break
        t_extraction = time.perf_counter() - wait_start
        print(f" {Color.GREEN}Готово за {t_extraction:.2f}с{Color.END}")
        print(f"  • Извлечено новых утверждений (Claims L2): {Color.BOLD}{claims_extracted}{Color.END}")

        # -----------------------------------------------------------------
        # ЭТАП 2: Замер скорости Graph Linker (Связывание графа знаний)
        # -----------------------------------------------------------------
        header("ЭТАП 2: Замер скорости Graph Linker (Векторный пре-фильтр + LLM)")

        cur_state = await get_system_snapshot()
        new_relations = cur_state["relations"] - initial_state["relations"]
        print(f"  • Построено новых функциональных связей (Edges L3): {Color.BOLD}{new_relations}{Color.END}")
        if claims_extracted > 0:
            print(f"  • Скорость обогащения: {t_extraction / claims_extracted:.2f}с на 1 Claim")

        # -----------------------------------------------------------------
        # ЭТАП 3: Замер скорости построения Timeline (L4 Evolution Engine)
        # -----------------------------------------------------------------
        header("ЭТАП 3: Замер скорости L4 Timeline Rebuild")

        t0 = time.perf_counter()
        tl_resp = await client.post("/timeline/rebuild")
        t_timeline = time.perf_counter() - t0

        if tl_resp.status_code == 200:
            print(f"  {Color.GREEN}✓ Timeline Rebuild Latency:{Color.END} {t_timeline * 1000:.1f} мс")
        else:
            print(f"  {Color.RED}✗ Ошибка Timeline Rebuild: HTTP {tl_resp.status_code}{Color.END}")

        # -----------------------------------------------------------------
        # ЭТАП 4: Замер скорости синтеза инсайтов (L3 Insight Engine)
        # -----------------------------------------------------------------
        header("ЭТАП 4: Замер генерации инсайтов (DFS-кластеризация + Synthesis)")

        t0 = time.perf_counter()
        ins_resp = await client.post("/insights/generate")
        t_insights = time.perf_counter() - t0

        if ins_resp.status_code == 200:
            print(f"  {Color.GREEN}✓ Insight Engine Run Latency:{Color.END} {t_insights * 1000:.1f} мс")
        else:
            print(f"  {Color.RED}✗ Ошибка генерации инсайтов: HTTP {ins_resp.status_code}{Color.END}")

        # -----------------------------------------------------------------
        # ЭТАП 5: Замер задержек RAG-контура (Factual, Graph, Negative)
        # -----------------------------------------------------------------
        header("ЭТАП 5: Профайлинг RAG-контура (End-to-End Latency по типам)")

        test_queries = [
            ("FACTUAL (L1/L2)", "Для чего в PKA v2.1 используется Redis и какой у него TTL?"),
            ("GRAPH MULTI-HOP (L3)", "Какие компоненты связаны с кешированием и PostgreSQL?"),
            ("NEGATIVE / GATE", "Какая модель квантового процессора установлена на сервере кеша?"),
        ]

        rag_benchmarks = []
        for q_type, query in test_queries:
            t0 = time.perf_counter()
            chat_resp = await client.post("/chat", json={"query": query})
            lat_ms = (time.perf_counter() - t0) * 1000

            if chat_resp.status_code == 200:
                data = chat_resp.json()
                metrics = data.get("metrics", {})
                rag_benchmarks.append({
                    "type": q_type,
                    "query": query,
                    "latency_ms": lat_ms,
                    "intent": metrics.get("intent", "N/A"),
                    "layers": f"L1:{metrics.get('l1_count', 0)} | L2:{metrics.get('l2_count', 0)} | L3:{metrics.get('l3_count', 0)} | L4:{metrics.get('l4_count', 0)}",
                    "gate": "PASS" if "INSUFFICIENT_DATA" not in data.get("answer", "") else "GATE REJECT (OK)",
                })
            else:
                rag_benchmarks.append({
                    "type": q_type,
                    "query": query,
                    "latency_ms": lat_ms,
                    "intent": "ERROR",
                    "layers": "N/A",
                    "gate": f"FAIL (HTTP {chat_resp.status_code})",
                })

        for b in rag_benchmarks:
            print(f"\n  • {Color.CYAN}[{b['type']}]{Color.END}")
            print(f"    Запрос:   \"{b['query']}\"")
            print(f"    Задержка: {Color.BOLD}{b['latency_ms']:.1f} мс{Color.END}")
            print(f"    Интент:   {b['intent']} ({b['gate']})")
            print(f"    Слои:     {b['layers']}")

    # -----------------------------------------------------------------
    # ФИНАЛЬНАЯ СВОДКА СОСТОЯНИЯ
    # -----------------------------------------------------------------
    final_state = await get_system_snapshot()
    header("ИТОГОВЫЙ СРЕЗ ПАМЯТИ СИСТЕМЫ (BEFORE vs AFTER)")

    print(f"{'Параметр':<25} | {'Было':<10} | {'Стало':<10} | {'Дельта':<10}")
    print("-" * 65)
    for k in initial_state:
        delta = final_state[k] - initial_state[k]
        delta_str = f"+{delta}" if delta > 0 else str(delta)
        print(f"{k:<25} | {initial_state[k]:<10} | {final_state[k]:<10} | {Color.GREEN if delta > 0 else ''}{delta_str:<10}{Color.END}")

    print(f"\n{Color.PURPLE}{'=' * 70}\n🏁 БЕНЧМАРК УСПЕШНО ЗАВЕРШЕН\n{'=' * 70}{Color.END}\n")


if __name__ == "__main__":
    asyncio.run(run_performance_benchmark())
