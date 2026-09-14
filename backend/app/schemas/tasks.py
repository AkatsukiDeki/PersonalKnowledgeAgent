from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID
from ..db.models import TaskStatus, TaskPriority

class TaskBase(BaseModel):
    title: str = Field(..., max_length=512)
    description: Optional[str] = None
    priority: TaskPriority = TaskPriority.MEDIUM
    subject_id: Optional[UUID] = None
    source_id: Optional[UUID] = None
    topic_name: Optional[str] = Field(None, max_length=256)
    due_date: Optional[datetime] = None

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=512)
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    due_date: Optional[datetime] = None

class TaskResponse(TaskBase):
    id: UUID
    status: TaskStatus
    created_by: str
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True
