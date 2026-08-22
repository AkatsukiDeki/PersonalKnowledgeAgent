import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class SourceBase(BaseModel):
    title: str
    domain: Optional[str] = None
    importance: str = "normal"
    folder: Optional[str] = None


class SourceCreate(SourceBase):
    content: str
    source_type: str = "note"
    meta_info: Dict[str, Any] = Field(default_factory=dict)


class SourceUpdateContent(BaseModel):
    raw_content: str
    domain: Optional[str] = None


class SourceUpdateFolder(BaseModel):
    folder: Optional[str] = None


class ChunkSimple(BaseModel):
    id: str
    chunk_index: int
    text_content: str


class ClaimSimple(BaseModel):
    id: str
    content: str
    claim_type: str
    category: Optional[str] = None
    confidence: float
    is_active: bool
    superseded_by: Optional[str] = None


class SourceResponse(BaseModel):
    id: uuid.UUID
    title: str
    content: Optional[str] = None
    source_type: str
    meta_info: Dict[str, Any] = Field(default_factory=dict)
    file_type: Optional[str] = None
    original_file_path: Optional[str] = None
    raw_content: Optional[str] = None
    domain: Optional[str] = None
    folder: Optional[str] = None
    version: int
    is_deleted: bool
    metadata_info: Dict[str, Any] = Field(default_factory=dict)
    status: str
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    chunks_count: int = 0
    claims_count: int = 0

    class Config:
        from_attributes = True


class SourceDetailResponse(SourceResponse):
    chunks: List[ChunkSimple] = []
    claims: List[ClaimSimple] = []
