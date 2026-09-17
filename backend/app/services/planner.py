from typing import List, Optional
from app.db.models import WorkoutExercise, AthleteProfile
from app.schemas.kinetics import ExerciseAlternativeItem, ExerciseAlternativeReason

def generate_biomechanical_alternatives(
    target_exercise: WorkoutExercise,
    location: str,
    reason: ExerciseAlternativeReason,
    profile: Optional[AthleteProfile] = None
) -> List[ExerciseAlternativeItem]:
    name_lower = target_exercise.exercise_name.lower()
    is_gym = location.strip().capitalize() == "Зал"
    alternatives: List[ExerciseAlternativeItem] = []

    # 1. Приседания / Выпады (Коленный сустав / Осевая компрессия)
    if "присед" in name_lower or "выпад" in name_lower or "гакк" in name_lower:
        if reason in (ExerciseAlternativeReason.JOINT_PAIN, ExerciseAlternativeReason.NO_AXIAL_LOAD):
            if is_gym:
                alternatives.append(ExerciseAlternativeItem(
                    exercise_name="Жим ногами (высокая постановка стоп)",
                    exercise_type="hypertrophy",
                    sets=target_exercise.sets,
                    reps_or_duration="10-12",
                    rpe_target=max(6, (target_exercise.rpe_target or 7) - 1),
                    target_muscle_groups=["квадрицепс", "ягодицы"],
                    biomechanical_rationale="Спина жестко зафиксирована под 45°, устранена осевая компрессия и снижен сдвигающий вектор на надколенник."
                ))
                alternatives.append(ExerciseAlternativeItem(
                    exercise_name="Разгибания голени сидя в тренажере",
                    exercise_type="isolation",
                    sets=target_exercise.sets,
                    reps_or_duration="12-15",
                    rpe_target=7,
                    target_muscle_groups=["квадрицепс"],
                    biomechanical_rationale="Полная изоляция четырехглавой мышцы бедра без участия позвоночника и тазобедренного сустава."
                ))
            else:
                alternatives.append(ExerciseAlternativeItem(
                    exercise_name="Ягодичный мост с пола на одной ноге",
                    exercise_type="bodyweight",
                    sets=target_exercise.sets,
                    reps_or_duration="12-15",
                    rpe_target=6,
                    target_muscle_groups=["ягодицы", "бицепс бедра"],
                    biomechanical_rationale="Горизонтальный вектор нагрузки, нулевое осевое давление, изолированная проработка тазовой цепи."
                ))

    # 2. Становая тяга / Наклоны (Поясничный отдел)
    elif "тяга" in name_lower and ("станов" in name_lower or "мертв" in name_lower or "румын" in name_lower):
        if is_gym:
            alternatives.append(ExerciseAlternativeItem(
                exercise_name="Сгибания ног лежа в тренажере",
                exercise_type="isolation",
                sets=target_exercise.sets,
                reps_or_duration="10-12",
                rpe_target=7,
                target_muscle_groups=["бицепс бедра"],
                biomechanical_rationale="Прямая нагрузка на хамстринги в коленном сгибании без вовлечения поясничных разгибателей."
            ))
            alternatives.append(ExerciseAlternativeItem(
                exercise_name="Гиперэкстензия 45° с акцентом на ягодицы",
                exercise_type="hypertrophy",
                sets=target_exercise.sets,
                reps_or_duration="12-15",
                rpe_target=7,
                target_muscle_groups=["ягодицы", "бицепс бедра"],
                biomechanical_rationale="Скругленный грудной отдел выключает опасный рычаг в L5-S1, смещая фокус на тазовую цепь."
            ))
        else:
            alternatives.append(ExerciseAlternativeItem(
                exercise_name="Лодочка с паузой в верхней точке",
                exercise_type="bodyweight",
                sets=target_exercise.sets,
                reps_or_duration="15-20",
                rpe_target=6,
                target_muscle_groups=["разгибатели", "ягодицы"],
                biomechanical_rationale="Безопасная статическая активация постуральных мышц спины без отягощения."
            ))

    # 3. Жимы вверх / Плечи (Субакромиальный синдром)
    elif "армейск" in name_lower or "жим стоя" in name_lower or "жим сидя" in name_lower or "махи" in name_lower:
        if is_gym:
            alternatives.append(ExerciseAlternativeItem(
                exercise_name="Жим гантелей нейтральным хватом сидя 75°",
                exercise_type="hypertrophy",
                sets=target_exercise.sets,
                reps_or_duration="10-12",
                rpe_target=7,
                target_muscle_groups=["передняя дельта", "трицепс"],
                biomechanical_rationale="Параллельное положение кистей расширяет подакромиальное пространство и защищает сухожилие надостной мышцы."
            ))
            alternatives.append(ExerciseAlternativeItem(
                exercise_name="Тяга троса к лицу в кроссовере (Face Pull)",
                exercise_type="isolation",
                sets=target_exercise.sets,
                reps_or_duration="12-15",
                rpe_target=7,
                target_muscle_groups=["задняя дельта", "ротаторы плеча"],
                biomechanical_rationale="Укрепляет внешние вращатели плеча и стабилизирует плечелопаточный ритм."
            ))
        else:
            alternatives.append(ExerciseAlternativeItem(
                exercise_name="Y-T-W подъемы рук лежа на животе",
                exercise_type="bodyweight",
                sets=3,
                reps_or_duration="12-15",
                rpe_target=6,
                target_muscle_groups=["лопатки", "задняя дельта"],
                biomechanical_rationale="Изолированная мобилизация нижних фиксаторов лопатки без компрессии суставной капсулы."
            ))

    # 4. Жим лежа / Отжимания (Грудь, плечевой сустав)
    elif "жим" in name_lower or "отжимания" in name_lower:
        if is_gym:
            alternatives.append(ExerciseAlternativeItem(
                exercise_name="Сведение рук в тренажере Бабочка (Pec-Deck)",
                exercise_type="isolation",
                sets=target_exercise.sets,
                reps_or_duration="12-15",
                rpe_target=7,
                target_muscle_groups=["грудь"],
                biomechanical_rationale="Жесткая траектория рукоятей снижает нагрузку на локти и стабилизирует плечи."
            ))
            alternatives.append(ExerciseAlternativeItem(
                exercise_name="Жим гантелей на полу (Floor Press)",
                exercise_type="hypertrophy",
                sets=target_exercise.sets,
                reps_or_duration="8-10",
                rpe_target=7,
                target_muscle_groups=["грудь", "трицепс"],
                biomechanical_rationale="Пол ограничивает опускание локтей, исключая опасное перерастяжение передней капсулы плеча."
            ))
        else:
            alternatives.append(ExerciseAlternativeItem(
                exercise_name="Отжимания от возвышения с нейтральной постановкой кистей",
                exercise_type="bodyweight",
                sets=target_exercise.sets,
                reps_or_duration="12-15",
                rpe_target=6,
                target_muscle_groups=["грудь", "трицепс"],
                biomechanical_rationale="Угол уменьшает процент удерживаемого веса тела и снимает избыточный излом в запястьях."
            ))

    # Универсальный дефолтный фоллбек
    if not alternatives:
        alternatives.append(ExerciseAlternativeItem(
            exercise_name="Изометрическое удержание в упоре / Планка",
            exercise_type="isometric",
            sets=3,
            reps_or_duration="45 сек",
            rpe_target=6,
            target_muscle_groups=target_exercise.target_muscle_groups or ["кор"],
            biomechanical_rationale="Статический безударный аналог для безопасного поддержания метаболического отклика."
        ))

    return alternatives
