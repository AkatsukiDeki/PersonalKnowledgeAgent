from typing import List, Optional
from pydantic import BaseModel

class UserProfileCreate(BaseModel):
    role: str
    stack: List[str]
    invariants: str
    learning_style: str
    projects: Optional[str] = ""

class UserProfile(UserProfileCreate):
    id: str
    is_seeded: bool
    
    class Config:
        from_attributes = True
