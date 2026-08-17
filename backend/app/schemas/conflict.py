from pydantic import BaseModel
import uuid
from typing import Optional
from datetime import datetime

class ConflictBase(BaseModel):
    claim_a_id: uuid.UUID
    claim_b_id: uuid.UUID
    status: str = "unresolved"
    resolution_summary: Optional[str] = None

class ConflictCreate(ConflictBase):
    pass

class ConflictResponse(ConflictBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
