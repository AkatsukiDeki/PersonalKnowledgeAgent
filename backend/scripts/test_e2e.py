import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.models import Source
from app.db.session import async_session_factory
from app.knowledge.ingestion import create_source_db, process_source_chunks_bg
from app.knowledge.retrieval import hybrid_search

async def test_e2e():
    print("Testing End-to-End Ingestion -> Retrieval...")
    async with async_session_factory() as db:
        # 1. Ingestion
        print("1. Creating Source...")
        title = "E2E Test Source"
        content = "This is a strictly formatted E2E test source about quantum entanglement and gravitational waves."
        
        source = await create_source_db(db, title, content, "note", {})
        print(f"   Source created: {source.id}")
        
    # Process chunks in background manually
    print("2. Processing chunks (generating embeddings)...")
    await process_source_chunks_bg(source.id)
    
    async with async_session_factory() as db:
        # Check if it succeeded
        source = await db.get(Source, source.id)
        print(f"   Status: {source.status}")
        if source.status != "completed":
            print(f"   FAILED: {source.error_message}")
            return
            
        print("3. Testing Retrieval...")
        retrieved = await hybrid_search(db, "What is quantum entanglement?", "What is quantum entanglement?", limit=1)
        
        if retrieved:
            print(f"   Success! Retrieved: {retrieved[0]['text_content']}")
        else:
            print("   Failed to retrieve anything.")

if __name__ == "__main__":
    if sys.platform.startswith("win"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(test_e2e())
