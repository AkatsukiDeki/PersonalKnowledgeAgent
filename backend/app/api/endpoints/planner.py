from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from uuid import UUID

from app.db.session import get_db
from app.db.models import Goal, PlannerSprint, PlannerTask, UserProfile, PlannerDomain
from app.schemas.planner import (
    GoalCreate, GoalUpdate, GoalResponse,
    SprintCreate, SprintUpdate, SprintResponse,
    TaskCreate, TaskUpdate, TaskStatusUpdate, TaskResponse,
    DomainCreate, DomainResponse
)

router = APIRouter()

async def get_current_user(db: AsyncSession = Depends(get_db)) -> UserProfile:
    user = (await db.execute(select(UserProfile).limit(1))).scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=404,
            detail="User profile not found. Please initialize the application first."
        )
    return user

@router.get("/domains", response_model=List[DomainResponse])
async def get_domains(*, db: AsyncSession = Depends(get_db), user: UserProfile = Depends(get_current_user)) -> Any:
    """Get all planner domains for user. Creates defaults if none exist."""
    result = await db.execute(select(PlannerDomain).where(PlannerDomain.user_id == user.id))
    domains = result.scalars().all()
    
    if not domains:
        # Create default domains
        defaults = [
            {"name": "Учеба в ВУЗе", "color": "blue", "icon": "graduation-cap"},
            {"name": "Курсы и Интенсивы", "color": "purple", "icon": "zap"},
            {"name": "Проекты / Домашнее", "color": "amber", "icon": "hammer"},
            {"name": "Спорт и Кинетика", "color": "emerald", "icon": "activity"}
        ]
        
        for d in defaults:
            new_dom = PlannerDomain(**d, user_id=user.id)
            db.add(new_dom)
            
        await db.commit()
        
        result = await db.execute(select(PlannerDomain).where(PlannerDomain.user_id == user.id))
        domains = result.scalars().all()
        
    return domains

@router.post("/domains", response_model=DomainResponse)
async def create_domain(*, db: AsyncSession = Depends(get_db), domain_in: DomainCreate, user: UserProfile = Depends(get_current_user)) -> Any:
    """Create a new planner domain."""
    new_domain = PlannerDomain(**domain_in.model_dump(), user_id=user.id)
    db.add(new_domain)
    await db.commit()
    await db.refresh(new_domain)
    return new_domain


@router.post("/goals", response_model=GoalResponse)
async def create_goal(*, db: AsyncSession = Depends(get_db), goal_in: GoalCreate, user: UserProfile = Depends(get_current_user)) -> Any:
    """Create new goal."""
    goal = Goal(**goal_in.model_dump(), user_id=user.id)
    db.add(goal)
    await db.commit()
    
    stmt = (
        select(Goal)
        .where(Goal.id == goal.id)
        .options(selectinload(Goal.sub_goals))
    )
    res = await db.execute(stmt)
    return res.scalar_one()

@router.get("/goals", response_model=List[GoalResponse])
async def read_goals(db: AsyncSession = Depends(get_db), skip: int = 0, limit: int = 100) -> Any:
    """Retrieve goals."""
    result = await db.execute(
        select(Goal)
        .offset(skip)
        .limit(limit)
        .options(selectinload(Goal.sub_goals))
    )
    goals = result.scalars().all()
    return goals

@router.patch("/goals/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: UUID,
    goal_in: GoalUpdate,
    db: AsyncSession = Depends(get_db),
    user: UserProfile = Depends(get_current_user)
) -> Any:
    """Partial update of a goal (risks, contingency_plan, level, progress, etc.)."""
    result = await db.execute(
        select(Goal)
        .where(Goal.id == goal_id, Goal.user_id == user.id)
        .options(selectinload(Goal.sub_goals))
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    update_data = goal_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(goal, field, value)

    await db.commit()
    await db.refresh(goal)
    return goal


@router.post("/sprints", response_model=SprintResponse)
async def create_sprint(*, db: AsyncSession = Depends(get_db), sprint_in: SprintCreate) -> Any:
    """Create new sprint."""
    sprint = PlannerSprint(**sprint_in.model_dump())
    db.add(sprint)
    await db.commit()
    await db.refresh(sprint)
    return sprint

@router.get("/sprints", response_model=List[SprintResponse])
async def read_sprints(db: AsyncSession = Depends(get_db), skip: int = 0, limit: int = 100) -> Any:
    """Retrieve sprints."""
    result = await db.execute(select(PlannerSprint).offset(skip).limit(limit))
    sprints = result.scalars().all()
    return sprints

@router.post("/tasks", response_model=TaskResponse)
async def create_task(*, db: AsyncSession = Depends(get_db), task_in: TaskCreate, user: UserProfile = Depends(get_current_user)) -> Any:
    """Create new task."""
    task = PlannerTask(**task_in.model_dump(), user_id=user.id)
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task

@router.get("/tasks", response_model=List[TaskResponse])
async def read_tasks(db: AsyncSession = Depends(get_db), skip: int = 0, limit: int = 100) -> Any:
    """Retrieve tasks."""
    result = await db.execute(select(PlannerTask).offset(skip).limit(limit))
    tasks = result.scalars().all()
    return tasks

@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    *, db: AsyncSession = Depends(get_db), task_id: UUID, task_in: TaskUpdate
) -> Any:
    """Update task details."""
    result = await db.execute(select(PlannerTask).filter(PlannerTask.id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    update_data = task_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)
        
    await db.commit()
    await db.refresh(task)
    return task

@router.patch("/tasks/{task_id}/status", response_model=TaskResponse)
async def update_task_status(
    *, db: AsyncSession = Depends(get_db), task_id: UUID, status_in: TaskStatusUpdate
) -> Any:
    """Update task status (for Kanban drag-and-drop)."""
    result = await db.execute(select(PlannerTask).filter(PlannerTask.id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task.status = status_in.status
    await db.commit()
    await db.refresh(task)
    return task

from pydantic import Field, BaseModel

class TaskTimeLogRequest(BaseModel):
    minutes: int = Field(gt=0, description="Количество отработанных минут в Focus Studio")
    mark_as_done: bool = Field(default=False, description="Завершить ли задачу сразу после сессии")

@router.post("/tasks/{task_id}/log-time")
async def log_task_time(
    task_id: UUID,
    payload: TaskTimeLogRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserProfile = Depends(get_current_user),
):
    result = await db.execute(
        select(PlannerTask).where(
            PlannerTask.id == task_id,
            PlannerTask.user_id == current_user.id
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Атомарно прибавляем минуты к наработанному факту
    task.actual_minutes = (task.actual_minutes or 0) + payload.minutes
    
    if payload.mark_as_done:
        task.status = "done"

    await db.commit()
    await db.refresh(task)
    return {
        "status": "success",
        "task_id": str(task.id),
        "actual_minutes": task.actual_minutes,
        "is_done": task.status == "done"
    }

from datetime import datetime

@router.get("/daily-cockpit")
async def get_daily_cockpit(db: AsyncSession = Depends(get_db)) -> dict:
    """Mock endpoint for the integration dashboard."""
    # Fetch tasks due today or with active sprints
    tasks_res = await db.execute(select(PlannerTask).limit(10))
    sprints_res = await db.execute(select(PlannerSprint).limit(5))
    
    return {
        "date": datetime.now().isoformat(),
        "cns_fatigue_score": 4,
        "sleep_hours": 7.5,
        "readiness_status": "ready",
        "active_workout": {
            "id": "mock_wo_1",
            "location": "Gym",
            "split_name": "Push",
            "status": "planned"
        },
        "todays_tasks": [TaskResponse.model_validate(t).model_dump(mode="json") for t in tasks_res.scalars().all()],
        "active_sprints": [SprintResponse.model_validate(s).model_dump(mode="json") for s in sprints_res.scalars().all()]
    }

from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import datetime

class TemporalConflictResponse(BaseModel):
    conflict_type: str
    severity: str
    description: str
    related_task_ids: List[UUID] = []
    related_event_ids: List[UUID] = []

@router.get("/conflicts", response_model=List[TemporalConflictResponse])
async def get_temporal_conflicts(
    start_date: datetime,
    end_date: datetime,
    db: AsyncSession = Depends(get_db),
    user: UserProfile = Depends(get_current_user)
) -> Any:
    """Detect temporal conflicts on-the-fly (Hard Conflicts, Capacity, Deadline Inversions)"""
    from app.db.models import PlannerCalendarEvent, PlannerTask, PlannerSprint
    from sqlalchemy import and_, or_
    import datetime as dt

    conflicts = []

    # 1. Hard Conflicts (overlapping calendar events)
    events_res = await db.execute(
        select(PlannerCalendarEvent).where(
            and_(
                PlannerCalendarEvent.user_id == user.id,
                PlannerCalendarEvent.start_time < end_date,
                PlannerCalendarEvent.end_time > start_date
            )
        ).order_by(PlannerCalendarEvent.start_time)
    )
    events = events_res.scalars().all()
    
    for i in range(len(events)):
        for j in range(i + 1, len(events)):
            if events[i].end_time > events[j].start_time:
                conflicts.append(TemporalConflictResponse(
                    conflict_type="hard_conflict",
                    severity="high",
                    description=f"Наложение событий календаря: '{events[i].title}' и '{events[j].title}'",
                    related_event_ids=[events[i].id, events[j].id]
                ))

    # 2. Capacity Conflicts
    tasks_res = await db.execute(
        select(PlannerTask).where(
            and_(
                PlannerTask.user_id == user.id,
                PlannerTask.due_date >= start_date,
                PlannerTask.due_date <= end_date,
                PlannerTask.status.in_(["todo", "in_progress"])
            )
        )
    )
    tasks = tasks_res.scalars().all()
    
    # Calculate daily load
    from collections import defaultdict
    daily_load = defaultdict(list)
    for t in tasks:
        if t.due_date:
            daily_load[t.due_date.date()].append(t)
            
    for day, day_tasks in daily_load.items():
        total_estimated = sum((t.estimated_minutes or 60) for t in day_tasks)
        
        from app.db.models import DailyReadiness
        cns_res = await db.execute(
            select(DailyReadiness).where(
                DailyReadiness.user_id == user.id,
                DailyReadiness.date == day,
                DailyReadiness.is_baseline == True
            ).order_by(DailyReadiness.created_at.desc())
        )
        daily_readiness = cns_res.scalars().first()
        cns_score = daily_readiness.cns_score if daily_readiness else 8.0
        
        daily_capacity = int(480 * (cns_score / 10.0))
        
        if total_estimated > daily_capacity:
            conflicts.append(TemporalConflictResponse(
                conflict_type="capacity_conflict",
                severity="medium",
                description=f"Перегруз в {day}: запланировано {total_estimated} минут (лимит ~{daily_capacity}, ЦНС {cns_score}/10)",
                related_task_ids=[t.id for t in day_tasks]
            ))

    # 3. Deadline Inversion (Task due > Sprint end)
    sprint_ids = {t.sprint_id for t in tasks if t.sprint_id}
    if sprint_ids:
        sprints_res = await db.execute(select(PlannerSprint).where(PlannerSprint.id.in_(sprint_ids)))
        sprint_map = {s.id: s for s in sprints_res.scalars().all()}
        
        for t in tasks:
            if t.sprint_id and t.due_date:
                sprint = sprint_map.get(t.sprint_id)
                if sprint and sprint.end_date:
                    if t.due_date.date() > sprint.end_date:
                        conflicts.append(TemporalConflictResponse(
                            conflict_type="deadline_inversion",
                            severity="high",
                            description=f"Дедлайн задачи '{t.title}' позже завершения спринта '{sprint.title}'",
                            related_task_ids=[t.id]
                        ))

    return conflicts
