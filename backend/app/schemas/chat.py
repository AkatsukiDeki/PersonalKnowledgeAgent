import uuid
from typing import List, Optional
from pydantic import BaseModel


class ChatRequest(BaseModel):
    query: str
    conversation_id: Optional[uuid.UUID] = None
    history: List[dict] = []
    use_reasoning: bool = False
    mode: str = "assistant"
    attached_source_ids: List[uuid.UUID] = []
    image_base64: Optional[str] = None
    image_mime_type: Optional[str] = "image/png"


class Citation(BaseModel):
    chunk_id: uuid.UUID
    source_id: uuid.UUID
    text_snippet: str
    score: float


class ChatResponse(BaseModel):
    answer: str
    citations: List[Citation]
    metrics: Optional[dict] = None