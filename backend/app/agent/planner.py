from typing import List
from app.schemas.kinetics import WorkoutPlanPayload, WorkoutGeneratePayload, TrainingLocation
from app.core.llm import generate_structured_with_retry
from app.knowledge.retrieval import hybrid_search

async def generate_workout_plan(payload: WorkoutGeneratePayload, recent_logs: list, db_session) -> WorkoutPlanPayload:
    # 1. Формируем поисковый запрос в базу знаний
    rag_query = f"{payload.split_day} тренировка {payload.location.value} протокол упражнения прогрессия"
    
    knowledge_context = ""
    try:
        retrieved_chunks = await hybrid_search(
            original_query=rag_query,
            search_query=rag_query,
            db=db_session,
            limit=4
        )
        if retrieved_chunks:
            knowledge_context = "\n---\n".join([c.content for c in retrieved_chunks])
    except Exception as e:
        # Graceful degradation: если RAG недоступен, генерация не падает
        knowledge_context = "Личная база знаний временно недоступна. Используй базовые правила биомеханики."

    # Formulate biometrics context
    context = ""
    for log in recent_logs:
        log_date = log.timestamp or log.created_at
        date_str = log_date.strftime('%Y-%m-%d') if log_date else 'Unknown'
        context += f"Date: {date_str}, Weight: {log.weight}, Calories: {log.calories_in}, Fatigue: {log.fatigue_score}, Sleep: {log.sleep_hours}, Visceral Fat: {log.visceral_fat}\n"

    # 2. Инструкция для LLM с жесткими ограничениями по инвентарю
    equipment_rules = (
        "ДОСТУПНЫЙ ИНВЕНТАРЬ [ДОМ]: исключительно собственный вес, турник, напольные упоры, кистевые эспандеры, степпер, статические фиксации. ЗАПРЕЩЕНЫ тренажеры и тяжелые штанги."
        if payload.location == TrainingLocation.HOME
        else "ДОСТУПНЫЙ ИНВЕНТАРЬ [ЗАЛ]: штанги, силовые рамы, гантельный ряд, грузоблочные тренажеры, кроссоверы."
    )

    system_instruction = f"""Ты — бескомпромиссный спортивный методист и биомеханик.
Твоя задача — сгенерировать адаптивный протокол тренировки на основе телеметрии и базы знаний.

КОНТЕКСТ СЕССИИ:
- Локация: {payload.location.value}
- Целевой день микроцикла: {payload.split_day}
- Ограничения инвентаря: {equipment_rules}

ИЗВЛЕЧЕННЫЕ МАТЕРИАЛЫ ИЗ БАЗЫ ЗНАНИЙ (RAG):
{knowledge_context}

ПРАВИЛА БИОМЕХАНИЧЕСКОГО РЕГУЛИРОВАНИЯ:
1. Опирайся строго на упражнения и методики из базы знаний, если они соответствуют локации.
2. При утомлении ЦНС >= 7 или дефиците калорий < -400 ккал:
   - Исключи взрывную плиометрику и тяжелые осевые компрессии.
   - Снизь суммарный объем рабочих сетов на 25-30%.
3. Выходной формат — строгий JSON по схеме WorkoutPlanPayload.
"""

    prompt = f"""
Target Split: {payload.target_split or payload.split_day}

Recent Biometrics:
{context}

Please generate the optimal workout plan based on the rules and current biometrics.
"""

    llm_payload = await generate_structured_with_retry(
        prompt=prompt,
        schema_cls=WorkoutPlanPayload,
        system=system_instruction
    )
    
    return llm_payload

async def mutate_workout_plan(user_query: str, current_plan: WorkoutPlanPayload) -> WorkoutPlanPayload:
    system_instruction = """You are an elite sports AI coach and physiologist integrated into the Personal Knowledge Agent.
The user is asking to modify their current workout plan based on their feedback.
You must return a valid JSON object matching the WorkoutPlanPayload schema that represents the updated plan.
Maintain the physiological rationale but adjust it to explain why you made the specific changes requested.
"""
    prompt = f"""
Current Plan:
{current_plan.model_dump_json(indent=2)}

User Request: {user_query}

Please generate the updated workout plan.
"""
    payload = await generate_structured_with_retry(
        prompt=prompt,
        schema_cls=WorkoutPlanPayload,
        system=system_instruction
    )
    
    return payload
