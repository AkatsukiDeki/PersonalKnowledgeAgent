from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import date, datetime
from uuid import UUID

class ReadinessCreate(BaseModel):
    sleep_hours: float
    sleep_quality: int # 1-5
    tapping_count: int
    mental_clarity: int # 1-5
    physical_freshness: int # 1-5
    motivation: int # 1-5
    is_baseline: bool = True

class ReadinessResponse(BaseModel):
    id: UUID
    user_id: UUID
    date: date
    sleep_hours: float
    sleep_quality: int
    tapping_count: int
    mental_clarity: int
    physical_freshness: int
    motivation: int
    sleep_score: float
    cns_score: float
    is_baseline: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
