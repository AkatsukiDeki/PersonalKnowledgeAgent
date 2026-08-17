import uuid
from datetime import datetime
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, ConfigDict

class EntityBase(BaseModel):
    canonical_name: str
    entity_type: str
    description: Optional[str] = None
    aliases: List[str] = []
    meta_info: Dict[str, Any] = {}

class EntityResponse(EntityBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
