from pydantic import BaseModel, Field, ConfigDict, AliasChoices
from typing import List, Optional, Dict, Any
from datetime import datetime, date
import uuid
from enum import Enum


class SegmentData(BaseModel):
    muscle_kg: Optional[float] = None
    muscle_pct: Optional[float] = None
    fat_kg: Optional[float] = None
    fat_pct: Optional[float] = None


class BiometricsLogBase(BaseModel):
    weight: Optional[float] = Field(None, validation_alias=AliasChoices("weight", "weight_kg"))
    weight_kg: Optional[float] = Field(None, validation_alias=AliasChoices("weight_kg", "weight"))
    body_fat_percentage: Optional[float] = Field(None, validation_alias=AliasChoices("body_fat_percentage", "body_fat_pct"))
    body_fat_pct: Optional[float] = Field(None, validation_alias=AliasChoices("body_fat_pct", "body_fat_percentage"))
    fat_mass_kg: Optional[float] = None
    skeletal_muscle_kg: Optional[float] = Field(None, validation_alias=AliasChoices("skeletal_muscle_kg", "muscle_kg"))
    muscle_kg: Optional[float] = Field(None, validation_alias=AliasChoices("muscle_kg", "skeletal_muscle_kg"))
    water_l: Optional[float] = None
    protein_kg: Optional[float] = None
    minerals_kg: Optional[float] = None
    visceral_fat_level: Optional[int] = Field(None, validation_alias=AliasChoices("visceral_fat_level", "visceral_fat"))
    visceral_fat: Optional[int] = Field(None, validation_alias=AliasChoices("visceral_fat", "visceral_fat_level"))
    bmr_kcal: Optional[int] = Field(None, validation_alias=AliasChoices("bmr_kcal", "bmr"))
    bmr: Optional[int] = Field(None, validation_alias=AliasChoices("bmr", "bmr_kcal"))
    bmi: Optional[float] = None

    calories_in: Optional[int] = 0
    tdee: Optional[int] = 0
    protein_g: Optional[int] = None
    sleep_hours: Optional[float] = 8.0
    fatigue_score: Optional[int] = 0
    segment_data: Optional[Dict[str, Any]] = Field(default_factory=dict)
    segment_fat_pct: Optional[Dict[str, Any]] = Field(default_factory=dict)
    notes: Optional[str] = None


class BiometricsLogCreate(BiometricsLogBase):
    pass


class BiometricsLogResponse(BiometricsLogBase):
    id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    timestamp: Optional[datetime] = Field(None, validation_alias=AliasChoices("timestamp", "created_at"))
    created_at: Optional[datetime] = Field(None, validation_alias=AliasChoices("created_at", "timestamp"))

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, extra="ignore")


class WorkoutExerciseBase(BaseModel):
    exercise_name: str
    exercise_type: str = "bodyweight"
    sets: int = 3
    reps_or_duration: str = "10-12"
    rpe: Optional[int] = Field(None, validation_alias=AliasChoices("rpe", "rpe_target"))
    rpe_target: Optional[int] = Field(None, validation_alias=AliasChoices("rpe_target", "rpe"))
    target_muscle_groups: List[str] = Field(default_factory=list)
    is_completed: bool = False
    order_index: int = 0


class WorkoutExerciseCreate(WorkoutExerciseBase):
    pass


class WorkoutExerciseResponse(WorkoutExerciseBase):
    id: uuid.UUID
    workout_id: Optional[uuid.UUID] = Field(None, validation_alias=AliasChoices("workout_id", "plan_id"))
    plan_id: Optional[uuid.UUID] = Field(None, validation_alias=AliasChoices("plan_id", "workout_id"))

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, extra="ignore")


class TrainingLocation(str, Enum):
    HOME = "Дом"
    GYM = "Зал"


class WorkoutPlanBase(BaseModel):
    target_split: Optional[str] = None
    location: Optional[str] = "Дом"
    split_day: Optional[str] = None
    ai_rationale: Optional[str] = None
    status: Optional[str] = "planned"


class WorkoutPlanCreate(WorkoutPlanBase):
    pass


class WorkoutPlanResponse(WorkoutPlanBase):
    id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    created_at: Optional[datetime] = None
    exercises: List[WorkoutExerciseResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, extra="ignore")


class WorkoutGeneratePayload(BaseModel):
    location: TrainingLocation = TrainingLocation.HOME
    split_day: str = "День 1: Функционал"
    target_split: Optional[str] = None

class ExerciseAlternativeReason(str, Enum):
    JOINT_PAIN = "joint_pain"          # Боль / дискомфорт в суставах или связках
    NO_AXIAL_LOAD = "no_axial_load"    # Исключить осевую компрессию позвоночника
    EQUIPMENT_BUSY = "equipment_busy"  # Занят тренажер / нет снаряда
    TOO_INTENSE = "too_intense"        # Слишком тяжело / утомление

class AlternativeRequest(BaseModel):
    reason: ExerciseAlternativeReason = ExerciseAlternativeReason.JOINT_PAIN
    custom_note: Optional[str] = None

class AlternativeResponse(BaseModel):
    original_exercise: str
    alternative_exercise: str
    reason: Optional[str] = None
    target_muscle_groups: Optional[List[str]] = None
    rpe_target: Optional[float] = None

class ExerciseAlternativeItem(BaseModel):
    exercise_name: str
    exercise_type: str = "hypertrophy"
    sets: int = 3
    reps_or_duration: str = "10-12"
    rpe_target: int = 7
    target_muscle_groups: List[str] = Field(default_factory=list)
    biomechanical_rationale: str

class ExerciseSwapPayload(BaseModel):
    exercise_name: str
    exercise_type: str = "hypertrophy"
    sets: int = 3
    reps_or_duration: str = "10-12"
    rpe_target: int = 7
    target_muscle_groups: List[str] = Field(default_factory=list)

class TrainingResearchBase(BaseModel):
    title: str
    source_url: Optional[str] = None
    key_takeaways: str
    tags: List[str] = Field(default_factory=list)

class TrainingResearchCreate(TrainingResearchBase):
    pass

class TrainingResearchResponse(TrainingResearchBase):
    id: uuid.UUID
    pmid: Optional[str] = None
    abstract: Optional[str] = None
    applied_to_protocol: bool = False

    model_config = ConfigDict(from_attributes=True)


class CoachActionItem(BaseModel):
    type: str
    exercise_id: Optional[uuid.UUID] = None
    name: Optional[str] = None
    sets: Optional[int] = None
    reps: Optional[str] = None
    rpe: Optional[int] = None
    targets: List[str] = Field(default_factory=list)

class CoachActionResponse(BaseModel):
    coach_response: str
    actions: List[CoachActionItem] = Field(default_factory=list)

class NutritionIngredient(BaseModel):
    name: str
    weight_g: float
    protein: float
    fat: float
    carbs: float

class NutritionScanResponse(BaseModel):
    name: str
    weight_g: float
    calories: float
    protein: float
    fat: float
    carbs: float
    confidence: float
    ingredients: List[NutritionIngredient] = Field(default_factory=list)

class KineticsChatLogResponse(BaseModel):
    id: uuid.UUID
    module: str
    role: str
    message: str
    log_date: date

    model_config = ConfigDict(from_attributes=True)

class KineticsInsightResponse(BaseModel):
    id: uuid.UUID
    module: str
    period_start: date
    period_end: date
    insight_text: str

    model_config = ConfigDict(from_attributes=True)


class MesocycleGeneratePayload(BaseModel):
    start_date: date
    days_of_week: List[int] = Field(..., description="0=ПН, 1=ВТ, ..., 6=ВС")
    target_split: str = "Push/Pull/Legs"
    location: str = "Дом"
    include_deload: bool = True
    weeks_count: int = 4

class MesocycleExercise(BaseModel):
    name: str
    target_muscle_groups: List[str]
    sets: int
    reps_or_duration: str
    rpe_target: int
    type: str = "hypertrophy"

class MesocycleSession(BaseModel):
    target_split: str
    ai_rationale: str
    exercises: List[MesocycleExercise]

class MesocyclePlan(BaseModel):
    sessions: List[MesocycleSession]


class NutritionMealCreate(BaseModel):
    meal_date: date
    time_str: str = "12:00"
    name: str
    weight_g: float
    calories: float
    protein: float
    fat: float
    carbs: float
    ingredients: List[NutritionIngredient] = Field(default_factory=list)

class NutritionMealResponse(NutritionMealCreate):
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class DailyNutritionSummaryResponse(BaseModel):
    date: date
    total_calories: float
    total_protein: float
    total_fat: float
    total_carbs: float
    meals: List[NutritionMealResponse]

from enum import Enum
class SetType(str, Enum):
    WARMUP = "W"
    NORMAL = "N"
    DROPSET = "D"
    FAILURE = "F"

class WorkoutSetCreate(BaseModel):
    set_number: int
    set_type: SetType = SetType.NORMAL
    weight_kg: float = 0.0
    reps: int = 0
    rpe: Optional[float] = None
    is_completed: bool = False
    previous_weight_kg: Optional[float] = None
    previous_reps: Optional[int] = None

class WorkoutSetUpdate(BaseModel):
    weight_kg: Optional[float] = None
    reps: Optional[int] = None
    rpe: Optional[float] = None
    is_completed: Optional[bool] = None

class WorkoutSetResponse(WorkoutSetCreate):
    id: uuid.UUID
    exercise_id: uuid.UUID

    model_config = ConfigDict(from_attributes=True)


class WorkoutDuplicateRequest(BaseModel):
    target_date: str
    apply_overload: bool = False
    overload_increment_kg: float = 1.25



class OneRMDataPoint(BaseModel):
    date: str
    one_rm_kg: float

class ExerciseOneRM(BaseModel):
    exercise_name: str
    history: List[OneRMDataPoint]

class TonnageDataPoint(BaseModel):
    week_start: str
    muscle_group: str
    tonnage_kg: float

class OverloadAnalyticsResponse(BaseModel):
    one_rm_top_exercises: List[ExerciseOneRM]
    weekly_tonnage: List[TonnageDataPoint]



class BiometricsCreate(BaseModel):
    weight_kg: Optional[float] = None
    sleep_hours: Optional[float] = None
    fatigue_score: Optional[int] = None
    notes: Optional[str] = None

class RecoveryDataPoint(BaseModel):
    date: str
    tonnage_kg: float
    calories: int
    protein_g: int
    sleep_hours: float
    fatigue_score: int
    recovery_score: float

class RecoveryAnalyticsResponse(BaseModel):
    timeline: List[RecoveryDataPoint]
    average_sleep: float
    average_calories: float
    total_tonnage: float
    current_recovery_score: float

