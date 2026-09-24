from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.api.deps import get_current_user
from app.services.twin_service import TwinService
from typing import Dict, Any

router = APIRouter()

@router.get("/telemetry", response_model=Dict[str, Any])
async def get_twin_telemetry(
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Возвращает агрегированную телеметрию для Цифрового Двойника (Digital Twin):
    - Топ концептов (радар)
    - Когнитивные метрики (retention rate, response time)
    - Execution velocity (план/факт)
    - Тренд ЦНС
    """
    return await TwinService.get_twin_telemetry(db, current_user.id)
