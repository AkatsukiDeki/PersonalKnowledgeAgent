import uuid
import re
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from .deps import get_db
from ..schemas.learning import LearningRequest, FlashcardResponse, QuizResponse
from ..core.llm import model_manager, TaskType
from ..db.models import Source
import logging

from app.learning.schemas import GenerateRoadmapRequest, AdaptiveRoadmapPayload, GenerateStudyNoteRequest, StudyNoteResponse, GenerateSummaryNoteRequest, SaveAsSubjectRequest, SaveAsSubjectResponse, GenerateQuizRequest, QuizPayload, GradeQuizRequest, QuizGradeResult, CopilotChatRequest
from app.learning.context_resolver import LearningContextResolver
from app.learning.roadmap_generator import RoadmapGenerator
from app.learning.note_generator import StudyNoteGenerator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/learning", tags=["Learning"])

from app.learning.practice_generator import PracticeGenerator

async def _get_context(payload: LearningRequest, db: AsyncSession) -> str:
    context = ""
    if payload.source_id:
        src = await db.get(Source, payload.source_id)
        if not src:
            raise HTTPException(404, "Source not found")
        context = f"Source Content:\n{src.content or src.raw_content}"
    elif payload.topic:
        # We could use hybrid_search here, but for simplicity we'll just pass the topic
        context = f"Topic to explore: {payload.topic}"
    else:
        raise HTTPException(400, "Provide source_id or topic")
        
    return context


@router.post("/flashcards", response_model=FlashcardResponse)
async def generate_flashcards(payload: LearningRequest, db: AsyncSession = Depends(get_db)):
    context = await _get_context(payload, db)
    language = payload.language or "🇷🇺 Русский"
    
    try:
        return await PracticeGenerator.generate_flashcards(
            context_text=context,
            count=payload.count or 5,
            language=language,
            difficulty="medium"
        )
    except Exception as e:
        logger.exception("Error generating flashcards")
        raise HTTPException(status_code=502, detail=f"Не удалось сгенерировать карточки (ошибка модели или парсинга): {str(e)}")


@router.post("/quiz", response_model=QuizPayload)
async def generate_quiz(request: GenerateQuizRequest, db: AsyncSession = Depends(get_db)):
    from app.learning.context_resolver import LearningContextResolver
    from app.learning.quiz_generator import QuizGenerator
    
    resolver = LearningContextResolver(db)
    sources, chunks, claims = await resolver.resolve(request.scope)
    
    # Optional filtering by topic/module if we only want partial context
    if request.topic_id and request.roadmap_payload:
        pass # Can be refined later
        
    context = {
        "sources": sources,
        "chunks": chunks,
        "claims": claims
    }
    
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

    score_percentage = (correct_count / total_count) * 100 if total_count > 0 else 0.0

    return QuizGradeResult(
        score_percentage=score_percentage,
        correct_count=correct_count,
        total_count=total_count,
        feedback=feedback
    )

@router.post("/copilot/chat")
async def copilot_chat(request: CopilotChatRequest, db: AsyncSession = Depends(get_db)):
    from app.learning.copilot import NoteCopilot
    copilot = NoteCopilot(db)
    
    return StreamingResponse(
        copilot.stream_chat(request),
        media_type="text/event-stream"
    )

@router.post("/roadmap", response_model=AdaptiveRoadmapPayload)
async def generate_roadmap(
    request: GenerateRoadmapRequest,
    db: AsyncSession = Depends(get_db)
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
    request: GenerateStudyNoteRequest,
    db: AsyncSession = Depends(get_db)
):
    try:
        generator = StudyNoteGenerator(db)
        return StreamingResponse(
            generator.stream_generate(request),
            media_type="text/event-stream"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error generating study note")
        raise HTTPException(status_code=500, detail=str(e))
@router.post("/generate-summary-note")
async def generate_summary_note(
    request: GenerateSummaryNoteRequest,
    db: AsyncSession = Depends(get_db)
):
    try:
        generator = StudyNoteGenerator(db)
        return StreamingResponse(
            generator.stream_generate_summary(request),
            media_type="text/event-stream"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error generating summary study note")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/save-as-subject", response_model=SaveAsSubjectResponse)
async def save_as_subject(
    request: SaveAsSubjectRequest,
    db: AsyncSession = Depends(get_db)
):
    try:
        from app.db.models import Subject, SubjectRoadmap, Source
        
        resolver = LearningContextResolver(db)
        sources, _, _ = await resolver.resolve(request.scope)
        source_ids = [s.id for s in sources]
        
        # Determine title and description
        title = request.roadmap_payload.title
        description = request.roadmap_payload.overview
        
        # Create Subject
        subject = Subject(
            title=title,
            description=description,
            icon="book",
            color_theme="indigo"
        )
        db.add(subject)
        await db.flush() # get subject.id
        
        # Link sources
        if source_ids:
            from app.db.models import subject_sources
            from sqlalchemy import insert
            for sid in source_ids:
                await db.execute(insert(subject_sources).values(subject_id=subject.id, source_id=sid))
            
        # Compile content with notes
        roadmap_content = request.roadmap_payload.model_dump()
        roadmap_content["notes_by_topic"] = {
            k: v.model_dump() for k, v in request.notes_by_topic.items()
        }
            
        roadmap = SubjectRoadmap(
            subject_id=subject.id,
            content=roadmap_content
        )
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
