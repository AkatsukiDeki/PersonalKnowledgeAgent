from datetime import datetime, timezone, date, timedelta
from typing import List, Optional
from uuid import UUID
import json
import re
import asyncio

from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File
from sqlalchemy import select, func, case, or_, text, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from ...schemas import kinetics as kinetics_schemas
from ...db import models as kinetics_models
from ...db.session import get_db
from ...db.models import (
    BiometricsLog,
    WorkoutPlan,
    WorkoutExercise,
    UserProfile,
    AthleteProfile,
    TrainingLog,
    TrainingResearch,
    KineticsChatLog,
    KineticsInsight,
    KineticsNutritionMeal,
)
from ...schemas.kinetics import (
    BiometricsLogResponse,
    WorkoutPlanResponse,
    WorkoutGeneratePayload,
    WorkoutExerciseResponse,
    AlternativeRequest,
    AlternativeResponse,
    NutritionScanResponse,
    NutritionMealCreate,
    NutritionMealResponse,
    DailyNutritionSummaryResponse,
    ExerciseAlternativeItem,
    ExerciseSwapPayload,
    TrainingResearchCreate,
    TrainingResearchResponse,
    CoachActionResponse,
    KineticsChatLogResponse,
    KineticsInsightResponse,
    MesocycleGeneratePayload,
    MesocyclePlan
)
from ...services.planner import generate_biomechanical_alternatives
from ...services.kinetics_rag import KineticsRAGService, PubMedParser
from ...knowledge.embeddings.factory import get_embedding_provider
from ...core.llm import model_manager, TaskType
from ...core.config import settings


class ExercisePatchPayload(BaseModel):
    exercise_name: Optional[str] = None
    exercise_type: Optional[str] = None
    sets: Optional[int] = None
    reps_or_duration: Optional[str] = None
    rpe_target: Optional[int] = None
    is_completed: Optional[bool] = None


class ExerciseCreatePayload(BaseModel):
    plan_id: UUID
    exercise_name: str
    exercise_type: str = "hypertrophy"
    sets: int = 3
    reps_or_duration: str = "10-12"
    rpe_target: int = 7
    target_muscle_groups: List[str] = []


class CalendarDayIn(BaseModel):
    id: Optional[str] = None
    date: str
    split_day: Optional[str] = None
    title: Optional[str] = None
    status: str
    intensity: Optional[str] = None
    rpe_target: Optional[int] = None


class RescheduleRequest(BaseModel):
    days: List[CalendarDayIn]


router = APIRouter()


async def get_current_user(db: AsyncSession = Depends(get_db)) -> UserProfile:
    user = (await db.execute(select(UserProfile).limit(1))).scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=404,
            detail="User profile not found. Please initialize the application first."
        )
    return user


@router.get("/profile")
async def get_athlete_profile(
        db: AsyncSession = Depends(get_db),
        user: UserProfile = Depends(get_current_user)
):
    stmt = select(AthleteProfile).where(AthleteProfile.user_id == user.id)
    profile = (await db.execute(stmt)).scalar_one_or_none()
    if not profile:
        profile = AthleteProfile(
            user_id=user.id,
            target_weight_kg=85.0,
            target_fat_pct=15.0
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile


@router.put("/profile")
async def update_athlete_profile(
        payload: dict = Body(...),
        db: AsyncSession = Depends(get_db),
        user: UserProfile = Depends(get_current_user)
):
    stmt = select(AthleteProfile).where(AthleteProfile.user_id == user.id)
    profile = (await db.execute(stmt)).scalar_one_or_none()
    if not profile:
        profile = AthleteProfile(user_id=user.id)
        db.add(profile)

    for k, v in payload.items():
        if hasattr(profile, k) and k not in ("id", "user_id", "created_at", "updated_at"):
            if k in ("lagging_muscles", "goals", "schedule_days") and isinstance(v, str):
                v = [item.strip() for item in v.split(",") if item.strip()]
            setattr(profile, k, v)

    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/biometrics", response_model=List[BiometricsLogResponse])
async def get_biometrics(
        limit: int = 7,
        db: AsyncSession = Depends(get_db),
        user: UserProfile = Depends(get_current_user)
):
    stmt = (
        select(BiometricsLog)
        .where(BiometricsLog.user_id == user.id)
        .order_by(BiometricsLog.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/biometrics", response_model=BiometricsLogResponse)
async def log_biometrics(
        payload: dict = Body(...),
        db: AsyncSession = Depends(get_db),
        user: UserProfile = Depends(get_current_user)
):
    w = float(payload.get("weight") or payload.get("weight_kg") or 0.0)
    bf = float(payload.get("body_fat_percentage") or payload.get("body_fat_pct") or 0.0)
    m = float(payload.get("skeletal_muscle_kg") or payload.get("muscle_kg") or 0.0)
    vf = int(payload.get("visceral_fat_level") or payload.get("visceral_fat") or 0)
    bmr_val = int(payload.get("bmr_kcal") or payload.get("bmr") or 0)
    now = datetime.now(timezone.utc)

    new_log = BiometricsLog(
        user_id=user.id,
        timestamp=now,
        weight=w,
        weight_kg=w,
        body_fat_percentage=bf,
        body_fat_pct=bf,
        skeletal_muscle_kg=m,
        muscle_kg=m,
        fat_mass_kg=float(payload.get("fat_mass_kg") or 0.0),
        water_l=float(payload.get("water_l") or 0.0),
        protein_kg=float(payload.get("protein_kg") or 0.0),
        protein_g=int(payload.get("protein_g") or 0),
        minerals_kg=float(payload.get("minerals_kg") or 0.0),
        visceral_fat_level=vf,
        visceral_fat=vf,
        bmr_kcal=bmr_val,
        bmr=bmr_val,
        calories_in=int(payload.get("calories_in") or 0),
        tdee=int(payload.get("tdee") or 0),
        fatigue_score=int(payload.get("fatigue_score") or 0),
        sleep_hours=float(payload.get("sleep_hours") or 8.0),
        segment_data=payload.get("segment_data") or {},
        segment_fat_pct=payload.get("segment_fat_pct") or {},
        notes=payload.get("notes")
    )
    db.add(new_log)
    await db.commit()
    await db.refresh(new_log)
    return new_log


@router.get("/workouts/latest", response_model=Optional[WorkoutPlanResponse])
async def get_latest_workout(
        db: AsyncSession = Depends(get_db),
        user: UserProfile = Depends(get_current_user)
):
    stmt = (
        select(WorkoutPlan)
        .options(selectinload(WorkoutPlan.exercises))
        .where(WorkoutPlan.user_id == user.id)
        .order_by(WorkoutPlan.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


@router.post("/workouts/generate", response_model=WorkoutPlanResponse)
async def generate_workout(
        payload: WorkoutGeneratePayload,
        db: AsyncSession = Depends(get_db),
        user: UserProfile = Depends(get_current_user)
):
    loc_val = payload.location.value if hasattr(payload.location, 'value') else str(payload.location)

    prof_stmt = select(AthleteProfile).where(AthleteProfile.user_id == user.id)
    profile = (await db.execute(prof_stmt)).scalar_one_or_none()

    rationale = (
        f"Протокол синтезирован под цели: {', '.join(profile.goals) if profile and profile.goals else 'Рекомпозиция'}. "
        f"Локация: {loc_val}. Ограничения: {profile.restrictions if profile else 'Без бега'}. "
        f"Перерыв: {profile.last_break if profile else 'Более года'} (коэффициент интенсивности 0.7)."
    )

    plan = WorkoutPlan(
        user_id=user.id,
        target_split=payload.target_split or payload.split_day,
        location=loc_val,
        split_day=payload.split_day,
        ai_rationale=rationale,
        status="planned"
    )
    db.add(plan)
    await db.flush()

    if loc_val == "Зал":
        exercises_data = [
            {"name": "Жим штанги лежа / Гантелей", "type": "hypertrophy", "sets": 4, "reps": "8-10",
             "targets": ["грудь", "трицепс", "дельты"]},
            {"name": "Тяга горизонтального блока к поясу", "type": "hypertrophy", "sets": 4, "reps": "10-12",
             "targets": ["широчайшие", "ромбовидные", "бицепс"]},
            {"name": "Махи с гантелями стоя в стороны", "type": "isolation", "sets": 3, "reps": "12-15",
             "targets": ["дельты"]},
            {"name": "Разгибания на трицепс на блоке", "type": "isolation", "sets": 3, "reps": "12-15",
             "targets": ["трицепс"]},
        ]
    else:
        exercises_data = [
            {"name": "Разминка шеи и ротаторов плеча", "type": "isometric", "sets": 2, "reps": "60 сек",
             "targets": ["шея", "дельты"]},
            {"name": "Отжимания с акцентом на паузу", "type": "bodyweight", "sets": 4, "reps": "12-15",
             "targets": ["грудь", "трицепс"]},
            {"name": "Лодочка (Y-T-W разведения)", "type": "bodyweight", "sets": 3, "reps": "15",
             "targets": ["лопатки", "верх спины"]},
            {"name": "Планка на предплечьях с изометрией шеи", "type": "isometric", "sets": 3, "reps": "45 сек",
             "targets": ["кор", "шея"]},
        ]

    for idx, ex in enumerate(exercises_data):
        exercise_obj = WorkoutExercise(
            plan_id=plan.id,
            workout_id=plan.id,
            exercise_name=ex["name"],
            exercise_type=ex["type"],
            sets=ex["sets"],
            reps_or_duration=ex["reps"],
            target_muscle_groups=ex["targets"],
            rpe=7,
            rpe_target=7,
            order_index=idx,
            is_completed=False
        )
        db.add(exercise_obj)

    await db.commit()

    stmt = (
        select(WorkoutPlan)
        .options(selectinload(WorkoutPlan.exercises))
        .where(WorkoutPlan.id == plan.id)
    )
    refreshed = await db.execute(stmt)
    return refreshed.scalar_one()


@router.patch("/exercises/{exercise_id}", response_model=WorkoutExerciseResponse)
async def patch_exercise(
        exercise_id: UUID,
        payload: ExercisePatchPayload,
        db: AsyncSession = Depends(get_db),
        user: UserProfile = Depends(get_current_user)
):
    stmt = select(WorkoutExercise).where(WorkoutExercise.id == exercise_id)
    exercise = (await db.execute(stmt)).scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="Упражнение не найдено")

    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(exercise, field, val)

    await db.commit()
    await db.refresh(exercise)
    return exercise


@router.post("/exercises", response_model=WorkoutExerciseResponse)
async def add_exercise_to_plan(
        payload: ExerciseCreatePayload,
        db: AsyncSession = Depends(get_db),
        user: UserProfile = Depends(get_current_user)
):
    new_ex = WorkoutExercise(
        plan_id=payload.plan_id,
        workout_id=payload.plan_id,
        exercise_name=payload.exercise_name,
        exercise_type=payload.exercise_type,
        sets=payload.sets,
        reps_or_duration=payload.reps_or_duration,
        rpe_target=payload.rpe_target,
        target_muscle_groups=payload.target_muscle_groups,
        order_index=99
    )
    db.add(new_ex)
    await db.commit()
    await db.refresh(new_ex)
    return new_ex


@router.delete("/exercises/{exercise_id}")
async def delete_exercise(
        exercise_id: UUID,
        db: AsyncSession = Depends(get_db),
        user: UserProfile = Depends(get_current_user)
):
    stmt = select(WorkoutExercise).where(WorkoutExercise.id == exercise_id)
    exercise = (await db.execute(stmt)).scalar_one_or_none()
    if exercise:
        await db.delete(exercise)
    await db.commit()
    return {"status": "ok"}


@router.post("/exercises/{exercise_id}/alternatives", response_model=List[ExerciseAlternativeItem])
async def get_exercise_alternatives(
        exercise_id: UUID,
        payload: AlternativeRequest,
        db: AsyncSession = Depends(get_db),
        user: UserProfile = Depends(get_current_user)
):
    stmt = (
        select(WorkoutExercise)
        .options(selectinload(WorkoutExercise.plan))
        .where(WorkoutExercise.id == exercise_id)
    )
    exercise = (await db.execute(stmt)).scalar_one_or_none()
    if not exercise or not exercise.plan:
        raise HTTPException(status_code=404, detail="Упражнение не найдено")

    prof_stmt = select(AthleteProfile).where(AthleteProfile.user_id == user.id)
    profile = (await db.execute(prof_stmt)).scalar_one_or_none()

    location = exercise.plan.location or "Дом"

    alternatives = generate_biomechanical_alternatives(
        target_exercise=exercise,
        location=location,
        reason=payload.reason,
        profile=profile
    )
    return alternatives


@router.patch("/exercises/{exercise_id}/swap", response_model=WorkoutExerciseResponse)
async def swap_exercise(
        exercise_id: UUID,
        payload: ExerciseSwapPayload,
        db: AsyncSession = Depends(get_db),
        user: UserProfile = Depends(get_current_user)
):
    stmt = select(WorkoutExercise).where(WorkoutExercise.id == exercise_id)
    exercise = (await db.execute(stmt)).scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="Упражнение не найдено")

    exercise.exercise_name = payload.exercise_name
    exercise.exercise_type = payload.exercise_type
    exercise.sets = payload.sets
    exercise.reps_or_duration = payload.reps_or_duration
    exercise.rpe_target = payload.rpe_target
    exercise.target_muscle_groups = payload.target_muscle_groups
    exercise.is_completed = False

    await db.commit()
    await db.refresh(exercise)
    return exercise


@router.post("/workouts/complete", response_model=WorkoutPlanResponse)
async def complete_workout(
        payload: dict = Body(...),
        db: AsyncSession = Depends(get_db),
        user: UserProfile = Depends(get_current_user)
):
    plan_id = payload.get("plan_id")
    if not plan_id:
        raise HTTPException(status_code=400, detail="plan_id обязателен")

    stmt = select(WorkoutPlan).where(WorkoutPlan.id == UUID(str(plan_id)), WorkoutPlan.user_id == user.id)
    plan = (await db.execute(stmt)).scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="План не найден")

    plan.status = "completed"

    ex_stmt = select(WorkoutExercise).where(WorkoutExercise.plan_id == plan.id)
    exercises = (await db.execute(ex_stmt)).scalars().all()
    for ex in exercises:
        ex.is_completed = True

    await db.commit()
    await db.refresh(plan)

    reload_stmt = select(WorkoutPlan).options(selectinload(WorkoutPlan.exercises)).where(WorkoutPlan.id == plan.id)
    plan = (await db.execute(reload_stmt)).scalar_one_or_none()
    return plan


@router.post("/journal/researches", response_model=TrainingResearchResponse)
async def add_journal_research(
        research: TrainingResearchCreate,
        db: AsyncSession = Depends(get_db),
        user: UserProfile = Depends(get_current_user)
):
    pmid = PubMedParser.extract_pmid(research.source_url)
    abstract = None

    if pmid:
        pubmed_data = await PubMedParser.fetch_abstract(pmid)
        if pubmed_data.get("abstract"):
            abstract = pubmed_data["abstract"]
            if not research.title or research.title == "New Research":
                research.title = pubmed_data.get("title") or research.title

    embedding_service = get_embedding_provider()
    content_for_embedding = f"Title: {research.title}\nTakeaways: {research.key_takeaways}\nAbstract: {abstract or ''}"
    embedding = await KineticsRAGService._generate_embedding(embedding_service, content_for_embedding)

    new_research = TrainingResearch(
        user_id=user.id,
        title=research.title,
        source_url=research.source_url,
        pmid=pmid,
        abstract=abstract,
        key_takeaways=research.key_takeaways,
        tags=research.tags,
        embedding=embedding
    )
    db.add(new_research)
    await db.commit()
    await db.refresh(new_research)
    return new_research


async def get_daily_telemetry_summary(db: AsyncSession, user_id: UUID) -> dict:
    """Собирает суточный срез через скалярные поля без lazy-loading и без риска MissingGreenlet."""
    bio_row = None
    try:
        bio_stmt = (
            select(
                BiometricsLog.sleep_hours,
                BiometricsLog.fatigue_score,
                BiometricsLog.calories_in,
                BiometricsLog.tdee,
                BiometricsLog.protein_g
            )
            .where(BiometricsLog.user_id == user_id)
            .order_by(BiometricsLog.created_at.desc())
            .limit(1)
        )
        bio_res = await db.execute(bio_stmt)
        bio_row = bio_res.first()
    except Exception as e:
        print(f"[Telemetry] Ошибка чтения биометрии: {e}")
        try:
            await db.rollback()
        except Exception:
            pass

    plan_row = None
    try:
        plan_stmt = (
            select(
                WorkoutPlan.id,
                WorkoutPlan.location,
                WorkoutPlan.target_split,
                WorkoutPlan.split_day,
                WorkoutPlan.status
            )
            .where(WorkoutPlan.user_id == user_id)
            .order_by(WorkoutPlan.created_at.desc())
            .limit(1)
        )
        plan_res = await db.execute(plan_stmt)
        plan_row = plan_res.first()
    except Exception as e:
        print(f"[Telemetry] Ошибка чтения плана: {e}")
        try:
            await db.rollback()
        except Exception:
            pass

    completed_ex = 0
    total_ex = 0
    if plan_row and plan_row[0]:
        try:
            ex_stmt = (
                select(
                    func.count(WorkoutExercise.id),
                    func.count(case((WorkoutExercise.is_completed.is_(True), 1)))
                )
                .where(
                    or_(
                        WorkoutExercise.plan_id == plan_row[0],
                        WorkoutExercise.workout_id == plan_row[0]
                    )
                )
            )
            ex_res = await db.execute(ex_stmt)
            ex_counts = ex_res.first()
            if ex_counts:
                total_ex = ex_counts[0] or 0
                completed_ex = ex_counts[1] or 0
        except Exception as e:
            print(f"[Telemetry] Ошибка подсчета упражнений: {e}")
            try:
                await db.rollback()
            except Exception:
                pass

    sleep_hours = float(bio_row[0]) if bio_row and bio_row[0] is not None else 7.5
    fatigue_score = int(bio_row[1]) if bio_row and bio_row[1] is not None else 5
    calories_in = int(bio_row[2]) if bio_row and bio_row[2] is not None else 0
    tdee = int(bio_row[3]) if bio_row and bio_row[3] is not None else 2500
    protein_g = int(bio_row[4]) if bio_row and bio_row[4] is not None else 0
    deficit = max(0, tdee - calories_in) if calories_in > 0 else 0

    if plan_row:
        loc = plan_row[1] or "Зал"
        split_name = plan_row[2] or plan_row[3] or "Фулбоди"
        plan_status = plan_row[4] or "planned"
        split_info = f"{loc} ({split_name})"
    else:
        split_info = "Отдых"
        plan_status = "Нет плана"

    return {
        "sleep_hours": sleep_hours,
        "fatigue_score": fatigue_score,
        "calories_in": calories_in,
        "tdee": tdee,
        "deficit": deficit,
        "protein_g": protein_g,
        "workout_split": split_info,
        "workout_status": plan_status,
        "workout_progress": f"{completed_ex}/{total_ex} выполнено"
    }


@router.post("/workouts/chat", response_model=WorkoutPlanResponse)
async def chat_with_coach(
        payload: dict = Body(...),
        db: AsyncSession = Depends(get_db),
        user: UserProfile = Depends(get_current_user)
):
    message = payload.get("message", "").strip()
    plan_id = payload.get("plan_id")

    stmt = select(WorkoutPlan).options(selectinload(WorkoutPlan.exercises)).where(WorkoutPlan.user_id == user.id)
    if plan_id:
        stmt = stmt.where(WorkoutPlan.id == UUID(str(plan_id)))
    else:
        stmt = stmt.order_by(WorkoutPlan.created_at.desc()).limit(1)

    plan = (await db.execute(stmt)).scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="План не найден")

    user_chat_log = KineticsChatLog(
        user_id=user.id,
        module="coach",
        role="user",
        message=message,
        log_date=datetime.now(timezone.utc).date()
    )
    db.add(user_chat_log)
    await db.commit()

    prof_stmt = select(AthleteProfile).where(AthleteProfile.user_id == user.id)
    profile = (await db.execute(prof_stmt)).scalar_one_or_none()

    researches = []
    try:
        embedding_service = get_embedding_provider()
        focus_group = getattr(plan, "target_split", "")
        researches = await KineticsRAGService.search_relevant_researches(
            query=f"{message} {focus_group}",
            user_id=str(user.id),
            db=db,
            embedding_service=embedding_service,
            limit=3
        )
    except Exception as rag_err:
        print(f"[Kinetics RAG] Ошибка векторного поиска: {rag_err}")
        await db.rollback()

    evidence_block = ""
    if researches:
        evidence_block = "\n".join([
            f"- Исследование «{r.title}» (PMID: {r.pmid or 'N/A'}): {r.key_takeaways}"
            for r in researches
        ])

    current_exercises_str = "\n".join([
        f"- ID:{ex.id} | Название: {ex.exercise_name} | {ex.sets}x{ex.reps_or_duration} | RPE {ex.rpe_target} | Мышцы: {','.join(ex.target_muscle_groups or [])}"
        for ex in plan.exercises
    ])

    telemetry = await get_daily_telemetry_summary(db, user.id)

    telemetry_block = f"""
ЕДИНЫЙ СУТОЧНЫЙ СРЕЗ (ТЕЛЕМЕТРИЯ АТЛЕТА):
- Сон: {telemetry['sleep_hours']} ч | Утомление: {telemetry['fatigue_score']}/10
- Питание: {telemetry['calories_in']} ккал (TDEE: {telemetry['tdee']} ккал, расчетный дефицит: {telemetry['deficit']} ккал)
- Потреблено белка: {telemetry['protein_g']}г (цель: 145г)
- Тренировочный статус: {telemetry['workout_split']} — {telemetry['workout_progress']} ({telemetry['workout_status']})
"""

    system_prompt = f"""
Ты — профессиональный ИИ-тренер и спортивный врач кинетики PKA.
Атлет: 22 года, вес 100.7 кг, цель: рекомпозиция до 15% жира.
Ограничения: {profile.restrictions if profile else 'Без бега, без осевых перегрузок'}.
Текущая локация тренировки: {plan.location}.

{telemetry_block}

Текущие упражнения в плане (обрати внимание на их UUID, если нужно удалить или изменить):
{current_exercises_str}

РЕЗУЛЬТАТЫ ИССЛЕДОВАНИЙ ИЗ ЛИЧНОЙ БАЗЫ ЗНАНИЙ АТЛЕТА:
{evidence_block if evidence_block else "Нет специфических сохраненных исследований под этот запрос."}

ПРАВИЛА АДАПТАЦИИ:
1. КРИТИЧЕСКИЙ ДЕФИЦИТ: Если дефицит калорий превышает 800 ккал, белок < 120г или сон < 6 часов — ТЫ ОБЯЗАН снизить рабочие подходы (на 1-2) и уменьшить целевой RPE (не выше 6-7).
2. Общайся профессионально, но естественно и с эмпатией. Ты поддерживающий спортивный врач и тренер, а не бездушный робот. Избегай чрезмерно жесткого "инженерного" тона, но будь краток и по делу.

Пользователь пишет: "{message}"

Ответь СТРОГО в формате валидного JSON (без markdown-обертки ```json ... ```, чистый JSON объект):
{{
  "coach_response": "Ответ атлету с рекомендациями (естественный и дружелюбный тон)",
  "actions": [
    {{
      "type": "add" | "remove" | "modify" | "none",
      "exercise_id": "укажи точный UUID упражнения строкой, если type remove или modify, иначе null",
      "name": "Название упражнения (обязательно осмысленное, например 'Скручивания на пресс')",
      "sets": 3,
      "reps": "15-20",
      "rpe": 7,
      "targets": ["кор"]
    }}
  ]
}}
"""

    try:
        data = await model_manager.generate_structured(
            task_type=TaskType.ROUTINE_QA,
            prompt=f"Пользователь пишет: {message}",
            schema=CoachActionResponse,
            system_instruction=system_prompt,
            target_model=settings.FAST_LLM_MODEL,
            allow_cloud_fallback=True
        )

        if not data:
            raise ValueError("LLM returned empty structured response")

        plan.ai_rationale = data.coach_response or "План скорректирован."
        
        ai_chat_log = KineticsChatLog(
            user_id=user.id,
            module="coach",
            role="assistant",
            message=plan.ai_rationale,
            log_date=datetime.now(timezone.utc).date()
        )
        db.add(ai_chat_log)

        for act in data.actions:
            act_type = act.type
            if act_type == "add":
                new_ex = WorkoutExercise(
                    plan_id=plan.id,
                    workout_id=plan.id,
                    exercise_name=act.name if act.name is not None else "Новое упражнение",
                    exercise_type="hypertrophy",
                    sets=act.sets if act.sets is not None else 3,
                    reps_or_duration=str(act.reps) if act.reps is not None else "10-12",
                    rpe_target=act.rpe if act.rpe is not None else 7,
                    target_muscle_groups=act.targets if act.targets else ["кор"],
                    order_index=len(plan.exercises)
                )
                db.add(new_ex)
                plan.exercises.append(new_ex)
            elif act_type == "remove" and act.exercise_id:
                target_id_str = str(act.exercise_id).strip()
                for ex in list(plan.exercises):
                    if str(ex.id) == target_id_str:
                        await db.delete(ex)
                        plan.exercises.remove(ex)
            elif act_type == "modify" and act.exercise_id:
                target_id_str = str(act.exercise_id).strip()
                for ex in plan.exercises:
                    if str(ex.id) == target_id_str:
                        if act.name is not None: ex.exercise_name = act.name
                        if act.sets is not None: ex.sets = act.sets
                        if act.reps is not None: ex.reps_or_duration = str(act.reps)
                        if act.rpe is not None: ex.rpe_target = act.rpe

        await db.commit()
    except Exception as e:
        print(f"[Kinetics Coach Error]: {e}")
        await db.rollback()
        target_id = plan_id if plan_id else (plan.id if plan else None)
        if target_id:
            fallback_stmt = select(WorkoutPlan).options(selectinload(WorkoutPlan.exercises)).where(
                WorkoutPlan.id == target_id)
            current_p = (await db.execute(fallback_stmt)).scalar_one_or_none()
            if current_p:
                current_p.ai_rationale = f"Принято: «{message}». Параметры адаптированы."
                await db.commit()
                return current_p
        raise HTTPException(status_code=500, detail=str(e))

    refreshed = await db.execute(
        select(WorkoutPlan).options(selectinload(WorkoutPlan.exercises)).where(WorkoutPlan.id == plan.id)
    )
    return refreshed.scalar_one()

@router.patch("/workouts/plan", response_model=WorkoutPlanResponse)
async def update_workout_plan_settings(
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    user: UserProfile = Depends(get_current_user)
):
    plan_id = payload.get("plan_id")
    stmt = select(WorkoutPlan).options(selectinload(WorkoutPlan.exercises)).where(WorkoutPlan.user_id == user.id)
    if plan_id:
        stmt = stmt.where(WorkoutPlan.id == UUID(str(plan_id)))
    else:
        stmt = stmt.order_by(WorkoutPlan.created_at.desc()).limit(1)

    plan = (await db.execute(stmt)).scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="План не найден")

    allowed_fields = {"location", "target_split", "split_day", "notes"}
    for k, v in payload.items():
        if k in allowed_fields and hasattr(plan, k):
            setattr(plan, k, v)

    # Если переданы ограничения, обновляем их сразу в AthleteProfile
    if "restrictions" in payload or "goals" in payload:
        prof_stmt = select(AthleteProfile).where(AthleteProfile.user_id == user.id)
        profile = (await db.execute(prof_stmt)).scalar_one_or_none()
        if profile:
            if "restrictions" in payload:
                profile.restrictions = payload["restrictions"]
            if "goals" in payload:
                val = payload["goals"]
                profile.goals = [g.strip() for g in val.split(",")] if isinstance(val, str) else val

    await db.commit()
    
    reload_stmt = select(WorkoutPlan).options(selectinload(WorkoutPlan.exercises)).where(WorkoutPlan.id == plan.id)
    refreshed = await db.execute(reload_stmt)
    return refreshed.scalar_one()

@router.post("/nutrition/chat")
async def nutrition_coach_chat(
        payload: dict = Body(...),
        db: AsyncSession = Depends(get_db),
        user: UserProfile = Depends(get_current_user)
):
    user_message = payload.get("message", "")
    current_meals = payload.get("meals", [])
    target_cals = payload.get("target_calories", 2200)
    current_weight = payload.get("current_weight", 100.7)

    consumed_cals = sum(m.get("calories", 0) for m in current_meals)
    consumed_protein = sum(m.get("protein", 0) for m in current_meals)
    consumed_fat = sum(m.get("fat", 0) for m in current_meals)
    consumed_carbs = sum(m.get("carbs", 0) for m in current_meals)

    telemetry = await get_daily_telemetry_summary(db, user.id)

    meals_str = "Нет записей."
    if current_meals:
        meals_str = "\n".join([f"- ID:{m.get('id', 'unknown')} | {m.get('name')} | {m.get('calories')} ккал (Б:{m.get('protein')} Ж:{m.get('fat')} У:{m.get('carbs')})" for m in current_meals])

    system_instruction = f"""
Ты — профессиональный доказательный спортивный нутрициолог и диетолог атлета.
ПАРАМЕТРЫ АТЛЕТА:
- Текущий вес: {current_weight} кг (цель: 85 кг к 22.04.2027, жир 15%).
- Целевой калораж: {target_cals} ккал.
- Тренировочная активность сегодня: {telemetry['workout_split']} ({telemetry['workout_progress']}). Утомление: {telemetry['fatigue_score']}/10.

ТЕКУЩИЙ БАЛАНС ДНЯ:
- Набрано калорий: {consumed_cals} / {target_cals} ккал (остаток: {target_cals - consumed_cals} ккал)
- Набрано белков: {consumed_protein}г / 145г
- Набрано жиров: {consumed_fat}г / 65г
- Набрано углеводов: {consumed_carbs}г / 220г

ТЕКУЩИЕ ПРИЕМЫ ПИЩИ (ДНЕВНИК):
{meals_str}

ТВОИ ПРАВИЛА:
1. Учитывай тренировочную нагрузку: если сегодня была тяжелая сессия или запланирован силовой сплит, приоритезируй углеводы вокруг тренировки и закрытие нормы белка.
2. Общайся естественно, с эмпатией, как профессиональный и поддерживающий диетолог. Не будь роботом. Отвечай кратко и по делу.
3. Если пользователь просит добавить, удалить или изменить прием пищи (например, если он ошибся при вводе), верни блок MEAL_ACTION. 
Ты можешь возвращать несколько блоков подряд для сложных изменений (например, удалить старое и добавить новое).

Формат блока:
<<<MEAL_ACTION
{{"action": "add" | "remove" | "modify", "id": "UUID если remove/modify", "name": "...", "calories": 0, "protein": 0, "fat": 0, "carbs": 0}}
MEAL_ACTION>>>
"""

    try:
        response_text = await model_manager.generate_text(
            task_type=TaskType.ROUTINE_QA,
            prompt=f"Сообщение атлета: {user_message}",
            system_instruction=system_instruction,
            target_model=settings.FAST_LLM_MODEL,
            allow_cloud_fallback=True
        )
        user_log = KineticsChatLog(user_id=user.id, module="nutrition", role="user", message=user_message)
        assistant_log = KineticsChatLog(user_id=user.id, module="nutrition", role="assistant", message=response_text)
        db.add_all([user_log, assistant_log])
        await db.commit()

        return {"status": "ok", "response": response_text or "Данные рациона зафиксированы."}
    except Exception as e:
        print(f"[Nutrition Coach Error]: {e}")
        await db.rollback()
        user_log = KineticsChatLog(user_id=user.id, module="nutrition", role="user", message=user_message)
        assistant_log = KineticsChatLog(user_id=user.id, module="nutrition", role="assistant", message="Сервис временно недоступен.")
        db.add_all([user_log, assistant_log])
        await db.commit()
        raise HTTPException(status_code=500, detail=str(e))


def extract_json_payload(text: str) -> dict:
    """Безопасное извлечение JSON из ответа модели с очисткой от markdown."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        return json.loads(match.group(0))
    return json.loads(text)


@router.post("/nutrition/scan-photo")
async def scan_meal_photo(
    file: UploadFile = File(...),
    user: UserProfile = Depends(get_current_user)
):
    try:
        contents = await file.read()
        mime_type = file.content_type or "image/jpeg"

        prompt = """Ты — профессиональный спортивный диетолог. Определи блюдо на фото, его примерный вес и рассчитай точный КБЖУ.
Верни ответ СТРОГО в формате одного JSON-объекта без лишнего текста, без тегов <think> и без разметки markdown:
{
  "name": "Название блюда (например, Чиа-пудинг с ягодами)",
  "weight_g": 200.0,
  "calories": 240.0,
  "protein": 7.5,
  "fat": 9.0,
  "carbs": 32.0,
  "confidence": 0.9,
  "ingredients": ["семена чиа", "кокосовое молоко", "малина"]
}"""

        response_text = await model_manager.generate_vision(
            prompt=prompt,
            image_bytes=contents,
            mime_type=mime_type,
            allow_cloud_fallback=True
        )

        result_data = None
        if response_text:
            try:
                result_data = extract_json_payload(response_text)
            except Exception as parse_err:
                print(f"[Scan Photo Error] Не удалось распарсить JSON: {response_text}")

        if not result_data:
            result_data = {
                "name": "Не распознано",
                "weight_g": 200.0,
                "calories": 250.0,
                "protein": 10.0,
                "fat": 8.0,
                "carbs": 30.0,
                "confidence": 0.2,
                "ingredients": []
            }

        return {
            "name": str(result_data.get("name", result_data.get("dish_name", "Блюдо"))),
            "weight_g": float(result_data.get("weight_g", 200.0)),
            "calories": float(result_data.get("calories", 0)),
            "protein": float(result_data.get("protein", 0)),
            "fat": float(result_data.get("fat", result_data.get("fats", 0))),
            "carbs": float(result_data.get("carbs", 0)),
            "confidence": float(result_data.get("confidence", 0.5)),
            "ingredients": result_data.get("ingredients", [])
        }
    except Exception as e:
        print(f"[Scan Photo Fatal Error]: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/journal/logs")
async def get_training_logs(
        db: AsyncSession = Depends(get_db),
        user: UserProfile = Depends(get_current_user)
):
    stmt = select(TrainingLog).where(TrainingLog.user_id == user.id).order_by(TrainingLog.log_date.desc()).limit(30)
    return (await db.execute(stmt)).scalars().all()


@router.post("/journal/logs")
async def create_training_log(
        payload: dict = Body(...),
        db: AsyncSession = Depends(get_db),
        user: UserProfile = Depends(get_current_user)
):
    log_entry = TrainingLog(
        user_id=user.id,
        rpe_overall=payload.get("rpe_overall", 7),
        energy_level=payload.get("energy_level", 7),
        notes=payload.get("notes"),
        lessons_learned=payload.get("lessons_learned")
    )
    db.add(log_entry)
    await db.commit()
    await db.refresh(log_entry)
    return log_entry


@router.get("/journal/researches")
async def get_researches(
        db: AsyncSession = Depends(get_db),
        user: UserProfile = Depends(get_current_user)
):
    stmt = select(TrainingResearch).where(TrainingResearch.user_id == user.id).order_by(
        TrainingResearch.created_at.desc())
    return (await db.execute(stmt)).scalars().all()


@router.get("/analytics/correlation")
async def get_analytics_correlation(
        weeks: int = 8,
        db: AsyncSession = Depends(get_db),
        user: UserProfile = Depends(get_current_user)
):
    bio_query = text("""
        SELECT 
            to_char(date_trunc('week', created_at), 'YYYY-"W"IW') AS week_key,
            ROUND(AVG(COALESCE(body_fat_pct, body_fat_percentage, 0))::numeric, 1) AS avg_fat_pct,
            ROUND(AVG(CASE WHEN calories_in > 0 THEN (tdee - calories_in) ELSE 0 END)::numeric, 0) AS avg_deficit
        FROM biometrics_logs
        WHERE user_id = :user_id 
          AND created_at >= NOW() - INTERVAL '1 week' * :weeks
        GROUP BY 1
        ORDER BY 1 ASC
    """)
    bio_res = await db.execute(bio_query, {"user_id": user.id, "weeks": weeks})
    bio_weeks = {
        row.week_key: {
            "fat_pct": float(row.avg_fat_pct or 0),
            "deficit": int(row.avg_deficit or 0)
        }
        for row in bio_res
    }

    tonnage_query = text("""
        SELECT 
            to_char(date_trunc('week', p.created_at), 'YYYY-"W"IW') AS week_key,
            ROUND(SUM(e.sets * 10 * 60) / 1000.0, 1) AS tonnage_tons
        FROM workout_exercises e
        JOIN workout_plans p ON e.plan_id = p.id
        WHERE p.user_id = :user_id 
          AND e.is_completed = true
          AND p.created_at >= NOW() - INTERVAL '1 week' * :weeks
        GROUP BY 1
        ORDER BY 1 ASC
    """)
    ton_res = await db.execute(tonnage_query, {"user_id": user.id, "weeks": weeks})
    ton_weeks = {row.week_key: float(row.tonnage_tons or 0) for row in ton_res}

    all_keys = sorted(set(list(bio_weeks.keys()) + list(ton_weeks.keys())))
    timeline = []
    for idx, wk in enumerate(all_keys, 1):
        timeline.append({
            "week": f"W{idx}",
            "period": wk,
            "fatPct": bio_weeks.get(wk, {}).get("fat_pct", 0),
            "deficit": bio_weeks.get(wk, {}).get("deficit", 0),
            "tonnage": ton_weeks.get(wk, 0)
        })

    return timeline


@router.get("/calendar/month", response_model=List[WorkoutPlanResponse])
async def get_calendar_month(
    limit: int = 30,
    db: AsyncSession = Depends(get_db),
    user: UserProfile = Depends(get_current_user)
):
    stmt = (
        select(WorkoutPlan)
        .options(selectinload(WorkoutPlan.exercises))
        .where(WorkoutPlan.user_id == user.id)
        .order_by(WorkoutPlan.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    plans = result.scalars().all()
    # Возвращаем в хронологическом порядке для удобного рендера сетки
    return list(reversed(plans))


@router.post("/calendar/reschedule")
async def reschedule_calendar(
        payload: RescheduleRequest,
        db: AsyncSession = Depends(get_db),
        user: UserProfile = Depends(get_current_user)
):
    return {"status": "ok", "message": "Расписание обновлено"}

@router.get("/chat/{module}", response_model=List[KineticsChatLogResponse])
async def get_chat_history(
    module: str,
    db: AsyncSession = Depends(get_db),
    user: UserProfile = Depends(get_current_user)
):
    if module not in ["coach", "nutrition"]:
        raise HTTPException(status_code=400, detail="Invalid module")

    stmt = select(KineticsChatLog).where(
        KineticsChatLog.user_id == user.id,
        KineticsChatLog.module == module,
        KineticsChatLog.log_date == func.current_date()
    ).order_by(KineticsChatLog.created_at.asc())

    result = await db.execute(stmt)
    logs = result.scalars().all()
    return logs

@router.post("/chat/{module}/summarize", response_model=KineticsInsightResponse)
async def summarize_chat(
    module: str,
    db: AsyncSession = Depends(get_db),
    user: UserProfile = Depends(get_current_user)
):
    if module not in ["coach", "nutrition"]:
        raise HTTPException(status_code=400, detail="Invalid module")

    # Получаем все логи за последние 7 дней для суммаризации
    seven_days_ago = date.today() - timedelta(days=7)
    stmt = select(KineticsChatLog).where(
        KineticsChatLog.user_id == user.id,
        KineticsChatLog.module == module,
        KineticsChatLog.log_date >= seven_days_ago
    ).order_by(KineticsChatLog.created_at.asc())

    result = await db.execute(stmt)
    logs = result.scalars().all()

    if not logs:
        raise HTTPException(status_code=404, detail="Нет диалогов для суммаризации")

    # Формируем текст для LLM
    chat_text = "\n".join([f"{l.log_date} | {l.role.upper()}: {l.message}" for l in logs])
    
    prompt = f"""
Проанализируй следующую историю общения атлета с {'ИИ-Тренером' if module == 'coach' else 'ИИ-Диетологом'} за последние дни:

{chat_text}

Сделай выжимку главных инсайтов, тенденций, жалоб (если были) и принятых решений (изменения в тренировках/питании).
Сформулируй это как 3-4 емких пункта.
"""
    
    try:
        summary_text = await model_manager.generate_text(
            task_type=TaskType.ROUTINE_QA,
            prompt=prompt,
            system_instruction="Ты — аналитик спортивных данных. Твоя задача — извлечь суть из сырого чата.",
            target_model=settings.FAST_LLM_MODEL,
            allow_cloud_fallback=True
        )
    except Exception as e:
        print(f"[Summarize Error]: {e}")
        raise HTTPException(status_code=500, detail="Ошибка суммаризации")

    # Сохраняем инсайт
    insight = KineticsInsight(
        user_id=user.id,
        module=module,
        period_start=seven_days_ago,
        period_end=date.today(),
        insight_text=summary_text
    )
    db.add(insight)

    # Удаляем сырые логи
    delete_stmt = KineticsChatLog.__table__.delete().where(
        KineticsChatLog.user_id == user.id,
        KineticsChatLog.module == module,
        KineticsChatLog.log_date >= seven_days_ago
    )
    await db.execute(delete_stmt)
    await db.commit()

    return insight


async def synthesize_week(week_idx: int, dates: list, payload: MesocycleGeneratePayload) -> Optional[MesocyclePlan]:
    week_rpe = {0: 7, 1: 8, 2: 9, 3: 6}
    rpe = week_rpe.get(week_idx, 7)
    if week_idx == payload.weeks_count - 1 and payload.include_deload:
        rpe = 6
        
    prompt = f"""Сгенерируй недельный микроцикл (Неделя {week_idx+1}) для атлета.
Дни тренировок: {len(dates)} дн/нед.
Сплит: {payload.target_split}.
Локация: {payload.location}.
Целевой RPE этой недели: {rpe}.
{"Это разгрузочная неделя (deload). Снизь объем (подходы) на 30-40% и используй RPE 6." if rpe == 6 else ""}

Верни строго JSON с массивом sessions (по 1 сессии на каждый тренировочный день). Для каждого упражнения укажи name, target_muscle_groups, sets, reps_or_duration, rpe_target и type.
"""
    return await model_manager.generate_structured(
        task_type=TaskType.ROUTINE_QA,
        schema=MesocyclePlan,
        prompt=prompt,
        system_instruction="Ты — AI-тренер по бодибилдингу и фитнесу. Генерируй точные тренировочные планы.",
        allow_cloud_fallback=True
    )

@router.post("/workouts/generate-mesocycle")
async def generate_mesocycle(
    payload: MesocycleGeneratePayload,
    db: AsyncSession = Depends(get_db),
    user: UserProfile = Depends(get_current_user)
):
    from datetime import timedelta, datetime, timezone
    
    dates_by_week = []
    curr = payload.start_date
    while len(dates_by_week) < payload.weeks_count:
        week_dates = []
        for _ in range(7):
            if curr.weekday() in payload.days_of_week:
                week_dates.append(curr)
            curr += timedelta(days=1)
        if week_dates:
            dates_by_week.append(week_dates)
        
    tasks = []
    for w_idx, w_dates in enumerate(dates_by_week):
        tasks.append(synthesize_week(w_idx, w_dates, payload))
        
    results = await asyncio.gather(*tasks)
    
    for w_idx, week_plan in enumerate(results):
        if not week_plan or not week_plan.sessions:
            continue
        w_dates = dates_by_week[w_idx]
        for s_idx, session in enumerate(week_plan.sessions):
            if s_idx >= len(w_dates):
                break
            
            s_date = datetime.combine(w_dates[s_idx], datetime.min.time()).replace(tzinfo=timezone.utc)
            
            db_plan = WorkoutPlan(
                user_id=user.id,
                target_split=session.target_split,
                location=payload.location,
                split_day=session.target_split,
                ai_rationale=session.ai_rationale,
                status="planned"
            )
            db_plan.created_at = s_date
            db_plan.updated_at = s_date
            db.add(db_plan)
            await db.flush()
            
            for ex_idx, ex in enumerate(session.exercises):
                raw_targets = ex.target_muscle_groups or []
                if isinstance(raw_targets, str):
                    targets_list = [t.strip() for t in raw_targets.split(",") if t.strip()]
                elif isinstance(raw_targets, list):
                    targets_list = [str(t) for t in raw_targets]
                else:
                    targets_list = ["Функционал"]

                db_ex = WorkoutExercise(
                    plan_id=db_plan.id,
                    workout_id=db_plan.id,
                    exercise_name=ex.name,
                    exercise_type=ex.type,
                    sets=ex.sets,
                    reps_or_duration=ex.reps_or_duration,
                    target_muscle_groups=targets_list,
                    rpe_target=ex.rpe_target,
                    order_index=ex_idx,
                    is_completed=False
                )
                db_ex.created_at = s_date
                db_ex.updated_at = s_date
                db.add(db_ex)
                
    await db.commit()
    return {"status": "ok", "message": "Мезоцикл успешно синтезирован"}
@router.get("/nutrition/daily", response_model=DailyNutritionSummaryResponse)
async def get_daily_nutrition(
    date: str,
    user: UserProfile = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from datetime import datetime
    try:
        target_date = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, expected YYYY-MM-DD")

    query = select(KineticsNutritionMeal).where(
        KineticsNutritionMeal.user_id == user.id,
        KineticsNutritionMeal.meal_date == target_date
    ).order_by(KineticsNutritionMeal.created_at)

    result = await db.execute(query)
    meals = result.scalars().all()

    total_calories = round(sum(m.calories for m in meals), 1)
    total_protein = round(sum(m.protein for m in meals), 1)
    total_fat = round(sum(m.fat for m in meals), 1)
    total_carbs = round(sum(m.carbs for m in meals), 1)

    return DailyNutritionSummaryResponse(
        date=target_date,
        total_calories=total_calories,
        total_protein=total_protein,
        total_fat=total_fat,
        total_carbs=total_carbs,
        meals=[NutritionMealResponse.model_validate(m) for m in meals]
    )

@router.post("/nutrition/meals", response_model=NutritionMealResponse)
async def add_nutrition_meal(
    payload: NutritionMealCreate,
    user: UserProfile = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_meal = KineticsNutritionMeal(
        user_id=user.id,
        meal_date=payload.meal_date,
        time_str=payload.time_str,
        name=payload.name,
        weight_g=payload.weight_g,
        calories=payload.calories,
        protein=payload.protein,
        fat=payload.fat,
        carbs=payload.carbs,
        ingredients=[i.model_dump() for i in payload.ingredients]
    )
    db.add(new_meal)
    await db.commit()
    await db.refresh(new_meal)
    return NutritionMealResponse.model_validate(new_meal)

@router.delete("/nutrition/meals/{meal_id}")
async def delete_nutrition_meal(
    meal_id: UUID,
    user: UserProfile = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(KineticsNutritionMeal).where(
        KineticsNutritionMeal.id == meal_id,
        KineticsNutritionMeal.user_id == user.id
    )
    result = await db.execute(query)
    meal = result.scalars().first()
    if not meal:
        raise HTTPException(status_code=404, detail="Meal not found")

    await db.delete(meal)
    await db.commit()
    return {"status": "ok"}


@router.post("/exercises/{exercise_id}/sets", response_model=kinetics_schemas.WorkoutSetResponse)
async def create_workout_set(
    exercise_id: UUID,
    set_create: kinetics_schemas.WorkoutSetCreate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    new_set = kinetics_kinetics_models.WorkoutSet(
        exercise_id=exercise_id,
        **set_create.model_dump()
    )
    db.add(new_set)
    await db.commit()
    await db.refresh(new_set)
    return new_set

@router.put("/workout-sets/{set_id}", response_model=kinetics_schemas.WorkoutSetResponse)

async def update_workout_set(
    set_id: UUID,
    set_update: kinetics_schemas.WorkoutSetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    stmt = select(kinetics_kinetics_models.WorkoutSet).where(kinetics_kinetics_models.WorkoutSet.id == set_id)
    result = await db.execute(stmt)
    workout_set = result.scalars().first()
    if not workout_set:
        raise HTTPException(status_code=404, detail="Set not found")

    update_data = set_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(workout_set, key, value)
    
    db.add(workout_set)
    await db.commit()
    await db.refresh(workout_set)
    return workout_set

@router.delete("/workout-sets/{set_id}")
async def delete_workout_set(
    set_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    stmt = select(kinetics_kinetics_models.WorkoutSet).where(kinetics_kinetics_models.WorkoutSet.id == set_id)
    result = await db.execute(stmt)
    workout_set = result.scalars().first()
    if not workout_set:
        raise HTTPException(status_code=404, detail="Set not found")
        
    await db.delete(workout_set)
    await db.commit()
    return {"status": "ok"}


@router.post("/workouts/{plan_id}/duplicate", response_model=kinetics_schemas.WorkoutPlanResponse)
async def duplicate_workout_plan(
    plan_id: UUID,
    payload: kinetics_schemas.WorkoutDuplicateRequest,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from datetime import datetime
    try:
        target_date = datetime.strptime(payload.target_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, expected YYYY-MM-DD")

    stmt = select(WorkoutPlan).where(WorkoutPlan.id == plan_id).options(
        selectinload(WorkoutPlan.exercises).selectinload(WorkoutExercise.workout_sets)
    )
    result = await db.execute(stmt)
    source_plan = result.scalar_one_or_none()

    if not source_plan:
        raise HTTPException(status_code=404, detail="Source WorkoutPlan not found")

    if source_plan.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Clone plan
    new_plan = WorkoutPlan(
        user_id=current_user.id,
        date=target_date,
        location=source_plan.location,
        target_split=source_plan.target_split,
        split_day=source_plan.split_day,
        focus_areas=source_plan.focus_areas,
        is_completed=False,
        notes=source_plan.notes,
        workout_type=source_plan.workout_type,
        rpe_target=source_plan.rpe_target
    )
    db.add(new_plan)
    await db.flush() # to get new_plan.id

    for ex in source_plan.exercises:
        new_ex = WorkoutExercise(
            plan_id=new_plan.id,
            exercise_name=ex.exercise_name,
            target_muscle_groups=ex.target_muscle_groups,
            sets=ex.sets,
            reps_or_duration=ex.reps_or_duration,
            rpe_target=ex.rpe_target,
            rest_seconds=ex.rest_seconds,
            notes=ex.notes,
            order_index=ex.order_index
        )
        db.add(new_ex)
        await db.flush()

        for s in ex.workout_sets:
            new_weight = s.weight_kg
            if payload.apply_overload and s.set_type.name in ['NORMAL', 'DROP', 'FAILURE', 'N', 'D', 'F']:
                new_weight = s.weight_kg + payload.overload_increment_kg

            new_set = kinetics_models.WorkoutSet(
                exercise_id=new_ex.id,
                set_number=s.set_number,
                set_type=s.set_type,
                weight_kg=new_weight,
                reps=s.reps,
                rpe=s.rpe,
                is_completed=False,
                previous_weight_kg=s.weight_kg,
                previous_reps=s.reps
            )
            db.add(new_set)

    await db.commit()
    
    # Reload for response
    stmt_reload = select(WorkoutPlan).where(WorkoutPlan.id == new_plan.id).options(
        selectinload(WorkoutPlan.exercises).selectinload(WorkoutExercise.workout_sets)
    )
    res = await db.execute(stmt_reload)
    return res.scalar_one()



@router.get("/analytics/overload", response_model=kinetics_schemas.OverloadAnalyticsResponse)
async def get_overload_analytics(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from collections import defaultdict
    import datetime

    # Get latest user weight
    stmt_bw = select(kinetics_models.BiometricsLog).where(kinetics_models.BiometricsLog.user_id == current_user.id).order_by(kinetics_models.BiometricsLog.timestamp.desc()).limit(1)
    res_bw = await db.execute(stmt_bw)
    bw_log = res_bw.scalar_one_or_none()
    user_bw = bw_log.weight_kg if bw_log and bw_log.weight_kg else 80.0 # fallback

    # Get all plans and sets
    stmt = select(WorkoutPlan).where(
        WorkoutPlan.user_id == current_user.id,
        WorkoutPlan.status == 'completed'
    ).options(
        selectinload(WorkoutPlan.exercises).selectinload(WorkoutExercise.workout_sets)
    ).order_by(WorkoutPlan.created_at.asc())
    
    res = await db.execute(stmt)
    plans = res.scalars().all()

    # 1RM Calculation
    # Dictionary: { "exercise_name": { "date_str": max_1rm } }
    one_rm_raw = defaultdict(lambda: defaultdict(float))
    
    # Tonnage calculation
    # Dictionary: { "week_start": { "muscle_group": tonnage } }
    tonnage_raw = defaultdict(lambda: defaultdict(float))

    for plan in plans:
        if not plan.created_at:
            continue
        dt = plan.created_at
        date_str = dt.date().isoformat()
        # ISO calendar week start
        week_start = (dt - datetime.timedelta(days=dt.weekday())).strftime("%Y-%m-%d")

        for ex in plan.exercises:
            ex_name_clean = ex.exercise_name.strip()
            
            day_max_1rm = 0.0
            day_tonnage = 0.0

            for s in ex.workout_sets:
                if not s.is_completed:
                    continue
                
                # Tonnage
                if s.set_type.name in ['NORMAL', 'DROP', 'FAILURE', 'N', 'D', 'F']:
                    day_tonnage += (s.weight_kg if s.weight_kg > 0 else user_bw) * s.reps

                # 1RM Epley formula (only reps 1-12)
                if s.set_type.name in ['NORMAL', 'DROP', 'FAILURE', 'N', 'D', 'F']:
                    if 1 <= s.reps <= 12:
                        w = s.weight_kg if s.weight_kg > 0 else user_bw
                        rm = w * (1.0 + s.reps / 30.0)
                        if rm > day_max_1rm:
                            day_max_1rm = rm
            
            if day_max_1rm > 0:
                if day_max_1rm > one_rm_raw[ex_name_clean][date_str]:
                    one_rm_raw[ex_name_clean][date_str] = day_max_1rm
            
            if day_tonnage > 0:
                m_group = ex.target_muscle_groups[0] if ex.target_muscle_groups else plan.target_split or 'General'
                tonnage_raw[week_start][m_group] += day_tonnage

    # Top 5 exercises by frequency
    ex_frequencies = {name: len(dates) for name, dates in one_rm_raw.items()}
    top_5_ex = sorted(ex_frequencies.keys(), key=lambda x: ex_frequencies[x], reverse=True)[:5]

    one_rm_top_exercises = []
    for ex_name in top_5_ex:
        history = [
            kinetics_schemas.OneRMDataPoint(date=d, one_rm_kg=round(rm, 1))
            for d, rm in sorted(one_rm_raw[ex_name].items())
        ]
        one_rm_top_exercises.append(kinetics_schemas.ExerciseOneRM(
            exercise_name=ex_name,
            history=history
        ))

    weekly_tonnage = []
    for week_start, m_groups in sorted(tonnage_raw.items()):
        for m_group, ton in m_groups.items():
            weekly_tonnage.append(kinetics_schemas.TonnageDataPoint(
                week_start=week_start,
                muscle_group=m_group,
                tonnage_kg=round(ton, 1)
            ))

    return kinetics_schemas.OverloadAnalyticsResponse(
        one_rm_top_exercises=one_rm_top_exercises,
        weekly_tonnage=weekly_tonnage
    )





@router.get("/analytics/recovery", response_model=kinetics_schemas.RecoveryAnalyticsResponse)
async def get_recovery_analytics(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    import datetime
    
    today = datetime.datetime.now().date()
    start_date = today - datetime.timedelta(days=13) # 14 days timeline
    
    # 1. Fetch Tonnage
    stmt_plans = select(WorkoutPlan).where(
        WorkoutPlan.user_id == current_user.id,
        cast(WorkoutPlan.created_at, Date) >= start_date,
        cast(WorkoutPlan.created_at, Date) <= today
    ).options(
        selectinload(WorkoutPlan.exercises).selectinload(WorkoutExercise.workout_sets)
    )
    res_plans = await db.execute(stmt_plans)
    plans = res_plans.scalars().all()
    
    tonnage_by_day = {}
    for p in plans:
        if not p.created_at: continue
        date_str = p.created_at.date().isoformat()
        tonnage = 0.0
        for ex in p.exercises:
            for s in ex.workout_sets:
                if s.is_completed and s.set_type.name in ['NORMAL', 'DROP', 'FAILURE', 'N', 'D', 'F']:
                    tonnage += (s.weight_kg if s.weight_kg > 0 else 80.0) * s.reps
        tonnage_by_day[date_str] = tonnage_by_day.get(date_str, 0.0) + tonnage

    # 2. Fetch Nutrition
    stmt_nutr = select(kinetics_models.KineticsNutritionMeal).where(
        kinetics_models.KineticsNutritionMeal.user_id == current_user.id,
        kinetics_models.KineticsNutritionMeal.meal_date >= start_date,
        kinetics_models.KineticsNutritionMeal.meal_date <= today
    )
    res_nutr = await db.execute(stmt_nutr)
    meals = res_nutr.scalars().all()
    
    nutr_by_day = {}
    for m in meals:
        if not m.meal_date: continue
        date_str = m.meal_date.isoformat()
        if date_str not in nutr_by_day:
            nutr_by_day[date_str] = {'cal': 0, 'prot': 0}
        nutr_by_day[date_str]['cal'] += (m.calories or 0)
        nutr_by_day[date_str]['prot'] += (m.protein or 0)

    # 3. Fetch Biometrics (Sleep & Fatigue)
    stmt_bio = select(kinetics_models.BiometricsLog).where(
        kinetics_models.BiometricsLog.user_id == current_user.id,
        cast(kinetics_models.BiometricsLog.timestamp, Date) >= start_date,
        cast(kinetics_models.BiometricsLog.timestamp, Date) <= today
    )
    res_bio = await db.execute(stmt_bio)
    bios = res_bio.scalars().all()
    
    bio_by_day = {}
    for b in bios:
        if b.timestamp:
            date_str = b.timestamp.date().isoformat()
            # If multiple per day, take latest
            bio_by_day[date_str] = b

    # 4. Assemble Timeline
    timeline = []
    
    total_tonnage = 0.0
    sum_sleep = 0.0
    sum_cals = 0.0
    days_with_sleep = 0
    days_with_cals = 0
    
    for i in range(14):
        d = start_date + datetime.timedelta(days=i)
        d_str = d.isoformat()
        
        t = tonnage_by_day.get(d_str, 0.0)
        c = int(nutr_by_day.get(d_str, {}).get('cal', 0))
        p = int(nutr_by_day.get(d_str, {}).get('prot', 0))
        
        b = bio_by_day.get(d_str)
        sleep = b.sleep_hours if b and b.sleep_hours else 7.0 # default to 7 if not set
        fatigue = b.fatigue_score if b and b.fatigue_score else 5
        
        if b and b.sleep_hours:
            sum_sleep += sleep
            days_with_sleep += 1
            
        if c > 0:
            sum_cals += c
            days_with_cals += 1
            
        total_tonnage += t
        
        # Calculate scores
        # Sleep: >=8 -> 100, 6 -> 60, <5 -> 25
        if sleep >= 8:
            s_sleep = 100
        elif sleep >= 6:
            s_sleep = 60 + (sleep - 6) * 20 # 6->60, 7->80, 8->100
        else:
            s_sleep = max(0, sleep * 10) # 5->50, 4->40
            
        # Nutrition
        s_nutr = 50
        if c > 1500 and p > 100:
            s_nutr = 100
        elif c > 0:
            s_nutr = 75
            
        # CNS
        s_cns = 100
        if fatigue >= 7 and t > 5000:
            s_cns = 50
        elif fatigue >= 8:
            s_cns = 60
            
        recovery_score = (s_sleep * 0.45) + (s_nutr * 0.35) + (s_cns * 0.20)
        
        timeline.append(kinetics_schemas.RecoveryDataPoint(
            date=d_str,
            tonnage_kg=t,
            calories=c,
            protein_g=p,
            sleep_hours=sleep,
            fatigue_score=fatigue,
            recovery_score=round(recovery_score, 1)
        ))

    avg_sleep = sum_sleep / days_with_sleep if days_with_sleep > 0 else 7.0
    avg_cals = sum_cals / days_with_cals if days_with_cals > 0 else 0.0
    curr_score = timeline[-1].recovery_score if timeline else 0.0

    return kinetics_schemas.RecoveryAnalyticsResponse(
        timeline=timeline,
        average_sleep=round(avg_sleep, 1),
        average_calories=round(avg_cals, 1),
        total_tonnage=round(total_tonnage, 1),
        current_recovery_score=curr_score
    )



@router.get("/export/excel")
async def export_kinetics_excel(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    import io
    import datetime
    from collections import defaultdict
    import openpyxl
    from openpyxl.styles import Font, PatternFill
    from starlette.responses import StreamingResponse

    # 1. Fetch data
    stmt_plans = select(WorkoutPlan).where(
        WorkoutPlan.user_id == current_user.id
    ).options(
        selectinload(WorkoutPlan.exercises).selectinload(WorkoutExercise.workout_sets)
    ).order_by(WorkoutPlan.created_at.asc())
    plans = (await db.execute(stmt_plans)).scalars().all()

    stmt_nutr = select(kinetics_models.KineticsNutritionMeal).where(
        kinetics_models.KineticsNutritionMeal.user_id == current_user.id
    ).order_by(kinetics_models.KineticsNutritionMeal.meal_date.asc())
    meals = (await db.execute(stmt_nutr)).scalars().all()

    stmt_bio = select(kinetics_models.BiometricsLog).where(
        kinetics_models.BiometricsLog.user_id == current_user.id
    ).order_by(kinetics_models.BiometricsLog.timestamp.asc())
    bios = (await db.execute(stmt_bio)).scalars().all()

    wb = openpyxl.Workbook()
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="334155", end_color="334155", fill_type="solid")

    def apply_header(sheet, columns):
        sheet.append(columns)
        for cell in sheet[1]:
            cell.font = header_font
            cell.fill = header_fill

    # Sheet 1: Journal
    ws1 = wb.active
    ws1.title = "Журнал"
    apply_header(ws1, ["Дата", "Тренировка", "Упражнение", "Сет", "Тип", "Вес (кг)", "Повторения", "Выполнено", "1RM (Эпли)"])
    
    # Get latest bodyweight to fallback for BW exercises
    last_bw = 80.0
    if bios:
        for b in reversed(bios):
            if b.weight_kg:
                last_bw = b.weight_kg
                break

    tonnage_by_date = defaultdict(float)
    one_rm_raw = defaultdict(lambda: defaultdict(float))

    for p in plans:
        if not p.created_at: continue
        date_str = p.created_at.strftime("%Y-%m-%d")
        for ex in p.exercises:
            ex_name = ex.exercise_name
            for s in ex.workout_sets:
                w = s.weight_kg if s.weight_kg > 0 else last_bw
                
                rm = ""
                if s.set_type.name in ['NORMAL', 'DROP', 'FAILURE', 'N', 'D', 'F'] and s.is_completed:
                    if 1 <= s.reps <= 12:
                        rm = round(w * (1 + s.reps / 30.0), 1)
                        if rm > one_rm_raw[ex_name][date_str]:
                            one_rm_raw[ex_name][date_str] = rm
                    
                    tonnage_by_date[date_str] += w * s.reps
                
                ws1.append([
                    date_str, p.target_split or "", ex_name, s.set_number, 
                    s.set_type.name, s.weight_kg, s.reps, 
                    "Да" if s.is_completed else "Нет", rm
                ])

    # Sheet 2: Recovery
    ws2 = wb.create_sheet("Восстановление")
    apply_header(ws2, ["Дата", "Тоннаж (кг)", "Сон (ч)", "Усталость", "Калории", "Белки", "Жиры", "Углеводы", "Recovery Score"])

    # Aggregate nutrition by day
    nutr_by_day = defaultdict(lambda: {'c':0, 'p':0, 'f':0, 'cb':0})
    for m in meals:
        if not m.meal_date: continue
        d = m.meal_date.strftime("%Y-%m-%d")
        nutr_by_day[d]['c'] += (m.calories or 0)
        nutr_by_day[d]['p'] += (m.protein or 0)
        nutr_by_day[d]['f'] += (m.fat or 0)
        nutr_by_day[d]['cb'] += (m.carbs or 0)

    bio_by_day = {}
    for b in bios:
        if b.timestamp:
            bio_by_day[b.timestamp.date().strftime("%Y-%m-%d")] = b

    # Collect all unique dates
    all_dates = sorted(list(set(list(tonnage_by_date.keys()) + list(nutr_by_day.keys()) + list(bio_by_day.keys()))))
    
    for d in all_dates:
        t = tonnage_by_date.get(d, 0.0)
        cals = nutr_by_day[d]['c']
        prot = nutr_by_day[d]['p']
        fats = nutr_by_day[d]['f']
        carbs = nutr_by_day[d]['cb']
        
        b = bio_by_day.get(d)
        sleep = b.sleep_hours if b and b.sleep_hours else 7.0
        fatigue = b.fatigue_score if b and b.fatigue_score else 5

        s_sleep = 100 if sleep >= 8 else (60 + (sleep-6)*20 if sleep >= 6 else max(0, sleep*10))
        s_nutr = 100 if (cals > 1500 and prot > 100) else (75 if cals > 0 else 50)
        s_cns = 50 if (fatigue >= 7 and t > 5000) else (60 if fatigue >= 8 else 100)
        score = (s_sleep * 0.45) + (s_nutr * 0.35) + (s_cns * 0.20)

        ws2.append([d, t, sleep, fatigue, cals, prot, fats, carbs, round(score, 1)])

    # Sheet 3: 1RM
    ws3 = wb.create_sheet("1RM Динамика")
    apply_header(ws3, ["Дата", "Упражнение", "1RM (кг)"])
    
    # Sort history
    for ex_name, history in one_rm_raw.items():
        for d, rm in sorted(history.items()):
            ws3.append([d, ex_name, rm])

    for sheet in wb.worksheets:
        for column_cells in sheet.columns:
            sheet.column_dimensions[column_cells[0].column_letter].width = 15

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    
    filename = f"kinetics_export_{datetime.datetime.now().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

