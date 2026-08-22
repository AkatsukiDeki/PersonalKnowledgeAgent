import uuid
import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel
from sqlalchemy import select, delete, insert, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from ...db.session import get_db
from ...db.models import (
    Subject,
    SubjectRoadmap,
    LearningStat,
    LearningSession,
    Source,
    subject_sources,
    Claim,
    SubjectTutorConversation,
    SubjectTutorMessage,
    SubjectFlashcard,
)
from datetime import datetime, timezone, timedelta
from typing import Tuple
from ...core.ollama_client import OllamaClient

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/subjects", tags=["Subjects"])
ollama_client = OllamaClient()


# ---------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------

class SubjectCreate(BaseModel):
    title: str
    description: Optional[str] = None
    icon: str = "book"
    color_theme: str = "indigo"


class SubjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color_theme: Optional[str] = None
    is_mastered: Optional[bool] = None


class NodeStatusUpdate(BaseModel):
    status: str  # "not_started" | "in_progress" | "completed"


class GeneratePracticeRequest(BaseModel):
    node_id: Optional[str] = None
    topic_title: Optional[str] = None
    difficulty: Optional[str] = "medium"
    count: Optional[int] = 10

    class Config:
        extra = "ignore"


class LearningSessionCreate(BaseModel):
    subject_id: Optional[uuid.UUID] = None
    session_type: str  # "flashcard" | "quiz" | "exam"
    topic_name: str
    score: float
    failed_concepts: List[str] = []


class TutorMessageSend(BaseModel):
    message: str
    topic_context: Optional[str] = None


# ---------------------------------------------------------
# Subject CRUD
# ---------------------------------------------------------

@router.post("", response_model=Dict[str, Any])
async def create_subject(data: SubjectCreate, db: AsyncSession = Depends(get_db)):
    subject = Subject(
        title=data.title,
        description=data.description,
        icon=data.icon,
        color_theme=data.color_theme,
        is_mastered=False,
    )
    db.add(subject)
    await db.commit()
    await db.refresh(subject)
    return {"id": str(subject.id), "title": subject.title, "is_mastered": subject.is_mastered}


@router.get("", response_model=List[Dict[str, Any]])
async def list_subjects(db: AsyncSession = Depends(get_db)):
    stmt = select(Subject).options(
        selectinload(Subject.sources),
        selectinload(Subject.roadmaps),
        selectinload(Subject.stats),
    )
    res = await db.execute(stmt)
    subjects = res.scalars().all()

    return [
        {
            "id": str(s.id),
            "title": s.title,
            "description": s.description,
            "icon": s.icon,
            "color_theme": s.color_theme,
            "mastery_score": s.mastery_score,
            "is_mastered": getattr(s, "is_mastered", False),
            "sources_count": len(s.sources),
            "has_roadmap": len(s.roadmaps) > 0,
            "created_at": s.created_at.isoformat() if hasattr(s, "created_at") and s.created_at else None,
            "updated_at": s.updated_at.isoformat() if hasattr(s, "updated_at") and s.updated_at else None,
        }
        for s in subjects
    ]


@router.get("/{subject_id}")
async def get_subject_detail(subject_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    try:
        stmt = (
            select(Subject)
            .where(Subject.id == subject_id)
            .options(
                selectinload(Subject.sources),
                selectinload(Subject.roadmaps),
            )
        )
        res = await db.execute(stmt)
        subject = res.scalar_one_or_none()
        if not subject:
            raise HTTPException(status_code=404, detail="Предмет не найден")

        # Безопасное получение Roadmap
        roadmap_data = None
        if hasattr(subject, "roadmaps") and subject.roadmaps:
            roadmap_data = subject.roadmaps[0].content

        # Безопасное получение привязанных источников
        sources_list = []
        if hasattr(subject, "sources") and subject.sources:
            sources_list = [
                {
                    "id": str(src.id),
                    "title": getattr(src, "title", "Без названия"),
                    "source_type": getattr(src, "source_type", "document"),
                    "status": getattr(src, "status", "active"),
                    "folder": getattr(src, "folder", None),
                    "meta_info": getattr(src, "meta_info", {}) or {},
                }
                for src in subject.sources
                if not getattr(src, "is_deleted", False)
            ]

        return {
            "id": str(subject.id),
            "title": subject.title,
            "description": subject.description,
            "icon": getattr(subject, "icon", "book"),
            "color_theme": getattr(subject, "color_theme", "indigo"),
            "mastery_score": getattr(subject, "mastery_score", 0.0) or 0.0,
            "is_mastered": getattr(subject, "is_mastered", False) or False,
            "roadmap": roadmap_data,
            "sources": sources_list,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[get_subject_detail error]: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка сервера при загрузке предмета: {str(e)}")


@router.patch("/{subject_id}")
async def update_subject(
    subject_id: uuid.UUID,
    data: SubjectUpdate,
    db: AsyncSession = Depends(get_db),
):
    subject = await db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    update_dict = data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(subject, key, value)

    await db.commit()
    await db.refresh(subject)
    return {"status": "ok", "id": str(subject.id)}


@router.delete("/{subject_id}")
async def delete_subject(subject_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    subject = await db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    await db.delete(subject)
    await db.commit()
    return {"status": "deleted", "id": str(subject_id)}


# ---------------------------------------------------------
# Sources & Materials Endpoints
# ---------------------------------------------------------

@router.get("/{subject_id}/sources")
@router.get("/{subject_id}/materials")
async def get_subject_sources(subject_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    subject = await db.get(Subject, subject_id, options=[selectinload(Subject.sources)])
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Получаем все непривязанные источники
    all_sources_stmt = select(Source).where(Source.is_deleted == False)
    all_res = await db.execute(all_sources_stmt)
    all_sources = all_res.scalars().all()

    attached_ids = {src.id for src in subject.sources if not src.is_deleted}

    return {
        "attached_sources": [
            {
                "id": str(src.id),
                "title": src.title,
                "source_type": src.source_type,
                "status": src.status,
                "folder": getattr(src, "folder", None),
                "meta_info": src.meta_info or {},
            }
            for src in subject.sources
            if not src.is_deleted
        ],
        "available_sources": [
            {
                "id": str(src.id),
                "title": src.title,
                "source_type": src.source_type,
                "status": src.status,
                "folder": getattr(src, "folder", None),
                "meta_info": src.meta_info or {},
            }
            for src in all_sources
            if src.id not in attached_ids
        ],
    }


@router.post("/{subject_id}/sources/{source_id}")
async def attach_source_to_subject(
    subject_id: uuid.UUID,
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(subject_sources).where(
        subject_sources.c.subject_id == subject_id,
        subject_sources.c.source_id == source_id,
    )
    existing = (await db.execute(stmt)).first()
    if not existing:
        ins = insert(subject_sources).values(subject_id=subject_id, source_id=source_id)
        await db.execute(ins)
        await db.commit()
    return {"status": "attached"}


@router.delete("/{subject_id}/sources/{source_id}")
async def detach_source_from_subject(
    subject_id: uuid.UUID,
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    stmt = delete(subject_sources).where(
        subject_sources.c.subject_id == subject_id,
        subject_sources.c.source_id == source_id,
    )
    await db.execute(stmt)
    await db.commit()
    return {"status": "detached"}


# ---------------------------------------------------------
# Roadmap & Practice Endpoints
# ---------------------------------------------------------

@router.post("/{subject_id}/roadmap/generate")
async def generate_subject_roadmap(
    subject_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    subject = await db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    claims_stmt = (
        select(Claim.content)
        .join(Source, Claim.source_id == Source.id)
        .join(subject_sources, subject_sources.c.source_id == Source.id)
        .where(
            subject_sources.c.subject_id == subject_id,
            Claim.is_active == True,
            Source.is_deleted == False,
        )
        .limit(50)
    )
    claims_res = await db.execute(claims_stmt)
    facts = claims_res.scalars().all()
    context_text = "\n".join([f"- {f}" for f in facts]) if facts else f"Фундаментальные концепции предмета {subject.title}"

    prompt = f"""Создай структурированную дорожную карту изучения предмета "{subject.title}".
Материалы и факты:
{context_text}

Верни СТРОГО валидный JSON следующей структуры:
{{
  "modules": [
    {{
      "id": "mod_1",
      "title": "Название модуля",
      "description": "Краткое описание",
      "topics": [
        {{
          "id": "top_1",
          "title": "Название темы",
          "status": "not_started"
        }}
      ]
    }}
  ]
}}"""

    roadmap_content = await ollama_client.generate_json(prompt)
    if not roadmap_content or "modules" not in roadmap_content:
        raise HTTPException(status_code=500, detail="Не удалось сформировать дорожную карту через LLM.")

    rm_stmt = select(SubjectRoadmap).where(SubjectRoadmap.subject_id == subject_id)
    existing_rm = (await db.execute(rm_stmt)).scalar_one_or_none()

    if existing_rm:
        existing_rm.content = roadmap_content
        existing_rm.version += 1
    else:
        new_rm = SubjectRoadmap(subject_id=subject_id, content=roadmap_content, version=1)
        db.add(new_rm)

    await db.commit()
    return {"status": "ok", "roadmap": roadmap_content}


@router.patch("/{subject_id}/roadmap/nodes/{node_id}")
async def update_roadmap_node_status(
    subject_id: uuid.UUID,
    node_id: str,
    data: NodeStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    rm_stmt = select(SubjectRoadmap).where(SubjectRoadmap.subject_id == subject_id)
    rm_res = await db.execute(rm_stmt)
    roadmap_obj = rm_res.scalar_one_or_none()

    if not roadmap_obj or not roadmap_obj.content:
        raise HTTPException(status_code=404, detail="Roadmap not found")

    content = dict(roadmap_obj.content)
    modules = content.get("modules", [])
    updated = False

    for mod in modules:
        for topic in mod.get("topics", []):
            t_id = str(topic.get("id") or topic.get("node_id") or topic.get("topic_id"))
            if t_id == str(node_id) or topic.get("title") == node_id:
                topic["status"] = data.status
                updated = True
                break

    if updated:
        roadmap_obj.content = content
        flag_modified(roadmap_obj, "content")

        all_topics = [t for m in modules for t in m.get("topics", [])]
        completed_count = sum(1 for t in all_topics if t.get("status") == "completed")
        subject = await db.get(Subject, subject_id)
        if subject and all_topics:
            subject.mastery_score = round((completed_count / len(all_topics)) * 100, 1)
            if subject.mastery_score >= 100.0:
                subject.is_mastered = True

        await db.commit()

    return {"status": "ok", "updated": updated}


@router.post("/{subject_id}/quiz/generate")
async def generate_quiz(
    subject_id: uuid.UUID,
    req: Optional[GeneratePracticeRequest] = Body(default=None),
    db: AsyncSession = Depends(get_db),
):
    data = req or GeneratePracticeRequest()
    topic = data.topic_title or "Обзор предмета"
    difficulty = data.difficulty or "medium"
    count = max(3, min(data.count or 10, 50))

    claims_stmt = (
        select(Claim.content)
        .join(Source, Claim.source_id == Source.id)
        .join(subject_sources, subject_sources.c.source_id == Source.id)
        .where(
            subject_sources.c.subject_id == subject_id,
            Claim.is_active == True,
            Source.is_deleted == False,
        )
        .limit(40)
    )
    claims_res = await db.execute(claims_stmt)
    facts = claims_res.scalars().all()
    context_text = "\n".join([f"- {f}" for f in facts]) if facts else f"Базовые факты и концепции по теме: {topic}"

    difficulty_instructions = {
        "easy": "Простые термины и базовый синтаксис.",
        "medium": "Практические сценарии, поиск ошибок, конфигурация.",
        "hard": "Архитектурные вопросы, граничные условия и troubleshooting.",
        "exam": "Сертификационные вопросы высокого уровня сложности.",
    }.get(difficulty, "Средняя сложность.")

    prompt = f"""Сгенерируй тест с вариантами ответов ({count} вопросов) по теме "{topic}".
Материалы:
{context_text}

Сложность: {difficulty} ({difficulty_instructions})

Ответь СТРОГО в формате JSON без markdown:
{{
  "questions": [
    {{
      "id": "q1",
      "question": "Текст вопроса?",
      "options": ["Вариант 1", "Вариант 2", "Вариант 3", "Вариант 4"],
      "correct_answer": 0,
      "explanation": "Подробное объяснение правильного ответа."
    }}
  ]
}}"""

    result = await ollama_client.generate_json(prompt)
    if not result or "questions" not in result:
        raise HTTPException(status_code=500, detail="Не удалось сгенерировать тест через LLM.")
    return result


@router.post("/{subject_id}/flashcards/generate")
async def generate_flashcards(
    subject_id: uuid.UUID,
    req: Optional[GeneratePracticeRequest] = Body(default=None),
    db: AsyncSession = Depends(get_db),
):
    data = req or GeneratePracticeRequest()
    topic = data.topic_title or "Обзор предмета"
    difficulty = data.difficulty or "medium"
    count = max(3, min(data.count or 10, 50))
    node_id = data.node_id

    # 1. Сначала ищем карточки из БД, которые пора повторять
    stmt_due = select(SubjectFlashcard).where(
        SubjectFlashcard.subject_id == subject_id,
        SubjectFlashcard.due_date <= datetime.now(timezone.utc)
    )
    if node_id:
        stmt_due = stmt_due.where(SubjectFlashcard.node_id == node_id)
    
    res_due = await db.execute(stmt_due)
    due_cards = res_due.scalars().all()
    
    # Берем нужное количество из тех, что нужно повторить
    selected_cards = list(due_cards[:count])
    
    # Если не хватает, нужно сгенерировать новые
    if len(selected_cards) < count:
        needed = count - len(selected_cards)
        
        claims_stmt = (
            select(Claim.content)
            .join(Source, Claim.source_id == Source.id)
            .join(subject_sources, subject_sources.c.source_id == Source.id)
            .where(
                subject_sources.c.subject_id == subject_id,
                Claim.is_active == True,
                Source.is_deleted == False,
            )
            .limit(40)
        )
        claims_res = await db.execute(claims_stmt)
        facts = claims_res.scalars().all()
        context_text = "\n".join([f"- {f}" for f in facts]) if facts else f"Ключевые понятия по теме: {topic}"

        prompt = f"""Сгенерируй {needed} карточек для запоминания по теме "{topic}".
Материалы:
{context_text}

Сложность: {difficulty}

Ответь СТРОГО в формате JSON:
{{
  "flashcards": [
    {{
      "front": "Термин или вопрос",
      "back": "Лаконичное объяснение",
      "hint": "Подсказка"
    }}
  ]
}}"""
        result = await ollama_client.generate_json(prompt)
        if result and "flashcards" in result:
            new_cards = []
            for fc in result["flashcards"]:
                new_card = SubjectFlashcard(
                    subject_id=subject_id,
                    node_id=node_id,
                    front=fc.get("front", ""),
                    back=fc.get("back", ""),
                    hint=fc.get("hint", "")
                )
                db.add(new_card)
                new_cards.append(new_card)
            
            await db.commit()
            for c in new_cards:
                await db.refresh(c)
            selected_cards.extend(new_cards)
    
    return {
        "flashcards": [
            {
                "id": str(c.id),
                "front": c.front,
                "back": c.back,
                "hint": c.hint
            }
            for c in selected_cards
        ]
    }

def calculate_sm2(quality: int, repetitions: int, interval: int, ease_factor: float) -> Tuple[int, int, float]:
    new_ef = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    new_ef = max(1.3, new_ef)
    if quality < 3:
        new_repetitions = 0
        new_interval = 1
    else:
        if repetitions == 0:
            new_interval = 1
        elif repetitions == 1:
            new_interval = 6
        else:
            new_interval = int(round(interval * new_ef))
        new_repetitions = repetitions + 1
    return new_repetitions, new_interval, round(new_ef, 2)

class FlashcardReviewRequest(BaseModel):
    quality: int  # 0-5

@router.post("/{subject_id}/flashcards/{card_id}/review")
async def review_flashcard(
    subject_id: uuid.UUID,
    card_id: uuid.UUID,
    req: FlashcardReviewRequest,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(SubjectFlashcard).where(
        SubjectFlashcard.id == card_id,
        SubjectFlashcard.subject_id == subject_id
    )
    res = await db.execute(stmt)
    card = res.scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Карточка не найдена")
        
    new_rep, new_int, new_ef = calculate_sm2(
        req.quality, card.repetitions, card.interval, card.ease_factor
    )
    
    card.repetitions = new_rep
    card.interval = new_int
    card.ease_factor = new_ef
    card.last_reviewed_at = datetime.now(timezone.utc)
    card.due_date = card.last_reviewed_at + timedelta(days=new_int)
    
    await db.commit()
    return {"status": "ok", "next_due": card.due_date.isoformat()}

@router.get("/{subject_id}/reports/weak-spots")
async def get_weak_spots_report(subject_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    stmt = select(Subject).where(Subject.id == subject_id)
    res = await db.execute(stmt)
    subject = res.scalar_one_or_none()
    if not subject:
        raise HTTPException(404, "Subject not found")
        
    sessions_stmt = select(LearningSession).where(LearningSession.subject_id == subject_id)
    sessions_res = await db.execute(sessions_stmt)
    sessions = sessions_res.scalars().all()
    
    concept_counts = {}
    for s in sessions:
        for c in s.failed_concepts:
            concept_counts[c] = concept_counts.get(c, 0) + 1
            
    top_concepts = sorted(concept_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    
    report_lines = [
        f"# Шпаргалка перед экзаменом: {subject.title}",
        f"**Текущий балл освоения:** {int(subject.mastery_score * 100)}%",
        "",
        "## Концепции, вызвавшие наибольшие затруднения",
        ""
    ]
    
    for concept, count in top_concepts:
        report_lines.append(f"### {concept} (Ошибок: {count})")
        c_stmt = (
            select(Claim.content)
            .join(Source, Claim.source_id == Source.id)
            .join(subject_sources, subject_sources.c.source_id == Source.id)
            .where(
                subject_sources.c.subject_id == subject_id,
                Claim.is_active == True,
                Claim.content.ilike(f"%{concept}%")
            ).limit(3)
        )
        c_res = await db.execute(c_stmt)
        facts = c_res.scalars().all()
        if facts:
            for f in facts:
                report_lines.append(f"- {f}")
        else:
            report_lines.append("- *Требуется повторение материала по данной теме.*")
        report_lines.append("")
        
    if not top_concepts:
        report_lines.append("*Ошибок не найдено! Вы отлично справляетесь.*")
        
    return {"markdown": "\\n".join(report_lines)}


@router.post("/{subject_id}/exam/generate")
async def generate_exam(subject_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    exam_req = GeneratePracticeRequest(
        node_id=None,
        topic_title="Комплексный экзамен по предмету",
        difficulty="exam",
        count=15,
    )
    return await generate_quiz(subject_id, exam_req, db)


# ---------------------------------------------------------
# Learning Sessions & Statistics
# ---------------------------------------------------------

@router.post("/sessions")
async def record_session(
    data: LearningSessionCreate,
    db: AsyncSession = Depends(get_db),
):
    session = LearningSession(
        subject_id=data.subject_id,
        session_type=data.session_type,
        topic_name=data.topic_name,
        score=data.score,
        failed_concepts=data.failed_concepts,
    )
    db.add(session)

    if data.subject_id:
        rm_stmt = select(SubjectRoadmap).where(SubjectRoadmap.subject_id == data.subject_id)
        rm_res = await db.execute(rm_stmt)
        roadmap_obj = rm_res.scalar_one_or_none()

        if roadmap_obj and roadmap_obj.content:
            content = dict(roadmap_obj.content)
            modules = content.get("modules", [])
            new_status = "completed" if data.score >= 70.0 else "in_progress"
            updated = False

            for mod in modules:
                for topic in mod.get("topics", []):
                    t_id = str(topic.get("id") or topic.get("node_id") or topic.get("topic_id"))
                    if t_id == str(data.topic_name) or topic.get("title") == data.topic_name:
                        topic["status"] = new_status
                        updated = True
                        break

            if updated:
                roadmap_obj.content = content
                flag_modified(roadmap_obj, "content")

                all_topics = [t for m in modules for t in m.get("topics", [])]
                completed_count = sum(1 for t in all_topics if t.get("status") == "completed")
                subject = await db.get(Subject, data.subject_id)
                if subject and all_topics:
                    subject.mastery_score = round((completed_count / len(all_topics)) * 100, 1)
                    if data.session_type == "exam" and data.score >= 85.0:
                        subject.is_mastered = True

    await db.commit()
    return {"status": "ok", "session_id": str(session.id)}


from datetime import datetime, timedelta

@router.get("/{subject_id}/stats")
async def get_subject_stats(
    subject_id: uuid.UUID,
    timeframe: str = "season_3m",  # '7d' | '30d' | 'season_3m' | 'all'
    db: AsyncSession = Depends(get_db),
):
    subject = await db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    # 1. Временной диапазон для общей аналитики
    from datetime import timezone
    now = datetime.now(timezone.utc)
    since_date: Optional[datetime] = None

    if timeframe == "7d":
        since_date = now - timedelta(days=7)
    elif timeframe == "30d":
        since_date = now - timedelta(days=30)
    elif timeframe == "season_3m":
        since_date = now - timedelta(days=90)

    # 2. Выборка всех сессий для расчета активности и стрика
    all_sessions_stmt = (
        select(LearningSession)
        .where(LearningSession.subject_id == subject_id)
        .order_by(LearningSession.created_at.asc())
    )
    all_res = await db.execute(all_sessions_stmt)
    all_sessions = all_res.scalars().all()

    # Сетка активности по дням: "YYYY-MM-DD" -> count
    activity_map: Dict[str, int] = {}
    for s in all_sessions:
        if s.created_at:
            day_str = s.created_at.strftime("%Y-%m-%d")
            activity_map[day_str] = activity_map.get(day_str, 0) + 1

    # Подсчет текущего стрика (непрерывные дни активности)
    current_streak = 0
    # Преобразуем now в локальную дату (или просто забираем date())
    check_day = now.date()
    # Если сегодня еще не занимались, проверяем со вчерашнего дня
    if check_day.strftime("%Y-%m-%d") not in activity_map:
        check_day -= timedelta(days=1)

    while check_day.strftime("%Y-%m-%d") in activity_map:
        current_streak += 1
        check_day -= timedelta(days=1)

    # 3. Фильтрация сессий под выбранный timeframe
    filtered_sessions = []
    for s in all_sessions:
        if not since_date:
            filtered_sessions.append(s)
        elif s.created_at:
            # Убедимся, что s.created_at aware, чтобы не было ошибки при сравнении
            s_created = s.created_at
            if s_created.tzinfo is None:
                s_created = s_created.replace(tzinfo=timezone.utc)
            if s_created >= since_date:
                filtered_sessions.append(s)

    total_sessions = len(filtered_sessions)
    quiz_sessions = [s for s in filtered_sessions if s.session_type == "quiz"]
    flashcard_sessions = [s for s in filtered_sessions if s.session_type == "flashcard"]
    exam_sessions = [s for s in filtered_sessions if s.session_type == "exam"]

    avg_score = round(sum(s.score for s in filtered_sessions) / total_sessions, 1) if total_sessions > 0 else 0.0

    # 4. Анализ слабых мест
    failed_map: Dict[str, int] = {}
    for s in filtered_sessions:
        if s.failed_concepts:
            for concept in s.failed_concepts:
                failed_map[concept] = failed_map.get(concept, 0) + 1

    weak_spots = sorted(
        [{"concept": k, "count": v} for k, v in failed_map.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:5]

    return {
        "timeframe": timeframe,
        "since_date": since_date.strftime("%Y-%m-%d") if since_date else None,
        "mastery_score": subject.mastery_score,
        "is_mastered": subject.is_mastered,
        "total_sessions": total_sessions,
        "avg_score": avg_score,
        "current_streak": current_streak,
        "quiz_count": len(quiz_sessions),
        "flashcard_count": len(flashcard_sessions),
        "exam_count": len(exam_sessions),
        "activity_map": activity_map,
        "weak_spots": weak_spots,
        "recent_sessions": [
            {
                "id": str(s.id),
                "session_type": s.session_type,
                "topic_name": s.topic_name,
                "score": s.score,
                "created_at": s.created_at.strftime("%d.%m.%Y %H:%M") if s.created_at else "—",
            }
            for s in reversed(filtered_sessions[-10:])
        ],
    }


# ---------------------------------------------------------
# Persistent Smart Tutor Endpoints
# ---------------------------------------------------------

@router.get("/{subject_id}/tutor/messages")
async def get_tutor_history(subject_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    subject = await db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Ищем диалог тьютора по предмету
    conv_stmt = (
        select(SubjectTutorConversation)
        .where(SubjectTutorConversation.subject_id == subject_id)
        .options(selectinload(SubjectTutorConversation.messages))
    )
    conv_res = await db.execute(conv_stmt)
    conv = conv_res.scalar_one_or_none()

    if not conv:
        return {"messages": []}

    return {
        "messages": [
            {
                "id": str(m.id),
                "role": m.role,
                "content": m.content,
                "created_at": m.created_at.isoformat() if hasattr(m, "created_at") and m.created_at else None,
            }
            for m in conv.messages
        ]
    }


import traceback

@router.post("/{subject_id}/tutor/messages")
async def send_tutor_message(
    subject_id: uuid.UUID,
    data: TutorMessageSend,
    db: AsyncSession = Depends(get_db),
):
    try:
        subject = await db.get(Subject, subject_id)
        if not subject:
            raise HTTPException(status_code=404, detail="Предмет не найден")

        # 1. Поиск или создание беседы
        conv_stmt = (
            select(SubjectTutorConversation)
            .where(SubjectTutorConversation.subject_id == subject_id)
            .options(selectinload(SubjectTutorConversation.messages))
        )
        conv_res = await db.execute(conv_stmt)
        conv = conv_res.scalar_one_or_none()

        if not conv:
            conv = SubjectTutorConversation(subject_id=subject_id)
            db.add(conv)
            await db.commit()
            await db.refresh(conv)

        # 2. Сохраняем сообщение пользователя
        next_seq = len(conv.messages) + 1 if conv.messages else 1
        user_msg = SubjectTutorMessage(
            conversation_id=conv.id,
            role="user",
            content=data.message,
            sequence_num=next_seq,
        )
        db.add(user_msg)
        await db.commit()
        await db.refresh(conv)  # Обновляем, чтобы assistant_msg получил актуальный sequence_num

        # 3. Сбор контекста из фактов
        claims_stmt = (
            select(Claim.content)
            .join(Source, Claim.source_id == Source.id)
            .join(subject_sources, subject_sources.c.source_id == Source.id)
            .where(
                subject_sources.c.subject_id == subject_id,
                Claim.is_active == True,
                Source.is_deleted == False,
            )
            .limit(30)
        )
        claims_res = await db.execute(claims_stmt)
        facts = claims_res.scalars().all()
        context_text = "\n".join([f"- {f}" for f in facts]) if facts else "Базовые концепции курса."

        # 4. Формирование промпта
        socratic_system = (
            f"Ты — дружелюбный преподаватель и AI-тьютор по предмету '{subject.title}'. "
            f"Отвечай кратко, понятно, задавай наводящие вопросы. "
            f"ВАЖНОЕ ПРАВИЛО: Всегда отвечай только на русском языке. Никогда не используй китайский или другие языки. "
            f"Факты курса:\n{context_text}"
        )
        if data.topic_context:
            socratic_system += f"\nТекущая тема: {data.topic_context}"

        # 5. Вызов Ollama
        ai_reply = await ollama_client.generate(
            prompt=data.message,
            system=socratic_system,
        )

        if not ai_reply:
            ai_reply = "Не удалось сгенерировать ответ. Попробуйте сформулировать вопрос иначе."

        # 6. Сохраняем ответ ассистента
        assistant_seq = len(conv.messages) + 1 if conv.messages else 2
        assistant_msg = SubjectTutorMessage(
            conversation_id=conv.id,
            role="assistant",
            content=ai_reply.strip(),
            sequence_num=assistant_seq,
        )
        db.add(assistant_msg)
        await db.commit()

        return {
            "reply": ai_reply.strip(),
            "user_message_id": str(user_msg.id),
            "assistant_message_id": str(assistant_msg.id),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Tutor Error]: {e}\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка генерации ответа Тьютора: {str(e)}"
        )


@router.delete("/{subject_id}/tutor/messages")
async def reset_tutor_history(subject_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    conv_stmt = select(SubjectTutorConversation).where(SubjectTutorConversation.subject_id == subject_id)
    conv_res = await db.execute(conv_stmt)
    conv = conv_res.scalar_one_or_none()

    if conv:
        await db.delete(conv)
        await db.commit()

    return {"status": "cleared"}
