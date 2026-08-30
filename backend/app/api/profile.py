import json
import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional

from .deps import get_db
from ..schemas.profile import UserProfileCreate, UserProfile as UserProfileSchema
from ..db.models import UserProfile
from ..knowledge.ingestion import create_source_db, process_source_chunks_bg

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/profile", tags=["Profile"])

def generate_primary_seed(data: UserProfileCreate) -> str:
    return f"""# ПЕРВИЧНЫЙ ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ (PRIMARY SEED)

## 1. Контекст и Стек
* Род деятельности: {data.role}
* Технологии: {', '.join(data.stack)}

## 2. Опыт и Проекты
{data.projects}

## 3. Жесткие правила и инварианты (L3 PATTERNS)
{data.invariants}

## 4. Предпочтения в обучении и подаче
{data.learning_style}
"""


@router.post("/seed", response_model=dict)
async def seed_profile(
    payload: UserProfileCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    try:
        import uuid

        # Save to user_profiles table using ORM with explicit ID
        profile_obj = UserProfile(
            id=uuid.uuid4(),
            role=payload.role,
            stack=payload.stack,
            invariants=payload.invariants,
            learning_style=payload.learning_style,
            projects=payload.projects,
            is_seeded=True
        )
        db.add(profile_obj)
        await db.commit()

        # Generate markdown source for ingestion
        seed_content = generate_primary_seed(payload)
        new_source = await create_source_db(
            db=db,
            title="Primary Profile Seed",
            content=seed_content,
            source_type="onboarding"
        )
        background_tasks.add_task(process_source_chunks_bg, new_source.id)

        return {
            "status": "success",
            "message": "Профиль успешно сохранен, Knowledge Graph генерируется.",
            "source_id": str(new_source.id)
        }
    except Exception as e:
        logger.exception("Ошибка при сохранении профиля")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=Optional[UserProfileSchema])
async def get_profile(db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(text("SELECT * FROM user_profiles ORDER BY created_at DESC LIMIT 1"))
        row = result.fetchone()
        if not row:
            return None
            
        return UserProfile(
            id=str(row.id),
            role=row.role,
            stack=row.stack if isinstance(row.stack, list) else json.loads(row.stack),
            invariants=row.invariants,
            learning_style=row.learning_style,
            projects=row.projects,
            is_seeded=row.is_seeded
        )
    except Exception as e:
        logger.exception("Ошибка при получении профиля")
        raise HTTPException(status_code=500, detail=str(e))
