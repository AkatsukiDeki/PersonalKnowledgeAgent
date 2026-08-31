import uuid
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from .deps import get_db
from ..schemas.learning import LearningRequest, FlashcardResponse, QuizResponse
from ..core.llm import model_manager, TaskType
from ..db.models import Source
import logging

from app.learning.schemas import GenerateRoadmapRequest, AdaptiveRoadmapPayload, GenerateStudyNoteRequest, StudyNoteResponse, GenerateSummaryNoteRequest, SaveAsSubjectRequest, SaveAsSubjectResponse
from app.learning.context_resolver import LearningContextResolver
from app.learning.roadmap_generator import RoadmapGenerator
from app.learning.note_generator import StudyNoteGenerator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/learning", tags=["Learning"])

def clean_cjk_prefix(text: str) -> str:
    if not isinstance(text, str):
        return text
    # Удаляем случайные мета-фразы
    return re.sub(r'^(这是一份|以下是|任务完成).*?[\n:]', '', text).strip()

def get_learning_system_prompt(language: str = "🇷🇺 Русский", extra_instructions: str = "") -> str:
    return f"""You are a precise educational assistant.
IMPORTANT RULES:
1. OUTPUT LANGUAGE: Always respond strictly in {language} (unless the user explicitly asked in English). Never use Chinese or any other language.
2. OUTPUT FORMAT: Respond with ONLY a valid, raw JSON object matching the schema. No markdown backticks, no introductory text, no conversational filler.
{extra_instructions}
"""

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
    
    prompt = f"Сгенерируй {payload.count or 5} флешкарточек (вопрос-ответ) на основе следующего материала:\n\n{context[:20000]}"
    language = payload.language or "🇷🇺 Русский"
    system_instruction = get_learning_system_prompt(
        language, 
        "Ты — опытный методист. Создавай лаконичные, понятные карточки для запоминания. Ответ должен быть точным и коротким."
    )
    
    try:
        result = await model_manager.generate_structured(
            task_type=TaskType.EXTRACTION,
            schema=FlashcardResponse,
            prompt=prompt,
            system_instruction=system_instruction
        )
        if not result:
            raise ValueError("Model returned empty result")
            
        for card in result.cards:
            if not card.id:
                card.id = str(uuid.uuid4())
            card.question = clean_cjk_prefix(card.question)
            card.answer = clean_cjk_prefix(card.answer)
        return result
    except Exception as e:
        logger.exception("Error generating flashcards")
        raise HTTPException(status_code=502, detail=f"Не удалось сгенерировать карточки (ошибка модели или парсинга): {str(e)}")


@router.post("/quiz", response_model=QuizResponse)
async def generate_quiz(payload: LearningRequest, db: AsyncSession = Depends(get_db)):
    context = await _get_context(payload, db)
    
    prompt = f"Сгенерируй тест из {payload.count or 5} вопросов на основе следующего материала:\n\n{context[:20000]}"
    language = payload.language or "🇷🇺 Русский"
    system_instruction = get_learning_system_prompt(
        language, 
        "Ты — строгий экзаменатор. Создавай вопросы с 4 вариантами ответов (один правильный). Обязательно дай развернутое объяснение `explanation` для правильного ответа."
    )
    
    try:
        result = await model_manager.generate_structured(
            task_type=TaskType.EXTRACTION,
            schema=QuizResponse,
            prompt=prompt,
            system_instruction=system_instruction
        )
        if not result:
            raise ValueError("Model returned empty result")
            
        for q in result.questions:
            if not q.id:
                q.id = str(uuid.uuid4())
            q.question = clean_cjk_prefix(q.question)
            q.explanation = clean_cjk_prefix(q.explanation)
        return result
    except Exception as e:
        logger.exception("Error generating quiz")
        raise HTTPException(status_code=502, detail=f"Не удалось сгенерировать тест (ошибка модели или парсинга): {str(e)}")

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


@router.post("/generate-note", response_model=StudyNoteResponse)
async def generate_study_note(
    request: GenerateStudyNoteRequest,
    db: AsyncSession = Depends(get_db)
):
    try:
        generator = StudyNoteGenerator(db)
        note = await generator.generate(request)
        return note
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error generating study note")
        raise HTTPException(status_code=500, detail=str(e))
@router.post("/generate-summary-note", response_model=StudyNoteResponse)
async def generate_summary_note(
    request: GenerateSummaryNoteRequest,
    db: AsyncSession = Depends(get_db)
):
    try:
        generator = StudyNoteGenerator(db)
        note = await generator.generate_summary(request)
        return note
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
