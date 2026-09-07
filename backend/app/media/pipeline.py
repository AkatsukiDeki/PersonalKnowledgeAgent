import os
import uuid
import logging
import asyncio
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional

from sqlalchemy import update, delete, func
from ..db.session import async_session_factory
from ..db.models import Source, Chunk, Claim
from .vocabulary import build_user_vocabulary
from ..media.ffmpeg_service import extract_audio_to_wav
from ..media.transcriber import WhisperSTTService
from ..media.extractor import TranscriptInsightExtractor
from ..knowledge.embeddings.factory import get_embedding_provider
from ..core.config import settings
from ..core.ollama_client import OllamaClient
from ..core.llm import model_manager, TaskType
from ..media.types import MediaType
from ..media.schemas import VoiceStructuredNote

logger = logging.getLogger(__name__)

_stt_service = None


def get_stt_service():
    global _stt_service
    if _stt_service is None:
        _stt_service = WhisperSTTService()
    return _stt_service


def format_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def chunk_segments(segments: List[Dict[str, Any]], max_chars: int = 2500) -> List[Dict[str, Any]]:
    chunks = []
    current_text = []
    current_chars = 0

    if not segments:
        return []

    start_time = segments[0]['start']

    for seg in segments:
        text = seg['text']
        if current_chars + len(text) > max_chars and current_text:
            end_time = seg['start']
            chunks.append({
                "text": " ".join(current_text),
                "start_time": start_time,
                "end_time": end_time,
                "formatted_time": format_time(start_time)
            })
            current_text = [text]
            current_chars = len(text)
            start_time = seg['start']
        else:
            current_text.append(text)
            current_chars += len(text)

    if current_text:
        chunks.append({
            "text": " ".join(current_text),
            "start_time": start_time,
            "end_time": segments[-1]['end'],
            "formatted_time": format_time(start_time)
        })

    return chunks


MEDIA_STRUCTURING_PROMPT = """Ты — педантичный редактор технической транскрипции (Speech-to-Text). Твоя единственная задача — исправить пунктуацию, опечатки распознавания и восстановить профессиональные термины.

СЫРОЙ ТЕКСТ ДЛЯ ИСПРАВЛЕНИЯ:
\"\"\"{raw_text}\"\"\"

СТРОГИЕ ПРАВИЛА:
1. НЕ ПЕРЕСКАЗЫВАЙ, НЕ СОКРАЩАЙ И НЕ ДОБАВЛЯЙ НОВЫХ ФАКТОВ. Сохрани каждое исходное утверждение и мысль спикера.
2. ИСПРАВЛЯЙ IT-ТЕРМИНЫ И НАЗВАНИЯ:
   - Приводи англоязычные термины и жаргонизмы к корректному написанию: 
     (например: "кубернетис" -> Kubernetes, "постгрес" -> PostgreSQL, "докер" -> Docker, "репозиторий", "пайплайн", "коммит", "бэкенд", "эндпоинт", "пул реквест").
3. ПУНКТУАЦИЯ И СТРУКТУРА:
   - Расставь точки, запятые, тире и вопросительные знаки по смыслу пауз и интонаций.
   - Разбей сплошной текст на логические абзацы (по 2-4 предложения).
4. ЯЗЫК: Сохраняй оригинальный язык спикера (не переводи).
5. ФОРМАТ ВЫВОДА: Выведи ИСКЛЮЧИТЕЛЬНО исправленный текст. Категорически запрещены любые приветствия, пояснения, а также обрамление текста в markdown-блоки (```). Текст должен быть чистым.
"""


async def run_media_ingestion_job(
        job_id: str,
        source_id: str,
        file_path: str,
        original_filename: str,
        subject_id: str | None = None,
        profile: str = "speech",
        language: Optional[str] = None,
        fast_mode: bool = True
):
    effective_lang = language.strip().lower() if language and language.strip() and language.strip().lower() != "auto" else "ru"
    logger.info(
        f"[Media Ingestion] Starting job {job_id} for {original_filename} (profile={profile}, lang={effective_lang})")

    input_path = Path(file_path)
    import tempfile
    wav_path = Path(tempfile.gettempdir()) / f"processing_{job_id}.wav"

    try:
        logger.info(f"[Media Ingestion] Extracting audio...")
        await asyncio.to_thread(extract_audio_to_wav, input_path, wav_path)

        is_video = original_filename.lower().endswith((".mp4", ".mkv", ".avi", ".mov", ".webm"))
        processed_slides = []
        slides_storage_dir = Path(f"/app/uploads/slides/{source_id}")

        if is_video:
            logger.info(f"[Media Ingestion] Video detected. Extracting keyframes and running OCR...")
            from .video_extractor import VideoSlideExtractor
            from .ocr_service import SlideOCRService
            slide_extractor = VideoSlideExtractor()
            unique_slides = await asyncio.to_thread(
                slide_extractor.extract_unique_slides,
                video_path=file_path,
                output_dir=slides_storage_dir,
                source_id_str=str(source_id)
            )

            if unique_slides:
                ocr_service = SlideOCRService(lang="ru")
                processed_slides = await asyncio.to_thread(
                    ocr_service.process_slides_batch,
                    slides=unique_slides
                )

        applied_separation = False
        separation_fallback = False
        target_wav_path = wav_path

        if profile == "music":
            logger.warning(f"[Media Ingestion] Profile 'music' requested, but Demucs has been disabled. Proceeding with standard speech processing.")

        # Подтягиваем словарь предметной области для улучшения качества распознавания терминов
        async with async_session_factory() as db:
            effective_prompt = await build_user_vocabulary(db) if effective_lang == "ru" else None

        logger.info(f"[Media Ingestion] Transcribing audio with language={effective_lang}...")
        import time
        t0 = time.time()
        stt = await asyncio.to_thread(get_stt_service)
        segments = await asyncio.to_thread(stt.transcribe, target_wav_path, effective_lang, effective_prompt)
        t1 = time.time()
        latency = t1 - t0

        if not segments:
            logger.warning(f"[Media Ingestion] No speech detected in {original_filename}")
            async with async_session_factory() as db:
                await db.execute(
                    update(Source)
                    .where(Source.id == source_id)
                    .values(status="error", meta_info={"error": "No speech detected"})
                )
                await db.commit()
            return

        logger.info(f"[Media Ingestion] Chunking {len(segments)} segments...")
        chunks = chunk_segments(segments)

        for ch in chunks:
            ch_start = ch["start_time"]
            ch_end = ch["end_time"]
            matched_slides = []
            for s in processed_slides:
                ts = s.get("timestamp_seconds", 0.0)
                if (ch_start - 3.0) <= ts <= (ch_end + 3.0) and s.get("extracted_text"):
                    matched_slides.append(s)

            slide_blocks = []
            for s in matched_slides:
                slide_blocks.append(
                    f"--- [Слайд на экране ({s['formatted_time']})] ---\n"
                    f"{s['extracted_text']}\n"
                )

            ch["has_slides"] = len(matched_slides) > 0
            ch["slide_text"] = "\n".join(slide_blocks) if slide_blocks else ""

        if not fast_mode:
            logger.info(f"[Media Ingestion] Running LLM restructuring for {len(chunks)} chunks...")
            semaphore = asyncio.Semaphore(1)
            ollama = OllamaClient()

            async def process_chunk_safe(i: int, c: dict):
                prompt = MEDIA_STRUCTURING_PROMPT.format(raw_text=c["text"])
                async with semaphore:
                    try:
                        structured_text = None
                        gemini_key = getattr(settings, "GEMINI_API_KEY", None)
                        if gemini_key:
                            try:
                                from google import genai
                                client = genai.Client(api_key=gemini_key)
                                response = await client.aio.models.generate_content(
                                    model="gemini-1.5-flash",
                                    contents=prompt
                                )
                                structured_text = response.text
                            except Exception as ex:
                                logger.warning(f"Gemini failed, fallback to Ollama: {ex}")
                                gemini_key = None
                        
                        if not gemini_key:
                            structured_text = await ollama.generate(
                                model=settings.OLLAMA_QA_MODEL,
                                prompt=prompt,
                                system="Ты педантичный редактор технического текста. Выводи только исправленный текст без комментариев.",
                                num_predict=1024,
                                temperature=0.1
                            )
                        
                        if structured_text and len(structured_text.strip()) > 10:
                            # Очистка от системных артефактов (например, markdown блоков)
                            cleaned = structured_text.strip()
                            if cleaned.startswith("```"):
                                lines = cleaned.split("\n")
                                if len(lines) > 1 and lines[0].startswith("```"):
                                    lines = lines[1:]
                                if len(lines) > 0 and lines[-1].strip().startswith("```"):
                                    lines = lines[:-1]
                                cleaned = "\n".join(lines).strip()
                            
                            if cleaned and len(cleaned) > 10:
                                c["text"] = cleaned
                            else:
                                logger.warning(f"[Media Ingestion] Cleaned text is empty for chunk {i}. Keeping raw text.")
                                c["text"] = c["text"]
                        else:
                            logger.warning(f"[Media Ingestion] LLM returned empty or short response for chunk {i}. Keeping raw text.")
                            c["text"] = c["text"]
                    except Exception as e:
                        logger.warning(f"[Media Ingestion] LLM formatting failed for chunk {i}: {e}. Keeping raw text.")
                        c["text"] = c["text"]

            for i, c in enumerate(chunks):
                await process_chunk_safe(i, c)

        full_text_parts = []
        for c in chunks:
            part = f"[{c['formatted_time']}]\n"
            if c.get("has_slides"):
                part += c["slide_text"] + "\n[Речь спикера]:\n"
            part += c["text"]
            full_text_parts.append(part)
        full_text = "\n\n".join(full_text_parts)
        raw_text_full = "\n".join([seg['text'] for seg in segments])

        insights_dict = {}
        insights_decisions = []
        insights_topics = []

        if not fast_mode:
            logger.info(f"[Media Ingestion] Extracting insights...")
            extractor = TranscriptInsightExtractor()
            insights = await extractor.extract_insights(full_text)
            insights_dict = insights.model_dump()
            insights_decisions = insights.decisions
            insights_topics = insights.key_topics

        logger.info(f"[Media Ingestion] Saving to DB and embedding {len(chunks)} chunks...")
        async with async_session_factory() as db:
            source_obj = await db.get(Source, source_id)
            meta = source_obj.meta_info or {} if source_obj else {}

            transcript_segments = [
                {"start": round(s["start"], 1), "end": round(s["end"], 1), "text": s["text"].strip()}
                for s in segments if s.get("text")
            ]

            transcription_meta = meta.get("transcription", {})
            transcription_meta.update({
                "latency_sec": round(latency, 2),
                "status": "completed",
                "slides_count": len(processed_slides),
                "language": effective_lang
            })
            meta["transcription"] = transcription_meta

            if processed_slides:
                if "media" not in meta:
                    meta["media"] = {}
                meta["media"]["slides"] = [
                    {
                        "slide_index": s["slide_index"],
                        "timestamp_seconds": s["timestamp_seconds"],
                        "formatted_time": s["formatted_time"],
                        "image_url": s["image_url"],
                        "extracted_text": s["extracted_text"]
                    }
                    for s in processed_slides
                ]

            meta.update({
                "applied_separation": applied_separation,
                "separation_fallback": separation_fallback,
                "raw_transcript": raw_text_full,
                "transcript_segments": transcript_segments,
                "insights": insights_dict
            })

            media_type = meta.get("media", {}).get("media_type", "audio")

            if media_type == MediaType.VOICE_NOTE:
                logger.info(f"[Media Ingestion] Structuring Voice Note...")
                struct_prompt = f"Проанализируй эту голосовую заметку и выдели суть:\n\n{raw_text_full}"
                try:
                    structured_note = await model_manager.generate_structured(
                        task_type=TaskType.EXTRACTION,
                        schema=VoiceStructuredNote,
                        prompt=struct_prompt,
                        system_instruction="Ты помощник, который структурирует сырые аудиозаметки."
                    )
                    if structured_note:
                        meta["media"]["structured_note"] = structured_note.model_dump()
                except Exception as e:
                    logger.warning(f"[Media Ingestion] Failed to structure Voice Note: {e}")

            await db.execute(
                update(Source)
                .where(Source.id == source_id)
                .values(
                    content=full_text,
                    raw_content=full_text,
                    meta_info=meta,
                    processing_status="completed",
                    processing_stage="completed",
                    processing_error=None,
                    processing_completed_at=datetime.utcnow()
                )
            )

            provider = get_embedding_provider()
            texts_to_embed = []
            for c in chunks:
                base = f"Источник (Медиа): {original_filename}\n\nТранскрипция:\n[{c['formatted_time']}]\n"
                if c.get("has_slides"):
                    base += f"{c['slide_text']}\n[Речь спикера]:\n"
                base += c['text']
                texts_to_embed.append(base)

            embeddings = await provider.embed_documents(texts_to_embed)

            db_chunks = []
            for idx, (chunk_data, embedding_vector, text_with_timecode) in enumerate(
                    zip(chunks, embeddings, texts_to_embed)):
                chunk_metadata = {
                    "source_type": "audio",
                    "original_filename": original_filename,
                    "start_time": chunk_data["start_time"],
                    "end_time": chunk_data["end_time"],
                    "formatted_time": chunk_data["formatted_time"],
                    "has_slides": chunk_data.get("has_slides", False)
                }

                db_chunk = Chunk(
                    id=uuid.uuid4(),
                    source_id=source_id,
                    chunk_index=idx,
                    text_content=text_with_timecode,
                    embedding=embedding_vector,
                    meta_info=chunk_metadata,
                    metadata_info=chunk_metadata,
                    is_active=True
                )
                db_chunks.append(db_chunk)

            db.add_all(db_chunks)
            await db.flush()

            if media_type in (MediaType.AUDIO, MediaType.VIDEO):
                if insights_decisions or insights_topics:
                    first_chunk_id = db_chunks[0].id if db_chunks else None
                    if first_chunk_id:
                        for decision in insights_decisions:
                            db.add(Claim(
                                source_id=source_id,
                                chunk_id=first_chunk_id,
                                content=decision,
                                claim_type="decision",
                                confidence=0.9,
                                meta_info={"extracted_by": "TranscriptInsightExtractor"}
                            ))
                        for topic in insights_topics:
                            db.add(Claim(
                                source_id=source_id,
                                chunk_id=first_chunk_id,
                                content=topic,
                                claim_type="fact",
                                category="key_topic",
                                confidence=0.9,
                                meta_info={"extracted_by": "TranscriptInsightExtractor"}
                            ))

            await db.commit()

        logger.info(f"[Media Ingestion] Job {job_id} completed successfully.")

    except Exception as e:
        logger.error(f"[Media Ingestion] Job {job_id} failed: {e}", exc_info=True)
        async with async_session_factory() as db:
            await db.execute(
                update(Source)
                .where(Source.id == source_id)
                .values(
                    processing_status="failed",
                    processing_stage="failed",
                    processing_error=str(e),
                    processing_completed_at=datetime.utcnow()
                )
            )
            await db.commit()
        raise e
    finally:
        if wav_path.exists():
            wav_path.unlink()


async def run_retranscribe_job(
        source_id: str,
        file_path: str,
        language: Optional[str] = None,
        initial_prompt: Optional[str] = None,
        profile: str = "speech",
        fast_mode: bool = True
):
    effective_lang = language.strip().lower() if language and language.strip() and language.strip().lower() != "auto" else "ru"
    logger.info(f"[Media Re-Ingestion] Starting job for {source_id} (profile={profile}, lang={effective_lang})")
    input_path = Path(file_path)
    if not input_path.exists():
        logger.error(f"[Media Re-Ingestion] File not found: {file_path}")
        return

    import tempfile
    wav_path = Path(tempfile.gettempdir()) / f"retranscribe_{uuid.uuid4()}.wav"
    try:
        await asyncio.to_thread(extract_audio_to_wav, input_path, wav_path)

        applied_separation = False
        separation_fallback = False
        target_wav_path = wav_path

        if profile == "music":
            logger.warning(f"[Media Re-Ingestion] Profile 'music' requested, but Demucs has been disabled. Proceeding with standard speech processing.")

        async with async_session_factory() as db:
            if initial_prompt and initial_prompt.strip():
                effective_prompt = initial_prompt.strip()
            else:
                effective_prompt = await build_user_vocabulary(db) if effective_lang == "ru" else None

        stt = await asyncio.to_thread(get_stt_service)
        segments = await asyncio.to_thread(stt.transcribe, target_wav_path, effective_lang, effective_prompt)

        if not segments:
            raise ValueError("No speech detected during re-transcription")

        chunks = chunk_segments(segments)

        async with async_session_factory() as db:
            source = await db.get(Source, source_id)
            if not source:
                return

            await db.execute(delete(Claim).where(Claim.source_id == source.id))
            await db.execute(delete(Chunk).where(Chunk.source_id == source.id))
            await db.commit()

        if not fast_mode:
            semaphore = asyncio.Semaphore(1)
            ollama = OllamaClient()

            async def process_chunk_safe(i: int, c: dict):
                prompt = MEDIA_STRUCTURING_PROMPT.format(raw_text=c["text"])
                async with semaphore:
                    try:
                        structured_text = None
                        gemini_key = getattr(settings, "GEMINI_API_KEY", None)
                        if gemini_key:
                            try:
                                from google import genai
                                client = genai.Client(api_key=gemini_key)
                                response = await client.aio.models.generate_content(
                                    model="gemini-1.5-flash",
                                    contents=prompt
                                )
                                structured_text = response.text
                            except Exception as ex:
                                logger.warning(f"Gemini failed, fallback to Ollama: {ex}")
                                gemini_key = None
                        
                        if not gemini_key:
                            structured_text = await ollama.generate(
                                model=settings.OLLAMA_QA_MODEL,
                                prompt=prompt,
                                system="Ты педантичный редактор технического текста. Выводи только исправленный текст без комментариев.",
                                num_predict=1024,
                                temperature=0.1
                            )
                        
                        if structured_text and len(structured_text.strip()) > 10:
                            c["text"] = structured_text.strip()
                    except Exception as e:
                        logger.warning(f"[Media Re-Ingestion] Restructuring failed for chunk {i}: {e}. Keeping raw text.")

            for i, c in enumerate(chunks):
                await process_chunk_safe(i, c)

        full_text = "\n\n".join([f"[{c['formatted_time']}]\n{c['text']}" for c in chunks])
        raw_text_full = "\n".join([seg['text'] for seg in segments])

        insights_dict = {}
        insights_decisions = []
        insights_topics = []

        if not fast_mode:
            extractor = TranscriptInsightExtractor()
            insights = await extractor.extract_insights(full_text)
            insights_dict = insights.model_dump()
            insights_decisions = insights.decisions
            insights_topics = insights.key_topics

        async with async_session_factory() as db:
            source_obj = await db.get(Source, source_id)
            meta = source_obj.meta_info or {} if source_obj else {}

            transcript_segments = [
                {"start": round(s["start"], 1), "end": round(s["end"], 1), "text": s["text"].strip()}
                for s in segments if s.get("text")
            ]

            transcription_meta = meta.get("transcription", {})
            transcription_meta.update({
                "status": "completed",
                "retranscribed_at": datetime.utcnow().isoformat(),
                "processing_profile": profile,
                "language": effective_lang
            })
            meta["transcription"] = transcription_meta

            meta.update({
                "applied_separation": applied_separation,
                "separation_fallback": separation_fallback,
                "raw_transcript": raw_text_full,
                "transcript_segments": transcript_segments,
                "insights": insights_dict,
            })

            await db.execute(
                update(Source)
                .where(Source.id == source_id)
                .values(
                    content=full_text,
                    meta_info=meta,
                    status="completed",
                    error_message=None
                )
            )

            provider = get_embedding_provider()
            texts_to_embed = [f"Транскрипция:\n[{c['formatted_time']}] {c['text']}" for c in chunks]
            embeddings = await provider.embed_documents(texts_to_embed)

            db_chunks = []
            for idx, (chunk_data, embedding_vector) in enumerate(zip(chunks, embeddings)):
                text_with_timecode = f"Транскрипция:\n[{chunk_data['formatted_time']}]\n{chunk_data['text']}"
                chunk_metadata = {
                    "source_type": "audio",
                    "start_time": chunk_data["start_time"],
                    "end_time": chunk_data["end_time"],
                    "formatted_time": chunk_data["formatted_time"]
                }

                db_chunk = Chunk(
                    id=uuid.uuid4(),
                    source_id=source_id,
                    chunk_index=idx,
                    text_content=text_with_timecode,
                    embedding=embedding_vector,
                    meta_info=chunk_metadata,
                    metadata_info=chunk_metadata,
                    is_active=True
                )
                db_chunks.append(db_chunk)

            db.add_all(db_chunks)
            await db.flush()

            if insights_decisions or insights_topics:
                first_chunk_id = db_chunks[0].id if db_chunks else None
                if first_chunk_id:
                    for decision in insights_decisions:
                        db.add(
                            Claim(source_id=source_id, chunk_id=first_chunk_id, content=decision, claim_type="decision",
                                  confidence=0.9))
                    for topic in insights_topics:
                        db.add(Claim(source_id=source_id, chunk_id=first_chunk_id, content=topic, claim_type="fact",
                                     category="key_topic", confidence=0.9))

            await db.commit()
            logger.info(f"[Media Re-Ingestion] Job completed for {source_id}")

    except Exception as e:
        logger.error(f"[Media Re-Ingestion] Failed for {source_id}: {e}", exc_info=True)
        async with async_session_factory() as db:
            await db.execute(
                update(Source)
                .where(Source.id == source_id)
                .values(
                    processing_status="failed",
                    processing_stage="failed",
                    processing_error=str(e),
                    processing_completed_at=datetime.utcnow()
                )
            )
            await db.commit()
        raise e
    finally:
        if wav_path.exists():
            wav_path.unlink()

class MediaPipeline:
    async def process(self, source, session, retranscribe=False, language="ru", enable_demucs=False, fast_mode=True):
        if retranscribe:
            await run_retranscribe_job(str(source.id), source.original_file_path, language=language, profile="music" if enable_demucs else "speech", fast_mode=fast_mode)
        else:
            await run_media_ingestion_job(f"job_{source.id}", str(source.id), source.original_file_path, "upload", profile="music" if enable_demucs else "speech", language=language, fast_mode=fast_mode)
