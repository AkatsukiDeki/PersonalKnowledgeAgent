import uuid
from datetime import datetime
from typing import Any, Dict, Optional, List
from pydantic import BaseModel, ConfigDict


class ClaimBase(BaseModel):
    content: str
    claim_type: str
    category: Optional[str] = None
    confidence: float
    meta_info: Dict[str, Any] = {}
    
    is_active: bool = True
    superseded_by: Optional[uuid.UUID] = None


from .entity import EntityResponse

class ClaimResponse(ClaimBase):
    id: uuid.UUID
    source_id: uuid.UUID
    chunk_id: uuid.UUID
    entities: List[EntityResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
