from typing import Optional
from pydantic import BaseModel

class RetranscribeRequest(BaseModel):
    language: Optional[str] = "ru"
    initial_prompt: Optional[str] = None
