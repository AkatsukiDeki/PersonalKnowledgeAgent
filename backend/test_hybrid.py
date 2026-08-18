import asyncio
import os
import uuid
from app.db.session import async_session_factory
from app.api.chat import _build_context_and_check_evidence
from app.schemas.chat import ChatRequest
from app.knowledge.retrieval import hybrid_search

async def test():
    async with async_session_factory() as db:
        q = "Какая база данных используется в проекте для векторного поиска?"
        res = await hybrid_search(db, q, q, limit=5)
        for r in res:
            print(f"Similarity: {r.get('similarity'):.3f}, rrf: {r.get('rrf_score'):.3f}, text: {r.get('text_content')[:100]}")

if __name__ == "__main__":
    asyncio.run(test())
