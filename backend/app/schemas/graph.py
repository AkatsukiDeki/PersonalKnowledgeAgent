import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict
from .claim import ClaimResponse

class FormattedRelationResponse(BaseModel):
    id: uuid.UUID
    relation_type: str
    confidence: float
    evidence_summary: Optional[str]
    is_source: bool = True
    related_claim_id: uuid.UUID
    related_claim_content: str
    
    model_config = ConfigDict(from_attributes=True)

class GraphClaimResponse(BaseModel):
    claim: ClaimResponse
    relations: List[FormattedRelationResponse] = []

class GraphNode(BaseModel):
    id: str
    label: str
    group: str
    category: str
    val: int
    is_active: Optional[bool] = None
    confidence: Optional[float] = None
    created_at: Optional[datetime] = None
    source_id: Optional[str] = None
    chunk_id: Optional[str] = None
    superseded_by: Optional[str] = None
    aliases: Optional[List[str]] = None
    content: Optional[str] = None
    kind: Optional[str] = None
    domain: Optional[str] = None
    memory_score: Optional[float] = None

class GraphLink(BaseModel):
    source: str
    target: str
    type: str
    color: Optional[str] = None
    confidence: Optional[float] = None
    evidence_summary: Optional[str] = None

class GraphTopologyResponse(BaseModel):
    nodes: List[GraphNode]
    links: List[GraphLink]
