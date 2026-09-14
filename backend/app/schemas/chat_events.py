from typing import Any, Dict, Literal, Optional
from pydantic import BaseModel

SSEEventType = Literal[
    "token",
    "tool_start",
    "tool_progress",
    "tool_result",
    "artifact",
    "done",
    "error",
    "metadata",
    "telemetry",
    "retrieval",
    "citations",
]

class SSEEventData(BaseModel):
    call_id: Optional[str] = None
    tool_name: Optional[str] = None
    input: Optional[Dict[str, Any]] = None
    output: Optional[Any] = None
    text_chunk: Optional[str] = None
    error: Optional[str] = None
    artifact_type: Optional[str] = None  # "chart", "table", "graph"

class SSEEnvelope(BaseModel):
    event: SSEEventType
    data: SSEEventData

    def to_sse(self) -> str:
        """Форматирует объект в строгий стандарт SSE: event: ...\ndata: {...}\n\n"""
        return f"event: {self.event}\ndata: {self.data.model_dump_json(exclude_none=True)}\n\n"
