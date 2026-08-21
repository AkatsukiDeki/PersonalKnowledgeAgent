import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from .deps import get_db
from ..knowledge.ingestion import create_source_db, process_source_chunks_bg

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/onboarding", tags=["Onboarding"])


class OnboardingRequest(BaseModel):
    role: str
    stack: List[str]
    invariants: str
    learning_style: str
    projects: Optional[str] = ""


def generate_primary_seed(data: OnboardingRequest) -> str:
    """Шаблонизатор: превращает JSON от фронтенда в эталонный Markdown (Primary Seed)"""
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


@router.post("/submit")
async def submit_onboarding(
        payload: OnboardingRequest,
        background_tasks: BackgroundTasks,
        db: AsyncSession = Depends(get_db)
):
    try:
        # 1. Генерируем Markdown текст из ответов пользователя
        seed_content = generate_primary_seed(payload)

        # 2. Создаем Source через твою функцию (fast path)
        new_source = await create_source_db(
            db=db,
            title="Primary Profile Seed",
            content=seed_content,
            source_type="onboarding"
        )

        # 3. Отправляем в фоновую задачу на нарезку, векторизацию и извлечение графа
        background_tasks.add_task(process_source_chunks_bg, new_source.id)

        return {
            "status": "success",
            "message": "Primary Seed успешно сгенерирован и отправлен в обработку",
            "source_id": str(new_source.id)
        }

    except Exception as e:
        logger.exception("Ошибка при обработке онбординга")
        raise HTTPException(status_code=500, detail=str(e))