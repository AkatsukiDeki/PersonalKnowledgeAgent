import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import httpx
from pydantic import BaseModel

from app.core.ollama_client import OllamaClient
from app.core.llm import model_manager, TaskType, ReasoningProviderUnavailableError
from google.genai.errors import APIError

class DummySchema(BaseModel):
    name: str
    age: int

@pytest.mark.asyncio
async def test_ollama_client_success():
    client = OllamaClient()
    
    with patch("httpx.AsyncClient.post") as mock_post:
        mock_response = MagicMock()
        mock_response.json.return_value = {"response": '{"name": "Alice", "age": 30}'}
        mock_post.return_value = mock_response
        
        result = await client.generate_structured("qwen2.5", "prompt", DummySchema)
        assert isinstance(result, DummySchema)
        assert result.name == "Alice"
        assert result.age == 30
        assert mock_post.call_count == 1

@pytest.mark.asyncio
async def test_ollama_client_json_validation_retry():
    client = OllamaClient()
    
    with patch("httpx.AsyncClient.post") as mock_post:
        # First call returns invalid JSON structure
        mock_response_1 = MagicMock()
        mock_response_1.json.return_value = {"response": '{"name": "Alice"}'} # missing age
        
        # Second call returns valid JSON
        mock_response_2 = MagicMock()
        mock_response_2.json.return_value = {"response": '{"name": "Alice", "age": 30}'}
        
        mock_post.side_effect = [mock_response_1, mock_response_2]
        
        result = await client.generate_structured("qwen2.5", "prompt", DummySchema)
        assert isinstance(result, DummySchema)
        assert result.age == 30
        assert mock_post.call_count == 2
        
@pytest.mark.asyncio
async def test_model_manager_extraction_fallback():
    with patch("app.core.llm.OllamaClient.generate_structured") as mock_ollama:
        mock_ollama.side_effect = httpx.RequestError("Connection refused")
        
        with patch("app.core.llm.ModelManager._gemini_structured_fallback") as mock_fallback:
            mock_fallback.return_value = DummySchema(name="Fallback", age=99)
            
            result = await model_manager.generate_structured(TaskType.EXTRACTION, DummySchema, "prompt")
            assert result.name == "Fallback"
            assert mock_ollama.called
            assert mock_fallback.called

@pytest.mark.asyncio
async def test_model_manager_synthesis_no_silent_fallback():
    with patch("app.core.llm.get_genai_client") as mock_get_client:
        mock_client = AsyncMock()
        mock_client.aio.models.generate_content.side_effect = APIError("Quota exceeded", 429)
        mock_get_client.return_value = mock_client
        
        with pytest.raises(ReasoningProviderUnavailableError):
            await model_manager.generate_structured(TaskType.DEEP_SYNTHESIS, DummySchema, "prompt")
