from typing import List, Literal, Optional
from pydantic import BaseModel, Field

class ExtractedConcept(BaseModel):
    title: str = Field(..., description="Short conceptual title (e.g. 'Git Rebase vs Merge')")
    statement: str = Field(..., description="Core thesis or principle in 1-2 clear sentences")
    importance: Literal["high", "medium"] = Field(default="high", description="Significance to the document's core thesis")
    supporting_excerpt: str = Field(..., description="Direct verbatim excerpt from document proving the concept")
    temporal_context: Optional[str] = Field(default=None, description="Исходная временная фраза из текста (если применимо)")
    valid_from: Optional[str] = Field(default=None, description="YYYY-MM-DD, YYYY-MM или YYYY")
    valid_to: Optional[str] = Field(default=None, description="YYYY-MM-DD, YYYY-MM или YYYY")

class DocumentConceptsPayload(BaseModel):
    concepts: List[ExtractedConcept] = Field(..., min_length=1, max_length=10)
