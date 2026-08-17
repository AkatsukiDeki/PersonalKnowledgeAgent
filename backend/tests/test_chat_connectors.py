import pytest
from datetime import datetime, timezone
import uuid

from app.connectors.chats.models import UnifiedConversation, MessageRole
from app.connectors.chats.chatgpt import ChatGPTParser
from app.connectors.chats.segmenter import TopicSegmenter

@pytest.mark.asyncio
async def test_chatgpt_parser(tmp_path):
    import json
    
    # Mock ChatGPT conversations.json
    mock_data = [
        {
            "title": "Test Chat",
            "create_time": 1700000000,
            "update_time": 1700000000,
            "current_node": "node-3",
            "mapping": {
                "node-1": {
                    "id": "node-1",
                    "message": {
                        "id": "node-1",
                        "author": {"role": "user"},
                        "create_time": 1700000000,
                        "content": {"parts": ["Hello"]}
                    },
                    "parent": None
                },
                "node-2": {
                    "id": "node-2",
                    "message": {
                        "id": "node-2",
                        "author": {"role": "assistant"},
                        "create_time": 1700000010,
                        "content": {"parts": ["Hi there"]}
                    },
                    "parent": "node-1"
                },
                "node-3": {
                    "id": "node-3",
                    "message": {
                        "id": "node-3",
                        "author": {"role": "user"},
                        "create_time": 1700000020,
                        "content": {"parts": ["How are you?"]}
                    },
                    "parent": "node-2"
                },
                # Unrelated branch
                "node-4": {
                    "id": "node-4",
                    "message": {
                        "id": "node-4",
                        "author": {"role": "user"},
                        "create_time": 1700000030,
                        "content": {"parts": ["Ignored branch"]}
                    },
                    "parent": "node-2"
                }
            }
        }
    ]
    
    file_path = tmp_path / "conversations.json"
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(mock_data, f)
        
    parser = ChatGPTParser()
    convs = [c async for c in parser.parse(str(file_path))]
    
    assert len(convs) == 1
    conv = convs[0]
    
    assert conv.title == "Test Chat"
    assert len(conv.messages) == 3
    # Check chronological order (node-1 -> node-2 -> node-3)
    assert conv.messages[0].external_id == "node-1"
    assert conv.messages[0].role == MessageRole.USER
    assert conv.messages[1].external_id == "node-2"
    assert conv.messages[1].role == MessageRole.ASSISTANT
    assert conv.messages[2].external_id == "node-3"
    assert conv.messages[2].role == MessageRole.USER
    
    assert conv.conversation_hash is not None


def test_topic_segmenter_isolation_and_splitting():
    from app.connectors.chats.models import UnifiedMessage, MessageRole
    
    # 2 messages close in time, 1 message 5 hours later
    base_time = datetime(2023, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    time2 = datetime(2023, 1, 1, 12, 5, 0, tzinfo=timezone.utc)
    time3 = datetime(2023, 1, 1, 17, 10, 0, tzinfo=timezone.utc) # 5 hours gap
    
    msg1 = UnifiedMessage(
        external_id="1", role=MessageRole.USER, content="Fact 1", timestamp=base_time, content_hash="1"
    )
    msg2 = UnifiedMessage(
        external_id="2", role=MessageRole.ASSISTANT, content="Reply 1", timestamp=time2, content_hash="2"
    )
    msg3 = UnifiedMessage(
        external_id="3", role=MessageRole.USER, content="Fact 2", timestamp=time3, content_hash="3"
    )
    
    conv = UnifiedConversation(
        provider="test", external_id="ext-1", title="Test", messages=[msg1, msg2, msg3], conversation_hash="hash"
    )
    
    segmenter = TopicSegmenter(time_gap_hours=4)
    chunks = list(segmenter.segment(conv))
    
    # Should split into 2 topics
    assert len(chunks) == 2
    
    topic1 = chunks[0]
    topic2 = chunks[1]
    
    assert len(topic1.message_ids) == 2
    assert len(topic2.message_ids) == 1
    
    # Check user_claims_candidates isolation
    assert topic1.user_claims_candidates == ["Fact 1"]  # Assistant's "Reply 1" is missing
    assert "Reply 1" in topic1.context_text
    
    assert topic2.user_claims_candidates == ["Fact 2"]


@pytest.mark.asyncio
async def test_deduplication():
    # Test would require AsyncMock or real DB session
    pass
