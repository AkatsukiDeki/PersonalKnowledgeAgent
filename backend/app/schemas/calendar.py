from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID

# -----------------
# Event Schemas
# -----------------

class PlannerCalendarEventBase(BaseModel):
    title: str = Field(..., max_length=255)
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    event_type: str = Field(default="custom", description="university, gym, sprint_block, custom, task_deadline")
    recurrence_rule: Optional[str] = Field(None, description="RFC 5545 RRULE string")
    linked_task_id: Optional[UUID] = None

class PlannerCalendarEventCreate(PlannerCalendarEventBase):
    pass

class PlannerCalendarEventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    event_type: Optional[str] = None
    recurrence_rule: Optional[str] = None
    linked_task_id: Optional[UUID] = None

class PlannerCalendarEventResponse(PlannerCalendarEventBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# -----------------
# Reminder Schemas
# -----------------

class PlannerReminderBase(BaseModel):
    event_id: Optional[UUID] = None
    trigger_time: datetime
    message: str = Field(..., max_length=500)
    priority: str = Field(default="medium", description="low, medium, high, critical")
    channel: str = Field(default="in_app", description="in_app, push, email")

class PlannerReminderCreate(PlannerReminderBase):
    pass

class PlannerReminderUpdate(BaseModel):
    trigger_time: Optional[datetime] = None
    message: Optional[str] = None
    priority: Optional[str] = None
    is_triggered: Optional[bool] = None
    channel: Optional[str] = None

class PlannerReminderResponse(PlannerReminderBase):
    id: UUID
    user_id: UUID
    is_triggered: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# -----------------
# Aggregated View 
# -----------------
# Used to return both real events and tasks with due_date
class CalendarViewResponse(BaseModel):
    events: List[PlannerCalendarEventResponse]
    # tasks are converted to PlannerCalendarEventResponse format on the fly for simplicity
