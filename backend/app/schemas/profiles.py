from enum import Enum
from pydantic import BaseModel

class ChatMode(str, Enum):
    FAST = "fast"
    VAULT = "vault"
    LEARNING = "learning"
    REASONING = "reasoning"

class ModelCapability(str, Enum):
    FAST_LOCAL = "fast_local"
    BALANCED_LOCAL = "balanced_local"
    DEEP_REASONING = "deep_reasoning"

class ExecutionProfile(BaseModel):
    retrieval_enabled: bool
    graph_expansion: bool
    evidence_gate: bool
    max_chunks: int
    max_claims: int
    context_budget_tokens: int
    preferred_capability: ModelCapability
    reranking_enabled: bool = True

PROFILES: dict[ChatMode, ExecutionProfile] = {
    ChatMode.FAST: ExecutionProfile(
        retrieval_enabled=False,
        graph_expansion=False,
        evidence_gate=False,
        max_chunks=0,
        max_claims=0,
        context_budget_tokens=1000,
        preferred_capability=ModelCapability.FAST_LOCAL,
        reranking_enabled=False,
    ),
    ChatMode.VAULT: ExecutionProfile(
        retrieval_enabled=True,
        graph_expansion=True,
        evidence_gate=True,
        max_chunks=4,
        max_claims=6,
        context_budget_tokens=4000,
        preferred_capability=ModelCapability.BALANCED_LOCAL,
        reranking_enabled=True,
    ),
    ChatMode.LEARNING: ExecutionProfile(
        retrieval_enabled=True,
        graph_expansion=False,
        evidence_gate=False,
        max_chunks=3,
        max_claims=4,
        context_budget_tokens=3000,
        preferred_capability=ModelCapability.BALANCED_LOCAL,
        reranking_enabled=True,
    ),
    ChatMode.REASONING: ExecutionProfile(
        retrieval_enabled=True,
        graph_expansion=True,
        evidence_gate=True,
        max_chunks=8,
        max_claims=10,
        context_budget_tokens=8000,
        preferred_capability=ModelCapability.DEEP_REASONING,
        reranking_enabled=True,
    ),
}
