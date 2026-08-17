import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict


class SourceBase(BaseModel):
    title: str
    content: str
    source_type: str = "note"
    meta_info: Dict[str, Any] = {}


class SourceCreate(SourceBase):
    pass


class SourceResponse(BaseModel):
    id: uuid.UUID
    title: str
    content: str
    source_type: str
    meta_info: Dict[str, Any] = {}

    # Source Manager 2.0 fields
    file_type: Optional[str] = None
    original_file_path: Optional[str] = None
    raw_content: Optional[str] = None
    domain: Optional[str] = None
    version: int = 1
    is_deleted: bool = False
    metadata_info: Dict[str, Any] = {}

    status: str
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    # Computed fields populated by the API
    chunks_count: int = 0
    claims_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class SourceUpdateContent(BaseModel):
    """Schema for editing the normalised text of a source."""
    raw_content: str
    domain: Optional[str] = None


class SourceDetailResponse(SourceResponse):
    """Extended detail view with chunks and claims inline."""
    chunks: List[Dict[str, Any]] = []
    claims: List[Dict[str, Any]] = []