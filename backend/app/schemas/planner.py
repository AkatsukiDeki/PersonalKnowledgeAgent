from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime, date
from app.db.models import PlanningCadence


# ==============================================================================
# PLANNER DOMAINS
# ==============================================================================

class DomainBase(BaseModel):
    name: str
    color: Optional[str] = "blue"
    icon: Optional[str] = None

class DomainCreate(DomainBase):
    pass

class DomainResponse(DomainBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ==============================================================================
# PLANNER GOALS
# ==============================================================================

class GoalBase(BaseModel):
    domain_id: UUID
    title: str
    description: Optional[str] = None
    cadence: Optional[PlanningCadence] = PlanningCadence.LONG_TERM
    target_date: Optional[date] = None
    progress_pct: Optional[float] = 0.0
    is_active: Optional[bool] = True
    # GBS - Дерево целей
    parent_goal_id: Optional[UUID] = None
    level: Optional[str] = 'milestone'  # vision | milestone | semester | subject | sprint
    # Risk & Friction Engine
    risks: Optional[str] = None
    contingency_plan: Optional[str] = None

class GoalCreate(GoalBase):
    pass

class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    target_date: Optional[date] = None
    progress_pct: Optional[float] = None
    is_active: Optional[bool] = None
    parent_goal_id: Optional[UUID] = None
    level: Optional[str] = None
    risks: Optional[str] = None
    contingency_plan: Optional[str] = None

class GoalResponse(GoalBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    sub_goals: Optional[List['GoalResponse']] = None

    model_config = ConfigDict(from_attributes=True)

GoalResponse.model_rebuild()  # Нужно для рекурсивной ссылки

# ==============================================================================
# PLANNER SPRINTS
# ==============================================================================

class SprintBase(BaseModel):
    goal_id: UUID
    title: str
    start_date: date
    end_date: date
    is_active: Optional[bool] = True

class SprintCreate(SprintBase):
    pass

class SprintUpdate(BaseModel):
    title: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: Optional[bool] = None

class SprintResponse(SprintBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ==============================================================================
# PLANNER TASKS
# ==============================================================================

class TaskBase(BaseModel):
    domain_id: UUID
    goal_id: Optional[UUID] = None
    sprint_id: Optional[UUID] = None
    title: str
    description: Optional[str] = None
    status: Optional[str] = "todo"
    priority: Optional[str] = "medium"
    estimated_minutes: Optional[int] = 60
    actual_minutes: Optional[int] = 0
    due_date: Optional[datetime] = None
    linked_subject_id: Optional[UUID] = None
    linked_workout_plan_id: Optional[UUID] = None

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    sprint_id: Optional[UUID] = None
    goal_id: Optional[UUID] = None
    estimated_minutes: Optional[int] = None
    actual_minutes: Optional[int] = None
    due_date: Optional[datetime] = None
    linked_subject_id: Optional[UUID] = None
    linked_workout_plan_id: Optional[UUID] = None

class TaskStatusUpdate(BaseModel):
    status: str

class TaskResponse(TaskBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
