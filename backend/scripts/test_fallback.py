import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.session import async_session_factory
from app.knowledge.retrieval import hybrid_search
from app.db.models import Source

async def test_fallback():
    async with async_session_factory() as db:
        history_text = "user: Как организована архитектура SecAutomation Core?"
        current_query = "а как они изолируются при запуске?"
        
        fallback_query = f"{history_text} {current_query}".strip()
        print(f"Fallback Query for search: '{fallback_query}'")
        
        retrieved = await hybrid_search(db, original_query=current_query, search_query=fallback_query, limit=3)
        
        if retrieved:
            for i, chunk in enumerate(retrieved):
                print(f"\n--- Result {i+1} (Score: {chunk.get('rrf_score')}) ---")
                
                source = await db.get(Source, chunk["source_id"])
                print(f"Source Title: {source.title}")
                print(f"Content snippet: {chunk['text_content'][:150]}...")
        else:
            print("No results found.")

if __name__ == "__main__":
    if sys.platform.startswith("win"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(test_fallback())
