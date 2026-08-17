from typing import List, Optional, Dict
from datetime import datetime
from pydantic import BaseModel, ConfigDict
import uuid

class FilePreview(BaseModel):
    relative_path: str
    status: str  # "new", "modified", "unchanged", "deleted"
    tags: List[str] = []
    domain: Optional[str] = None
    size_bytes: int

class ImportPreview(BaseModel):
    vault_name: str
    total_files: int
    new_files: int
    modified_files: int
    unchanged_files: int
    deleted_files: int
    files: List[FilePreview]

class ImportJobState(BaseModel):
    id: str
    status: str  # "pending", "processing", "completed", "failed", "cancelled"
    vault_name: str
    total_files: int
    processed_files: int = 0
    imported_count: int = 0
    modified_count: int = 0
    skipped_count: int = 0
    deleted_count: int = 0
    failed_count: int = 0
    errors: List[str] = []
    detected_tags: List[str] = []
    detected_domains: List[str] = []
    created_at: datetime
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
