from pydantic import BaseModel
from typing import Dict, List, Optional
from datetime import datetime
import uuid


class ImportJobResponse(BaseModel):
    job_id: uuid.UUID
    status: str
    created_at: datetime


class ImportSummary(BaseModel):
    total_conversations: int
    total_topics: int
    new_conversations: int
    updated_conversations: int
    skipped_conversations: int
    domains: Dict[str, int]


class ConversationPreview(BaseModel):
    external_id: str
    title: str
    status: str  # "new", "updated", "skipped"
    domain: str
    topics_count: int
    messages_count: int


class ImportPreviewResponse(BaseModel):
    job_id: uuid.UUID
    summary: ImportSummary
    conversations_preview: List[ConversationPreview]


class CommitImportRequest(BaseModel):
    mode: str  # "FULL", "NEW_ONLY", "UPDATE", "SELECTIVE"
    selected_external_ids: Optional[List[str]] = None
