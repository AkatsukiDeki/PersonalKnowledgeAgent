import logging
import re
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.llm import TaskType, model_manager
from ..db.models import ConceptMastery, Source
from ..learning.context_resolver import LearningContextResolver
from ..learning.note_generator import StudyNoteGenerator
from ..learning.practice_generator import PracticeGenerator
from ..learning.roadmap_generator import RoadmapGenerator
from ..learning.schemas import (
    AdaptiveRoadmapPayload,
    AdaptiveSessionRequest,
    CopilotChatRequest,
    GenerateQuizRequest,
    GenerateRoadmapRequest,
    GenerateStudyNoteRequest,
    GenerateSummaryNoteRequest,
    GradeQuizRequest,
    LearningScope,
    QuizGradeResult,
    QuizPayload,
    SaveAsSubjectRequest,
    SaveAsSubjectResponse,
    StudyNoteResponse,
)
from ..schemas.learning import FlashcardResponse, LearningRequest, QuizResponse
from .deps import get_db
from .endpoints.planner import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/learning", tags=["Learning"])


async def _get_context(payload: LearningRequest, db: AsyncSession) -> str:
  context = ""
  if payload.source_id:
    src = await db.get(Source, payload.source_id)
    if not src:
      raise HTTPException(404, "Source not found")
    context = f"Source Content:\n{src.content or src.raw_content}"
  elif payload.topic:
    context = f"Topic to explore: {payload.topic}"
  else:
    raise HTTPException(400, "Provide source_id or topic")

  return context


@router.post("/flashcards", response_model=FlashcardResponse)
async def generate_flashcards(
    payload: GenerateQuizRequest, db: AsyncSession = Depends(get_db)
):
  resolver = LearningContextResolver(db)
  sources, claims, chunks = await resolver.resolve(payload.scope)

  context_text = "\n".join([c.text_content for c in chunks])[:15000]
  if not context_text:
    context_text = "\n".join([(s.content or s.raw_content or "") for s in sources])[
        :15000
    ]

  if not context_text:
    raise HTTPException(
        status_code=400,
        detail=(
            "Не найдено содержимого для генерации карточек в выбранной папке"
        ),
    )

  language = "🇷🇺 Русский"

  try:
    return await PracticeGenerator.generate_flashcards(
        context_text=context_text,
        count=payload.question_count or 5,
        language=language,
        difficulty=payload.difficulty or "medium",
    )
  except Exception as e:
    logger.exception("Error generating flashcards")
    raise HTTPException(
        status_code=502,
        detail=(
            "Не удалось сгенерировать карточки (ошибка модели или парсинга):"
            f" {str(e)}"
        ),
    )


@router.post("/quiz", response_model=QuizPayload)
async def generate_quiz(
    request: GenerateQuizRequest, db: AsyncSession = Depends(get_db)
):
  from ..learning.quiz_generator import QuizGenerator

  resolver = LearningContextResolver(db)
  sources, claims, chunks = await resolver.resolve(request.scope)

  if request.topic_id and request.roadmap_payload:
    pass

  context = {"sources": sources, "chunks": chunks, "claims": claims}

  generator = QuizGenerator(db)
  try:
    quiz = await generator.generate(request, context)
    return quiz
  except Exception as e:
    logger.error(f"Error generating quiz: {e}")
    raise HTTPException(status_code=500, detail=str(e))


@router.post("/quiz/grade", response_model=QuizGradeResult)
async def grade_quiz(request: GradeQuizRequest):
  correct_count = 0
  total_count = len(request.quiz.questions)
  feedback = {}

  for q in request.quiz.questions:
    user_sel = set(request.user_answers.get(q.id, []))
    correct_sel = {opt.id for opt in q.options if opt.is_correct}

    is_correct = user_sel == correct_sel
    if is_correct:
      correct_count += 1
      feedback[q.id] = f"Верно! {q.explanation}"
    else:
      feedback[q.id] = f"Ошибка. {q.explanation}"

  score_percentage = (
      (correct_count / total_count) * 100 if total_count > 0 else 0.0
  )

  return QuizGradeResult(
      score_percentage=score_percentage,
      correct_count=correct_count,
      total_count=total_count,
      feedback=feedback,
  )


@router.post("/copilot/chat")
async def copilot_chat(
    request: CopilotChatRequest, db: AsyncSession = Depends(get_db)
):
  from ..learning.copilot import NoteCopilot

  copilot = NoteCopilot(db)

  return StreamingResponse(
      copilot.stream_chat(request), media_type="text/event-stream"
  )


@router.post("/roadmap", response_model=AdaptiveRoadmapPayload)
async def generate_roadmap(
    request: GenerateRoadmapRequest, db: AsyncSession = Depends(get_db)
):
  try:
    resolver = LearningContextResolver(db)
    sources, claims, chunks = await resolver.resolve(request.scope)

    generator = RoadmapGenerator()
    payload = await generator.generate(request, sources, claims, chunks)
    return payload
  except HTTPException:
    raise
  except Exception as e:
    logger.exception("Error generating roadmap")
    raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-note")
async def generate_study_note(
    request: GenerateStudyNoteRequest, db: AsyncSession = Depends(get_db)
):
  try:
    generator = StudyNoteGenerator(db)
    return StreamingResponse(
        generator.stream_generate(request), media_type="text/event-stream"
    )
  except HTTPException:
    raise
  except Exception as e:
    logger.exception("Error generating study note")
    raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-summary-note")
async def generate_summary_note(
    request: GenerateSummaryNoteRequest, db: AsyncSession = Depends(get_db)
):
  try:
    generator = StudyNoteGenerator(db)
    return StreamingResponse(
        generator.stream_generate_summary(request),
        media_type="text/event-stream",
    )
  except HTTPException:
    raise
  except Exception as e:
    logger.exception("Error generating summary study note")
    raise HTTPException(status_code=500, detail=str(e))


@router.post("/save-as-subject", response_model=SaveAsSubjectResponse)
async def save_as_subject(
    request: SaveAsSubjectRequest, db: AsyncSession = Depends(get_db)
):
  try:
    from sqlalchemy import insert

    from ..db.models import Source, Subject, SubjectRoadmap, subject_sources

    resolver = LearningContextResolver(db)
    sources, _, _ = await resolver.resolve(request.scope)
    source_ids = [s.id for s in sources]

    title = request.roadmap_payload.title
    description = request.roadmap_payload.overview

    subject = Subject(
        title=title,
        description=description,
        icon="book",
        color_theme="indigo",
    )
    db.add(subject)
    await db.flush()

    if source_ids:
      for sid in source_ids:
        await db.execute(
            insert(subject_sources).values(
                subject_id=subject.id, source_id=sid
            )
        )

    roadmap_content = request.roadmap_payload.model_dump()
    roadmap_content["notes_by_topic"] = {
        k: v.model_dump() for k, v in request.notes_by_topic.items()
    }

    roadmap = SubjectRoadmap(subject_id=subject.id, content=roadmap_content)
    db.add(roadmap)

    await db.commit()
    return SaveAsSubjectResponse(subject_id=str(subject.id))
  except HTTPException:
    await db.rollback()
    raise
  except Exception as e:
    await db.rollback()
    logger.exception("Error saving as subject")
    raise HTTPException(status_code=500, detail=str(e))


@router.post("/adaptive/session")
async def generate_adaptive_session(
    request: AdaptiveSessionRequest, 
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user)
):
  from datetime import datetime, timezone
  from sqlalchemy.sql import func
  from ..db.models import Source, subject_sources, Subject

  subject = await db.get(Subject, request.subject_id)
  subject_title = subject.title if subject else "Выбранная дисциплина"

  now = datetime.now(timezone.utc)

  due_stmt = (
      select(ConceptMastery)
      .where(
          ConceptMastery.subject_id == request.subject_id,
          ConceptMastery.next_review_due <= now,
      )
      .order_by(ConceptMastery.next_review_due.asc())
      .limit(5)
  )

  weak_stmt = (
      select(ConceptMastery)
      .where(
          ConceptMastery.subject_id == request.subject_id,
          ConceptMastery.mastery_level < 0.4,
      )
      .order_by(ConceptMastery.mastery_level.asc())
      .limit(3)
  )

  due_result = await db.execute(due_stmt)
  due_concepts = due_result.scalars().all()

  weak_result = await db.execute(weak_stmt)
  weak_concepts = weak_result.scalars().all()

  focus_topics = list({c.topic_name for c in due_concepts + weak_concepts})

  if not focus_topics:
    focus_topics_str = "любые ключевые темы по предмету"
  else:
    focus_topics_str = ", ".join(focus_topics)

  sources_stmt = (
      select(Source)
      .join(subject_sources)
      .where(subject_sources.c.subject_id == request.subject_id)
  )
  sources_result = await db.execute(sources_stmt)
  sources = sources_result.scalars().all()

  context_text = "\n".join(
      [(s.content or s.raw_content or "") for s in sources]
  )[:15000]

  # Phase 2: CNS Adaptive logic
  from ..db.models import DailyReadiness
  from datetime import date
  cns_result = await db.execute(
      select(DailyReadiness).where(
          DailyReadiness.user_id == user.id,
          DailyReadiness.date == date.today(),
          DailyReadiness.is_baseline == True
      ).order_by(DailyReadiness.created_at.desc())
  )
  daily_readiness = cns_result.scalars().first()
  cns_score = daily_readiness.cns_score if daily_readiness else 8.0

  if cns_score <= 4.0:
      adaptive_instruction = (
          f"ВАЖНО (РЕЖИМ LIGHT REVIEW - ЦНС ПЕРЕГРУЖЕНА): Это адаптивная сессия по предмету «{subject_title}». "
          f"Фокусируйся ТОЛЬКО на простом закреплении известных тем ({focus_topics_str}). "
          f"НЕ ДАВАЙ новых или слишком сложных концептов. Формулировки должны быть простыми."
      )
  else:
      adaptive_instruction = (
          f"ВАЖНО (ЦНС={cns_score}): Это адаптивная сессия по предмету «{subject_title}». Удели особое внимание следующим темам: {focus_topics_str}. "
          f"Генерируй вопросы/карточки именно по этим концептам, основываясь на переданных материалах (sources/chunks)."
      )

  try:
    if request.mode == "flashcards":
      return await PracticeGenerator.generate_flashcards(
          context_text=context_text,
          count=request.question_count,
          language="🇷🇺 Русский",
          difficulty="adaptive",
          extra_instruction=adaptive_instruction,
      )
    else:
      from ..learning.quiz_generator import QuizGenerator

      generator = QuizGenerator(db)

      quiz_req = GenerateQuizRequest(
          scope=LearningScope(),
          topic_title=f"Адаптивная сессия (Фокус: {focus_topics_str})",
          question_count=request.question_count,
      )
      context = {
          "sources": sources,
          "chunks": [],
          "claims": [],
          "extra_instruction": adaptive_instruction,
      }
      quiz = await generator.generate(quiz_req, context)
      return quiz
  except Exception as e:
    logger.exception("Error generating adaptive session")
    raise HTTPException(status_code=500, detail=str(e))


class RecordAttemptRequest(BaseModel):
  subject_id: uuid.UUID
  topic_name: str
  is_correct: bool
  node_id: Optional[str] = None
  response_time_ms: Optional[int] = None
  item_type: str = "quiz"


@router.post("/attempt")
async def record_learning_attempt(
    data: RecordAttemptRequest, 
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user)
):
  from ..learning.mastery import MasteryService

  mastery = await MasteryService.record_attempt(
      db=db,
      user_id=user.id,
      subject_id=data.subject_id,
      topic_name=data.topic_name,
      is_correct=data.is_correct,
      node_id=data.node_id,
      response_time_ms=data.response_time_ms,
      item_type=data.item_type,
  )
  return mastery


@router.get("/subjects/{subject_id}/mastery")
async def get_subject_mastery(
    subject_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
  stmt = select(ConceptMastery).where(ConceptMastery.subject_id == subject_id)
  result = await db.execute(stmt)
  mastery_records = result.scalars().all()

  return [
      {
          "topic_name": m.topic_name,
          "node_id": m.node_id,
          "mastery_level": (
              round(m.mastery_level, 2) if m.mastery_level is not None else 0.0
          ),
          "total_attempts": m.total_attempts,
          "successful_attempts": m.successful_attempts,
          "next_review_due": (
              m.next_review_due.isoformat() if m.next_review_due else None
          ),
      }
      for m in mastery_records
  ]