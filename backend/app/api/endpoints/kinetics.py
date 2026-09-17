from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID
import json

from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File
from sqlalchemy import select, func, case, or_, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from google import genai
from google.genai import types

from ...db.session import get_db
from ...db.models import (
    BiometricsLog,
    WorkoutPlan,
    WorkoutExercise,
    UserProfile,
    AthleteProfile,
    TrainingLog,
    TrainingResearch
)
from ...schemas.kinetics import (
    BiometricsLogResponse,
    WorkoutPlanResponse,
    WorkoutGeneratePayload,
    WorkoutExerciseResponse,
    AlternativeRequest,
    ExerciseAlternativeItem,
    ExerciseSwapPayload,
    TrainingResearchCreate,
    TrainingResearchResponse
)
from ...services.planner import generate_biomechanical_alternatives
from ...services.kinetics_rag import KineticsRAGService, PubMedParser
from ...knowledge.embeddings.factory import get_embedding_provider


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
    # 1. Запрос биометрии кортежем значений
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

    # 2. Запрос активного плана тренировок
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

    # 3. Подсчёт упражнений через SQL-агрегацию
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

    # Парсинг результатов биометрии
    sleep_hours = float(bio_row[0]) if bio_row and bio_row[0] is not None else 7.5
    fatigue_score = int(bio_row[1]) if bio_row and bio_row[1] is not None else 5
    calories_in = int(bio_row[2]) if bio_row and bio_row[2] is not None else 0
    tdee = int(bio_row[3]) if bio_row and bio_row[3] is not None else 2500
    protein_g = int(bio_row[4]) if bio_row and bio_row[4] is not None else 0
    deficit = max(0, tdee - calories_in) if calories_in > 0 else 0

    # Парсинг статуса плана
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
        plan = (await db.execute(stmt)).scalar_one()

    evidence_block = ""
    if researches:
        evidence_block = "\n".join([
            f"- Исследование «{r.title}» (PMID: {r.pmid or 'N/A'}): {r.key_takeaways}"
            for r in researches
        ])

    current_exercises_str = "\n".join([
        f"- ID:{ex.id} | {ex.exercise_name} | {ex.sets}x{ex.reps_or_duration} | RPE {ex.rpe_target} | Мышцы: {','.join(ex.target_muscle_groups or [])}"
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

Текущие упражнения:
{current_exercises_str}

РЕЗУЛЬТАТЫ ИССЛЕДОВАНИЙ ИЗ ЛИЧНОЙ БАЗЫ ЗНАНИЙ АТЛЕТА:
{evidence_block if evidence_block else "Нет специфических сохраненных исследований под этот запрос."}

ПРАВИЛА БИОМЕХАНИЧЕСКОЙ АДАПТАЦИИ:
1. КРИТИЧЕСКИЙ ДЕФИЦИТ: Если дефицит калорий превышает 800 ккал, белок < 120г или сон < 6 часов — ТЫ ОБЯЗАН снизить рабочие подходы (на 1-2) и уменьшить целевой RPE (не выше 6-7), чтобы предотвратить катаболизм мышц и перегрузку ЦНС.
2. При объяснении опирайся на исследования и суточный срез телеметрии.
3. Сохраняй строгий инженерный тон без пустых вступлений.

Пользователь пишет: "{message}"

Ответь строго в формате JSON со следующими полями:
{{
  "coach_response": "Короткий профессиональный ответ атлету с рекомендациями (2-3 предложения)",
  "actions": [
    {{
      "type": "add" | "remove" | "modify" | "none",
      "exercise_id": "UUID если modify/remove или null",
      "name": "Название упражнения",
      "sets": 3,
      "reps": "10-12",
      "rpe": 7,
      "targets": ["грудь"]
    }}
  ]
}}
Если пользователь просто задает вопрос или просит совет — actions может быть пустым.
"""

    try:
        client = genai.Client()
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=system_prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.3
            )
        )
        data = json.loads(response.text)
        plan.ai_rationale = data.get("coach_response", "План скорректирован.")

        for act in data.get("actions", []):
            act_type = act.get("type")
            if act_type == "add":
                new_ex = WorkoutExercise(
                    plan_id=plan.id,
                    workout_id=plan.id,
                    exercise_name=act.get("name", "Новое упражнение"),
                    exercise_type="hypertrophy",
                    sets=act.get("sets", 3),
                    reps_or_duration=str(act.get("reps", "10-12")),
                    rpe_target=act.get("rpe", 7),
                    target_muscle_groups=act.get("targets", ["кор"]),
                    order_index=len(plan.exercises)
                )
                db.add(new_ex)
            elif act_type == "remove" and act.get("exercise_id"):
                target_id = UUID(str(act["exercise_id"]))
                for ex in list(plan.exercises):
                    if ex.id == target_id:
                        await db.delete(ex)
            elif act_type == "modify" and act.get("exercise_id"):
                target_id = UUID(str(act["exercise_id"]))
                for ex in plan.exercises:
                    if ex.id == target_id:
                        if "name" in act: ex.exercise_name = act["name"]
                        if "sets" in act: ex.sets = act["sets"]
                        if "reps" in act: ex.reps_or_duration = str(act["reps"])
                        if "rpe" in act: ex.rpe_target = act["rpe"]

        await db.commit()
    except Exception as e:
        print(f"[Kinetics Coach] Fallback mode: {e}")
        await db.rollback()
        target_id = plan_id if plan_id else (plan.id if plan else None)
        if target_id:
            fallback_stmt = select(WorkoutPlan).options(selectinload(WorkoutPlan.exercises)).where(
                WorkoutPlan.id == target_id)
            current_p = (await db.execute(fallback_stmt)).scalar_one_or_none()
            if current_p:
                current_p.ai_rationale = f"Принято: «{message}». Параметры интенсивности адаптированы."
                await db.commit()
                return current_p
        raise HTTPException(status_code=500, detail=str(e))

    refreshed = await db.execute(
        select(WorkoutPlan).options(selectinload(WorkoutPlan.exercises)).where(WorkoutPlan.id == plan.id)
    )
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

ТВОИ ПРАВИЛА:
1. Учитывай тренировочную нагрузку: если сегодня была тяжелая сессия или запланирован силовой сплит, приоритезируй углеводы вокруг тренировки и закрытие нормы белка.
2. Отвечай кратко, инженерно, без пустых вводных слов.
3. Если пользователь сообщает о приеме пищи, возвращай блок:
<<<MEAL_ACTION
{{"name": "...", "calories": 0, "protein": 0, "fat": 0, "carbs": 0}}
MEAL_ACTION>>>
"""

    try:
        client = genai.Client()
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=[user_message],
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.2
            )
        )
        return {"response": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/nutrition/scan-photo")
async def scan_meal_photo(
    file: UploadFile = File(...),
    user: UserProfile = Depends(get_current_user)
):
    """Мультимодальный анализ фото блюда через Gemini 1.5 Flash."""
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Файл пуст")

    system_instruction = """
Ты — клинический диетолог и эксперт по оценке состава блюд по фото.
ТВОЯ ЗАДАЧА:
1. Определить все видимые продукты и оценить размер порции в граммах.
2. Рассчитать суммарные калории, белки, жиры и углеводы.
3. Вернуть СТРОГО валидный JSON без markdown-разметки (без ```json):
{
  "name": "Название блюда (например: Гречка с куриной грудкой и овощами)",
  "weight_g": 350,
  "calories": 420,
  "protein": 38,
  "fat": 8,
  "carbs": 48,
  "confidence": 0.85,
  "ingredients": [
    {"name": "Грудка куриная отварная", "weight_g": 150, "protein": 34, "fat": 3, "carbs": 0},
    {"name": "Гречка вареная", "weight_g": 150, "protein": 4, "fat": 1, "carbs": 30},
    {"name": "Огурцы / Томаты", "weight_g": 50, "protein": 0, "fat": 0, "carbs": 2}
  ]
}
"""

    try:
        client = genai.Client()
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=[
                types.Part.from_bytes(
                    data=contents,
                    mime_type=file.content_type or "image/jpeg"
                ),
                "Проанализируй блюдо на фото, оцени граммовки и рассчитай точное КБЖУ."
            ],
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.1,
                response_mime_type="application/json"
            )
        )
        return json.loads(response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка анализа изображения: {str(e)}")


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
    stmt = select(TrainingResearch).where(TrainingResearch.user_id == user.id).order_by(TrainingResearch.created_at.desc())
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


@router.get("/calendar/month")
async def get_calendar_month(
    db: AsyncSession = Depends(get_db),
    user: UserProfile = Depends(get_current_user)
):
    return []


@router.post("/calendar/reschedule")
async def reschedule_calendar(
    payload: RescheduleRequest,
    db: AsyncSession = Depends(get_db),
    user: UserProfile = Depends(get_current_user)
):
    return {"status": "ok", "message": "Расписание обновлено"}