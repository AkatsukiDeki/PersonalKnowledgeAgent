from typing import Any, List
from datetime import datetime, date, timedelta
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_
from uuid import UUID
import json
import asyncio

from app.db.session import get_db
from app.db.models import PlannerCalendarEvent, PlannerTask, PlannerReminder, UserProfile
from app.schemas.calendar import (
    PlannerCalendarEventCreate, PlannerCalendarEventUpdate, PlannerCalendarEventResponse,
    PlannerReminderCreate, PlannerReminderUpdate, PlannerReminderResponse,
    CalendarViewResponse
)
from app.api.endpoints.planner import get_current_user

router = APIRouter()

# --- Connection Manager for WebSockets ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]

    async def send_personal_message(self, message: str, user_id: str):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_text(message)

manager = ConnectionManager()

@router.websocket("/ws/alerts/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming ping/pong if needed
    except WebSocketDisconnect:
        manager.disconnect(user_id)


# --- Calendar Events CRUD ---

@router.get("/events", response_model=List[PlannerCalendarEventResponse])
async def get_events(
    db: AsyncSession = Depends(get_db),
    user: UserProfile = Depends(get_current_user)
) -> Any:
    stmt = select(PlannerCalendarEvent).where(PlannerCalendarEvent.user_id == user.id)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/events", response_model=PlannerCalendarEventResponse)
async def create_event(
    *,
    db: AsyncSession = Depends(get_db),
    event_in: PlannerCalendarEventCreate,
    user: UserProfile = Depends(get_current_user)
) -> Any:
    db_event = PlannerCalendarEvent(
        user_id=user.id,
        title=event_in.title,
        description=event_in.description,
        start_time=event_in.start_time,
        end_time=event_in.end_time,
        event_type=event_in.event_type,
        recurrence_rule=event_in.recurrence_rule,
        linked_task_id=event_in.linked_task_id
    )
    db.add(db_event)
    await db.commit()
    await db.refresh(db_event)
    
    # Simple logic to create a reminder if requested
    # Could be enhanced later to parse recurrence rule
    return db_event

@router.delete("/events/{event_id}")
async def delete_event(
    *,
    db: AsyncSession = Depends(get_db),
    event_id: UUID,
    user: UserProfile = Depends(get_current_user)
) -> Any:
    stmt = select(PlannerCalendarEvent).where(
        PlannerCalendarEvent.id == event_id,
        PlannerCalendarEvent.user_id == user.id
    )
    result = await db.execute(stmt)
    event = result.scalars().first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
        
    await db.delete(event)
    await db.commit()
    return {"ok": True}


# --- Calendar View Aggregation ---

@router.get("/view", response_model=CalendarViewResponse)
async def get_calendar_view(
    start_date: datetime,
    end_date: datetime,
    db: AsyncSession = Depends(get_db),
    user: UserProfile = Depends(get_current_user)
) -> Any:
    """
    Returns explicitly created events + implicit events from task due_dates
    for a given date range.
    """
    
    # 1. Fetch Calendar Events 
    # (In a real implementation, we should check RRULE here if we want the backend to expand them, 
    # but as agreed, the frontend will use rrule.js. 
    # We just fetch events that start before end_date or have an RRULE)
    stmt_events = select(PlannerCalendarEvent).where(
        PlannerCalendarEvent.user_id == user.id,
        or_(
            PlannerCalendarEvent.start_time >= start_date,
            PlannerCalendarEvent.recurrence_rule.isnot(None)
        )
    )
    result_events = await db.execute(stmt_events)
    events = result_events.scalars().all()
    
    # Convert to response
    response_events = [PlannerCalendarEventResponse.model_validate(e) for e in events]
    
    # 2. Fetch PlannerTasks with due_dates in range
    stmt_tasks = select(PlannerTask).where(
        PlannerTask.user_id == user.id,
        PlannerTask.due_date >= start_date,
        PlannerTask.due_date <= end_date,
        PlannerTask.status != "done"
    )
    result_tasks = await db.execute(stmt_tasks)
    tasks = result_tasks.scalars().all()
    
    # Map Tasks to CalendarEvent layout
    for task in tasks:
        task_event = PlannerCalendarEventResponse(
            id=task.id,
            user_id=task.user_id,
            title=task.title,
            description=task.description,
            start_time=task.due_date - timedelta(minutes=task.estimated_minutes),
            end_time=task.due_date,
            event_type="task_deadline",
            recurrence_rule=None,
            linked_task_id=task.id,
            created_at=task.created_at,
            updated_at=task.updated_at
        )
        response_events.append(task_event)
        
    return CalendarViewResponse(events=response_events)

# --- Reminders CRUD ---

@router.get("/reminders", response_model=List[PlannerReminderResponse])
async def get_reminders(
    db: AsyncSession = Depends(get_db),
    user: UserProfile = Depends(get_current_user)
) -> Any:
    stmt = select(PlannerReminder).where(PlannerReminder.user_id == user.id)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/reminders", response_model=PlannerReminderResponse)
async def create_reminder(
    *,
    db: AsyncSession = Depends(get_db),
    reminder_in: PlannerReminderCreate,
    user: UserProfile = Depends(get_current_user)
) -> Any:
    db_rem = PlannerReminder(
        user_id=user.id,
        event_id=reminder_in.event_id,
        trigger_time=reminder_in.trigger_time,
        message=reminder_in.message,
        priority=reminder_in.priority,
        channel=reminder_in.channel
    )
    db.add(db_rem)
    await db.commit()
    await db.refresh(db_rem)
    return db_rem
