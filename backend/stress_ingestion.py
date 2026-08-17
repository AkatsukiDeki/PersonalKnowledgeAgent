import asyncio
import time
from app.db.session import async_session_factory
from app.knowledge.ingestion import create_source_db, process_source_chunks_bg

async def run_stress():
    docs = [
        ("Git Best Practices", "Никогда не делайте push -f в master. Используйте feature-ветки и pull requests. Избегайте гигантских коммитов (bugfix, update). Это мешает код-ревью."),
        ("Architecture", "Микросервисы усложняют дебаг, но улучшают изоляцию сбоев. В монолите одна утечка памяти кладет все. В PKA мы используем FastAPI для бэкенда и React для UI."),
        ("RAG Concepts", "Векторный поиск хорош для смысла, но плох для ключевых слов. Гибридный поиск (Hybrid Search) объединяет векторный поиск и BM25 (полнотекстовый). RRF (Reciprocal Rank Fusion) позволяет смешивать результаты."),
        ("DevOps CI/CD", "Принцип Lean в CALMS подчеркивает важность быстрого получения обратной связи. Автоматизация тестирования минимизирует время от внесения изменений до релиза.")
    ]
    
    print("Starting Stress Ingestion...")
    start_time = time.time()
    
    for idx, (title, content) in enumerate(docs):
        print(f"[{idx+1}/{len(docs)}] Ingesting: {title}")
        async with async_session_factory() as db:
            source = await create_source_db(db, title=title, content=content)
        await process_source_chunks_bg(source.id)
    
    total_time = time.time() - start_time
    print(f"Finished ingestion of {len(docs)} documents in {total_time:.2f}s")

if __name__ == "__main__":
    asyncio.run(run_stress())
