import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from app.knowledge.intent_classifier import classify_intent
from app.knowledge.query_condenser import rewrite_query
from app.core.config import settings

@pytest.mark.asyncio
async def test_factual_strict_gate():
    # Test intent classifier fast path
    intent = await classify_intent("какая команда git?")
    # Because 'какая команда git?' has no keywords, semantic fallback would be called.
    # We can mock the model_manager to return FACTUAL.
    with patch("app.core.llm.model_manager.generate_structured", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = MagicMock(intent="FACTUAL")
        intent = await classify_intent("какая команда git?")
        assert intent == "FACTUAL"

@pytest.mark.asyncio
async def test_synthetic_relaxed_retrieval():
    # Test keyword matching fast path
    intent = await classify_intent("что общего между A и B?")
    assert intent == "ANALYTICAL"
    
    intent = await classify_intent("есть ли тут противоречия?")
    assert intent == "ANALYTICAL"

@pytest.mark.asyncio
async def test_query_condensation_entity_preservation():
    # Test fallback behavior when condensation fails
    history = [{"role": "user", "content": "hello"}]
    with patch("app.core.llm.model_manager.generate_text", new_callable=AsyncMock) as mock_llm:
        # Simulate LLM failure
        mock_llm.side_effect = Exception("API error")
        success, rewritten = await rewrite_query("world", history)
        assert success is False
        assert rewritten == "hello world"

@pytest.mark.asyncio
async def test_query_condensation_success():
    history = [{"role": "user", "content": "setup nginx"}]
    with patch("app.core.llm.model_manager.generate_text", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = "how to add logging to nginx server?"
        success, rewritten = await rewrite_query("and logging?", history)
        assert success is True
        assert rewritten == "how to add logging to nginx server?"
