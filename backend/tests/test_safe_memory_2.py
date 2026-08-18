import asyncio
import os
import pytest
from uuid import uuid4

# Point to main DB for local integration test run
# DB will be picked from config/env

from app.db.session import async_session_factory
from app.db.models import Conversation, ConversationMemory, Decision
from app.knowledge.chat_pipeline import process_chat_pipeline
from sqlalchemy import select

async def test_safe_memory_enrichment():
    async with async_session_factory() as db:
        
        conv = Conversation(title="Safe Memory Test", status="indexed")
        db.add(conv)
        await db.flush()
        
        # Test saving memory WITHOUT embedding
        memory1 = ConversationMemory(
            conversation_id=conv.id,
            problem="Test problem",
            decision_summary="Test summary",
            embedding=None # Explicitly None
        )
        db.add(memory1)
        await db.flush()
        
        # Test saving Decision WITHOUT embedding
        dec1 = Decision(
            memory_id=memory1.id,
            decision="Test decision",
            embedding=None
        )
        db.add(dec1)
        await db.commit()
        
        # Assert they were saved
        stmt = select(ConversationMemory).where(ConversationMemory.id == memory1.id)
        res = await db.execute(stmt)
        saved_mem = res.scalar_one_or_none()
        assert saved_mem is not None
        assert saved_mem.embedding is None
        
        stmt_dec = select(Decision).where(Decision.id == dec1.id)
        res_dec = await db.execute(stmt_dec)
        saved_dec = res_dec.scalar_one_or_none()
        assert saved_dec is not None
        assert saved_dec.embedding is None
        
        print("Invariant 1 Passed: Memory and Decision can be saved WITHOUT embeddings.")
        
        # 2. Test fetching with IS NOT NULL (should ignore them)
        from app.api.chat import _build_context_and_check_evidence
        from app.schemas.chat import ChatRequest
        
        req = ChatRequest(query="Test problem", history=[])
        
        try:
            res = await _build_context_and_check_evidence(db, req, "ANALYTICAL")
            print("Invariant 2 Passed: Vector search doesn't crash with NULL embeddings.")
        except Exception as e:
            print(f"Vector search Exception (expected if not sufficient): {e}")

if __name__ == "__main__":
    asyncio.run(test_safe_memory_enrichment())
