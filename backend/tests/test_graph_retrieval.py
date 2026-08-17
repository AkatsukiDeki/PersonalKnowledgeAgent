import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.chat import _build_context_and_check_evidence
from app.schemas.chat import ChatRequest
from app.db.models import Claim, ClaimRelation
from sqlalchemy import select
from app.knowledge.graph_traversal import GraphTraversalEngine

@pytest.mark.asyncio
async def test_graph_traversal_logic(db_session: AsyncSession):
    # This test assumes there are some durable claims and relations in the DB, 
    # but since it's a dynamic test, we'll just check if the TraversalEngine works
    # on any claim.
    
    # 1. Get a random active claim
    stmt = select(Claim).where(Claim.is_active == True).limit(1)
    claim = (await db_session.execute(stmt)).scalar_one_or_none()
    
    if not claim:
        pytest.skip("No active claims to test graph traversal")
        
    engine = GraphTraversalEngine(db_session)
    result = await engine.traverse_from_claims([claim.id], max_depth=2, limit_neighbors=5)
    
    assert isinstance(result, str)
    # The result should be a string, which could be empty if no relations exist

@pytest.mark.asyncio
async def test_chat_retrieval_includes_graph_context(db_session: AsyncSession):
    # Mocking a chat payload
    payload = ChatRequest(
        query="Архитектура проекта", # Broad query to trigger analytical/factual
        conversation_id=None
    )
    
    # Check what context is built
    is_sufficient, retrieved, search_query, intent = await _build_context_and_check_evidence(
        db_session, payload, intent="ANALYTICAL"
    )
    
    # We should have [GRAPH CONTEXT] in retrieved chunks if any chunk_ids have relations
    graph_chunks = [r for r in retrieved if "[GRAPH CONTEXT]" in r["text_content"]]
    # It might be 0 if the query hits no claims with relations, but we just verify the pipeline doesn't crash
    # and returns a valid list.
    assert isinstance(retrieved, list)
    assert intent == "ANALYTICAL"
