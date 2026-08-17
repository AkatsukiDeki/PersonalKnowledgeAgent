from datetime import datetime
from enum import Enum
from typing import Any
from pydantic import BaseModel, Field


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"


class UnifiedMessage(BaseModel):
    external_id: str
    role: MessageRole
    content: str
    timestamp: datetime | None = None
    parent_id: str | None = None
    content_hash: str = Field(description="sha256(role + content.strip())")
    metadata: dict[str, Any] = Field(default_factory=dict)


class UnifiedConversation(BaseModel):
    provider: str  # "chatgpt" | "claude" | "gemini"
    external_id: str
    title: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    messages: list[UnifiedMessage]
    conversation_hash: str = Field(
        description="sha256(concat(msg.content_hash for msg in messages))"
    )
    metadata: dict[str, Any] = Field(default_factory=dict)


class TopicChunk(BaseModel):
    conversation_external_id: str
    provider: str
    topic_title: str
    domain: str  # "programming" | "study" | "sport" | "books" | "personal"
    start_message_id: str
    end_message_id: str
    message_ids: list[str]
    user_claims_candidates: list[str] = Field(
        description="Высказывания пользователя (кандидаты в L2 Claims)"
    )
    context_text: str = Field(
        description="Полный диалоговый контекст топика для векторизации и RAG"
    )
    content_hash: str
