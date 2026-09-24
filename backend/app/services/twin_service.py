import asyncio
from datetime import datetime
import json
from pydantic import BaseModel, Field
from sqlalchemy import select, func, cast, Integer
from app.db.models import (
    ConceptMastery,
    LearningAttempt,
    PlannerTask,
    PlannerDomain,
    DailyReadiness,
    UserProfile
)
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any
from app.core.llm import model_manager, TaskType

class TwinInsights(BaseModel):
    blind_spot: str = Field(description="Зона слепого пятна (где теряется время или копится дисбаланс)")
    optimum: str = Field(description="Точка оптимума (при каких условиях продуктивность максимальна)")
    action: str = Field(description="Корректирующее действие (что конкретно перестроить в плане на завтра)")

_daily_insight_cache = {}

class TwinService:
    @staticmethod
    async def _generate_insights_bg(user_id: str, snapshot: str):
        today = datetime.now().date().isoformat()
        try:
            prompt = f"""
Телеметрия:
{snapshot}

Сформируй глубокий кросс-доменный диагноз на стыке выработки, навыков и биометрии:
- blind_spot: опиши не просто название темы, а в чем именно дисбаланс (например: 'Архитектура микросервисов отстает (60%), при этом 100% времени ушло на учебу/безопасность').
- optimum: при каких условиях достигается пик эффективности (например: 'Ресурс ЦНС 8.4/10 — идеальное окно для тяжелых инженерных спринтов по 50 минут').
- action: конкретный шаг в расписании на завтра (например: 'Поставить первый спринт дня на проектирование API микросервисов, пока тонус максимален').
"""
            res = await model_manager.generate_structured(
                task_type=TaskType.EXTRACTION,
                schema=TwinInsights,
                prompt=prompt,
                system_instruction="Ты — диагност. Сопоставь выработку, навыки и ЦНС. Формулируй жестко, кратко, без общих фраз, только суть."
            )
            _daily_insight_cache[user_id] = {
                "date": today,
                "data": {
                    "blind_spot": res.blind_spot,
                    "optimum": res.optimum,
                    "action": res.action
                }
            }
        except Exception as e:
            print(f"Failed to generate twin insights: {e}")

    @staticmethod
    async def get_twin_telemetry(session: AsyncSession, user_id: str) -> Dict[str, Any]:
        # 1. Top 10 Mastered Concepts
        concept_stmt = select(ConceptMastery.topic_name, ConceptMastery.mastery_level)\
            .order_by(ConceptMastery.mastery_level.desc())\
            .limit(10)
        concepts_res = await session.execute(concept_stmt)
        radar_concepts = []
        for row in concepts_res:
            radar_concepts.append({
                "subject": row.topic_name,
                "mastery": round(row.mastery_level * 100, 1),
                "fullMark": 100
            })

        # 2. Cognitive Performance (from Learning Attempts)
        attempt_stmt = select(
            func.avg(cast(LearningAttempt.success, Integer)).label("retention_rate"),
            func.avg(LearningAttempt.response_time_ms).label("avg_response_ms")
        ).where(LearningAttempt.user_id == user_id)
        
        attempt_res = await session.execute(attempt_stmt)
        attempt_row = attempt_res.first()
        retention_rate = round((attempt_row.retention_rate or 0.0) * 100, 1) if attempt_row else 0.0
        avg_response_ms = round(attempt_row.avg_response_ms or 0.0, 0) if attempt_row else 0.0

        # 4. CNS Score (Today if available, else average)
        today_date = datetime.now().date()
        cns_today_stmt = select(DailyReadiness.cns_score)\
            .where(DailyReadiness.user_id == user_id, DailyReadiness.date == today_date)
        cns_today_res = await session.execute(cns_today_stmt)
        cns_today_row = cns_today_res.first()
        
        if cns_today_row and cns_today_row.cns_score is not None:
            avg_cns = round(cns_today_row.cns_score, 1)
        else:
            cns_stmt = select(func.avg(DailyReadiness.cns_score).label("avg_cns"))\
                .where(DailyReadiness.user_id == user_id)
            cns_res = await session.execute(cns_stmt)
            cns_row = cns_res.first()
            avg_cns = round(cns_row.avg_cns or 0.0, 1) if cns_row else 8.5

        cognitive_metrics = {
            "retention_rate_pct": retention_rate,
            "avg_response_time_ms": avg_response_ms,
            "avg_cns_score": avg_cns
        }

        # 3. Execution Velocity (from Planner Tasks)
        domain_stmt = select(
            PlannerDomain.name,
            func.sum(PlannerTask.actual_minutes).label("total_actual"),
            func.sum(PlannerTask.estimated_minutes).label("total_estimated")
        ).join(PlannerTask, PlannerTask.domain_id == PlannerDomain.id)\
         .where(PlannerTask.user_id == user_id)\
         .group_by(PlannerDomain.name)
         
        domain_res = await session.execute(domain_stmt)
        execution_velocity = []
        for row in domain_res:
            actual = row.total_actual or 0
            estimated = row.total_estimated or 0
            execution_velocity.append({
                "domain_name": row.name,
                "actual_hours": round(actual / 60.0, 1),
                "planned_hours": round(estimated / 60.0, 1)
            })

        # Generate Agent Snapshot
        top_skill = radar_concepts[0]["subject"] if radar_concepts else "Неизвестно"
        weak_spot = radar_concepts[-1]["subject"] if len(radar_concepts) > 1 else "Не определено"
        snapshot = (
            f"Пользователь: профиль компетенций — {len(radar_concepts)} активных навыков (Топ: {top_skill}), "
            f"текущий ресурс ЦНС — {avg_cns}/10, "
            f"процент удержания памяти — {retention_rate}%, "
            f"скорость реакции — {avg_response_ms}мс, "
            f"слабое место в знаниях — {weak_spot}. "
            f"Ожидается адаптация сложности задач под текущий тонус."
        )

        today = datetime.now().date().isoformat()
        cached_insights = _daily_insight_cache.get(user_id)
        
        insights = None
        if cached_insights and cached_insights["date"] == today:
            insights = cached_insights["data"]
        else:
            insights = {
                "blind_spot": "Анализ запускается в фоне...",
                "optimum": "Собираем данные...",
                "action": "Проверьте диагноз позже."
            }
            # trigger background generation
            asyncio.create_task(TwinService._generate_insights_bg(user_id, snapshot))

        return {
            "radar_concepts": radar_concepts,
            "cognitive_metrics": cognitive_metrics,
            "execution_velocity": execution_velocity,
            "agent_snapshot": snapshot,
            "insights": insights
        }
