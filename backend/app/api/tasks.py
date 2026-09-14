import re
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .deps import get_db
from ..db.models import Source, Task, TaskStatus
from ..knowledge.retrieval import hybrid_search
from ..schemas.tasks import TaskCreate, TaskResponse, TaskUpdate

router = APIRouter()


@router.get("", response_model=List[TaskResponse])
async def get_tasks(
    status: Optional[TaskStatus] = None,
    subject_id: Optional[uuid.UUID] = None,
    source_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Task)
    if status:
        stmt = stmt.where(Task.status == status)
    if subject_id:
        stmt = stmt.where(Task.subject_id == subject_id)
    if source_id:
        stmt = stmt.where(Task.source_id == source_id)

    stmt = stmt.order_by(Task.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=TaskResponse)
async def create_task(task_in: TaskCreate, db: AsyncSession = Depends(get_db)):
    task = Task(**task_in.model_dump(exclude_unset=True))
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(task_id: uuid.UUID, task_in: TaskUpdate, db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    update_data = task_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)

    await db.commit()
    await db.refresh(task)
    return task


@router.delete("/{task_id}")
async def delete_task(task_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await db.delete(task)
    await db.commit()
    return {"status": "success"}


@router.post("/sync-from-source/{source_id}", response_model=List[TaskResponse])
async def sync_tasks_from_source(source_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    insights = source.meta_info.get("insights", {}) if source.meta_info else {}
    action_items = insights.get("action_items", [])

    if not action_items:
        return []

    # Get existing tasks for this source
    existing_stmt = select(Task.title).where(Task.source_id == source_id)
    existing_result = await db.execute(existing_stmt)
    existing_titles = set(existing_result.scalars().all())

    new_tasks = []
    for item in action_items:
        title = item.get("task") or item.get("title")
        if not title or title in existing_titles:
            continue

        task = Task(
            title=title[:512],
            description=item.get("reason"),
            source_id=source_id,
            subject_id=source.subject_id if hasattr(source, "subject_id") else None,
            created_by="system_sync",
        )
        db.add(task)
        new_tasks.append(task)

    if new_tasks:
        await db.commit()
        for task in new_tasks:
            await db.refresh(task)

    return new_tasks


@router.get("/{task_id}/focus-context")
async def get_focus_context(task_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    clean_query = re.sub(
        r"^(повторить(\s+тему)?|повторение|тема)[:\s]+",
        "",
        task.title,
        flags=re.IGNORECASE,
    ).strip()
    context_snippets = []

    try:
        rows = await hybrid_search(db, query=clean_query, query_text=clean_query, limit=3)
        for row in rows:
            if "text_content" in row and row["text_content"]:
                context_snippets.append(row["text_content"])
    except Exception as e:
        print(f"Error fetching focus context for task {task_id}: {e}")

    return {
        "task_title": task.title,
        "topic_name": getattr(task, "topic_name", None),
        "context_snippets": context_snippets,
    }