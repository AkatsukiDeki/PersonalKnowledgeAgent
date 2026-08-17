import asyncio
import time
import uuid
from typing import List

from app.db.session import async_session_factory
from app.db.models import Source, Chunk, Claim, Entity, ClaimRelation, Pattern
from app.knowledge.ingestion import create_source_db, process_source_chunks_bg
from sqlalchemy import text, delete

async def clear_db():
    async with async_session_factory() as db:
        await db.execute(delete(Pattern))
        await db.execute(delete(ClaimRelation))
        await db.execute(delete(Entity))
        await db.execute(delete(Claim))
        await db.execute(delete(Chunk))
        await db.execute(delete(Source))
        await db.commit()

async def get_counts():
    async with async_session_factory() as db:
        sources = await db.scalar(text("SELECT COUNT(*) FROM sources"))
        chunks = await db.scalar(text("SELECT COUNT(*) FROM chunks"))
        claims = await db.scalar(text("SELECT COUNT(*) FROM claims"))
        entities = await db.scalar(text("SELECT COUNT(*) FROM entities"))
        relations = await db.scalar(text("SELECT COUNT(*) FROM claim_relations"))
        patterns = await db.scalar(text("SELECT COUNT(*) FROM patterns"))
        return {
            "sources": sources,
            "chunks": chunks,
            "claims": claims,
            "entities": entities,
            "relations": relations,
            "patterns": patterns
        }

async def run_benchmark():
    print("Clearing DB for benchmark...")
    await clear_db()
    
    document_content = """
    Git cherry-pick — это мощная команда, которая позволяет применять изменения из существующих коммитов к текущей ветке. 
    Она часто используется для переноса багфиксов из одной ветки в другую, не перенося при этом всю историю изменений.
    В нашем проекте мы использовали cherry-pick для переноса хотфикса (коммит 7672a25) из ветки bugfix/parse_status в release/1.
    Это позволило сохранить историю линейной, без лишних merge-коммитов.
    Принцип Lean в CALMS подчеркивает важность быстрого получения обратной связи. 
    Автоматизация тестирования и развертывания помогает минимизировать время от внесения изменений до получения результатов.
    """
    
    print("Starting Ingestion Benchmark...")
    start_total = time.time()
    
    # 1. Create source
    t0 = time.time()
    async with async_session_factory() as db:
        source = await create_source_db(db, title="Benchmark Doc", content=document_content)
    t1 = time.time()
    print(f"Source Creation: {t1 - t0:.2f}s")
    
    # 2. Process chunks in background
    print("Processing chunks, embeddings, extraction, and L3/L4...")
    await process_source_chunks_bg(source.id)
    t2 = time.time()
    
    total_time = t2 - start_total
    
    counts = await get_counts()
    
    print("\n" + "="*40)
    print("BENCHMARK RESULTS")
    print("="*40)
    print(f"Total Ingestion Time: {total_time:.2f}s")
    print(f"Chunks created: {counts['chunks']}")
    print(f"Claims extracted: {counts['claims']}")
    print(f"Entities extracted: {counts['entities']}")
    print(f"Relations found: {counts['relations']}")
    print(f"Patterns found: {counts['patterns']}")
    print("="*40)

if __name__ == "__main__":
    asyncio.run(run_benchmark())
