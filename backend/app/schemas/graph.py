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
    importance: Optional[float] = None
    rationale: Optional[str] = None
    alternatives: Optional[list] = None
    memory_id: Optional[str] = None

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

class BridgeClaimItem(BaseModel):
    id: str
    content: str
    source_id: str
    source_title: str
    domain: str
    confidence: float = 1.0
    is_superseded: bool = False

class CrossDomainBridgeItem(BaseModel):
    bridge_id: str
    relation_type: str
    strength: float = 1.0
    evidence_score: float = 0.0
    source_claim: BridgeClaimItem
    target_claim: BridgeClaimItem
    supporting_snippet: Optional[str] = None

class BridgeContextResponse(BaseModel):
    domain_a: str
    domain_b: str
    total_bridges: int
    top_bridges: List[CrossDomainBridgeItem]
    evidence_sufficient: bool
