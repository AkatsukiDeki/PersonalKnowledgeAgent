import asyncio
import os
from app.db.session import async_session_factory
from app.api.chat import _build_context_and_check_evidence
from app.schemas.chat import ChatRequest
import uuid

async def test_factual():
    async with async_session_factory() as db:
        req = ChatRequest(
            query="Какая база данных используется в проекте для векторного поиска?",
            history=[],
            conversation_id=uuid.uuid4(),
            stream=False
        )
        is_sufficient, context, sq, intent = await _build_context_and_check_evidence(db, req, "FACTUAL")
        print(f"Is Sufficient: {is_sufficient}")
        for c in context:
            print(f"Similarity: {c.get('similarity')}, Text: {c.get('text_content')[:100]}")

if __name__ == "__main__":
    asyncio.run(test_factual())
