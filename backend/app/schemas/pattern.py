import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, ConfigDict

class PatternCreate(BaseModel):
    title: str = Field(description="A concise, descriptive title for the pattern")
    description: str = Field(description="Detailed description of the behavioral, cognitive, or productivity pattern")
    pattern_type: str = Field(description="Must be one of: behavioral, cognitive, productivity, architectural")
    domains: List[str] = Field(description="List of at least 2 domains where this pattern is observed")
    confidence: float = Field(description="Confidence score from 0.0 to 1.0")
    evidence_summary: str = Field(description="A brief explanation of how the evidence supports this pattern")
    evidence_claim_ids: List[str] = Field(description="List of claim UUIDs that serve as evidence for this pattern. Must contain at least 2 UUIDs.")

class PatternExtractionResult(BaseModel):
    patterns: List[PatternCreate]

class PatternResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    pattern_type: str
    domains: List[str]
    confidence: float
    evidence_summary: str
    evidence_claim_ids: List[uuid.UUID]
    meta_info: Dict[str, Any]
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
