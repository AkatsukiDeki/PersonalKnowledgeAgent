from typing import Optional
from pydantic import BaseModel, Field


class CopilotRequest(BaseModel):
    prefix: str = Field(..., description="Текст до курсора")
    suffix: Optional[str] = Field(default="", description="Текст после курсора")
    last_assistant_message: Optional[str] = Field(
        default=None, 
        max_length=300, 
        description="Краткий контекст предыдущего ответа"
    )


class CopilotResponse(BaseModel):
    suggestion: str
    latency_ms: float
