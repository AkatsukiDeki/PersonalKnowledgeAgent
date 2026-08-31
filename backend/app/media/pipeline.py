import os
import uuid
import logging
import asyncio
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any

from ..db.session import async_session_factory
from ..db.models import Source, Chunk, Claim
from sqlalchemy import update, func
from ..media.ffmpeg_service import extract_audio_to_wav
from ..media.transcriber import WhisperSTTService
from ..media.separator import AudioSeparatorService
from ..media.extractor import TranscriptInsightExtractor
from ..knowledge.embeddings.factory import get_embedding_provider
from ..core.config import settings
from ..core.ollama_client import OllamaClient
from ..core.llm import model_manager, TaskType
from ..media.types import MediaType
from ..media.schemas import VoiceStructuredNote

logger = logging.getLogger(__name__)

# Singleton for the transcriber to keep model loaded if needed, or instantiate per job.
# We instantiate per job here to free memory after if necessary, or we can keep it global.
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
    start_time = 0.0
    
    if not segments:
        return []
        
    start_time = segments[0]['start']
    
    for seg in segments:
        text = seg['text']
        if current_chars + len(text) > max_chars and current_text:
            # Finalize chunk
            end_time = seg['start'] # End of previous segment
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

async def run_media_ingestion_job(
    job_id: str,
    source_id: str,
    file_path: str,
    original_filename: str,
    subject_id: str | None = None,
    profile: str = "speech"
):
    logger.info(f"[Media Ingestion] Starting job {job_id} for {original_filename}")
    
    input_path = Path(file_path)
    import tempfile
    wav_path = Path(tempfile.gettempdir()) / f"processing_{job_id}.wav"
    
    try:
        # 1. Extract audio
        logger.info(f"[Media Ingestion] Extracting audio...")
        await asyncio.to_thread(extract_audio_to_wav, input_path, wav_path)
        
        applied_separation = False
        separation_fallback = False
        target_wav_path = wav_path
        
        if profile == "music":
            temp_dir = wav_path.parent / "demucs_out"
            logger.info(f"[Media Ingestion] Running Demucs separation...")
            separated_path = await asyncio.to_thread(
                AudioSeparatorService.extract_vocals, 
                wav_path, 
                temp_dir
            )
            applied_separation = True
            if separated_path == wav_path:
                separation_fallback = True
            else:
                target_wav_path = separated_path
        
        # 2. Transcribe
        logger.info(f"[Media Ingestion] Transcribing audio...")
        import time
        t0 = time.time()
        stt = await asyncio.to_thread(get_stt_service)
        segments = await asyncio.to_thread(stt.transcribe, target_wav_path)
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
            
        # 3. Chunking
        logger.info(f"[Media Ingestion] Chunking {len(segments)} segments...")
        chunks = chunk_segments(segments)
        
        # 3.5 LLM Post-Processing per chunk
        ollama = OllamaClient()
        MEDIA_STRUCTURING_PROMPT = """Ты — аккуратный редактор транскрипций аудио. Твоя задача — очистить распознанный текст от фонетических опечаток STT, исправить пунктуацию и разбить на смысловые абзацы.

Сырой распознанный текст:
\"\"\"{raw_text}\"\"\"

ПРАВИЛА ОБРАБОТКИ:
1. Сохрани оригинальный смысл и стиль речи, но исправь явные фонетические ошибки (например, когда STT неправильно расслышал слова из-за невнятной речи).
2. ОФОРМЛЕНИЕ:
   - Разбей текст на абзацы для удобства чтения.
   - Не добавляй никаких музыкальных тегов (Куплет, Припев и т.д.), если это не песня.
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО сочинять свои строки или дублировать текст.

Выведи только готовый отформатированный текст без лишних комментариев."""

        logger.info(f"[Media Ingestion] Running LLM restructuring for {len(chunks)} chunks...")
        
        concurrency = int(os.getenv("PKA_LLM_MAX_CONCURRENCY", 3))
        semaphore = asyncio.Semaphore(concurrency)

        async def process_chunk_safe(i: int, c: dict):
            prompt = MEDIA_STRUCTURING_PROMPT.format(raw_text=c["text"])
            async with semaphore:
                try:
                    structured_text = await ollama.generate(
                        model=settings.OLLAMA_QA_MODEL,
                        prompt=prompt,
                        system="Ты педантичный редактор текста. Отвечай только переработанным текстом."
                    )
                    if structured_text and len(structured_text) > 10:
                        c["text"] = structured_text.strip()
                except Exception as e:
                    logger.warning(f"[Media Ingestion] LLM formatting failed for chunk {i}: {e}")

        await asyncio.gather(*(process_chunk_safe(i, c) for i, c in enumerate(chunks)))
        
        # Full text for the source
        full_text = "\n\n".join([f"[{c['formatted_time']}]\n{c['text']}" for c in chunks])
        raw_text_full = "\n".join([seg['text'] for seg in segments])
        
        # 3.8 Extract Insights
        logger.info(f"[Media Ingestion] Extracting insights...")
        extractor = TranscriptInsightExtractor()
        insights = await extractor.extract_insights(full_text)
        insights_dict = insights.model_dump()
        
        # 4. Ingest to DB
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
                "status": "completed"
            })
            meta["transcription"] = transcription_meta
            
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
                    meta_info=meta,
                    status="completed",
                    error_message=None,
                    completed_at=datetime.utcnow()
                )
            )
            
            # Embed chunks
            provider = get_embedding_provider()
            texts_to_embed = [f"Источник (Медиа): {original_filename}\n\nТранскрипция:\n[{c['formatted_time']}] {c['text']}" for c in chunks]
            embeddings = await provider.embed_documents(texts_to_embed)
            
            db_chunks = []
            for idx, (chunk_data, embedding_vector) in enumerate(zip(chunks, embeddings)):
                
                # Include timecode and context in the text content so LLM sees it directly
                text_with_timecode = f"Источник (Медиа): {original_filename}\n\nТранскрипция:\n[{chunk_data['formatted_time']}]\n{chunk_data['text']}"
                
                chunk_metadata = {
                    "source_type": "audio",
                    "original_filename": original_filename,
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
                    tsv=func.to_tsvector("russian", text_with_timecode),
                    meta_info=chunk_metadata,
                    metadata_info=chunk_metadata,
                    is_active=True
                )
                db_chunks.append(db_chunk)
                
            db.add_all(db_chunks)
            await db.flush() # Ensure chunks have IDs

            # Add Claims mapped from Insights only for AUDIO/VIDEO
            if media_type in (MediaType.AUDIO, MediaType.VIDEO):
                if insights.decisions or insights.key_topics:
                    first_chunk_id = db_chunks[0].id if db_chunks else None
                    if first_chunk_id:
                        for decision in insights.decisions:
                            claim = Claim(
                                source_id=source_id,
                                chunk_id=first_chunk_id,
                                content=decision,
                                claim_type="decision",
                                confidence=0.9,
                                meta_info={"extracted_by": "TranscriptInsightExtractor"}
                            )
                            db.add(claim)
                        for topic in insights.key_topics:
                            claim = Claim(
                                source_id=source_id,
                                chunk_id=first_chunk_id,
                                content=topic,
                                claim_type="fact",
                                category="key_topic",
                                confidence=0.9,
                                meta_info={"extracted_by": "TranscriptInsightExtractor"}
                            )
                            db.add(claim)

            await db.commit()
            
        logger.info(f"[Media Ingestion] Job {job_id} completed successfully.")
        
    except Exception as e:
        logger.error(f"[Media Ingestion] Job {job_id} failed: {e}", exc_info=True)
        async with async_session_factory() as db:
            await db.execute(
                update(Source)
                .where(Source.id == source_id)
                .values(status="error", error_message=str(e))
            )
            await db.commit()
    finally:
        # 5. Cleanup temporary wav file (keep original input_path)
        if wav_path.exists():
            wav_path.unlink()

from sqlalchemy import delete

async def run_retranscribe_job(
    source_id: str,
    file_path: str,
    language: str = "ru",
    initial_prompt: str | None = None
):
    logger.info(f"[Media Re-Ingestion] Starting job for {source_id}")
    input_path = Path(file_path)
    if not input_path.exists():
        logger.error(f"[Media Re-Ingestion] File not found: {file_path}")
        return
        
    import tempfile
    import uuid
    wav_path = Path(tempfile.gettempdir()) / f"retranscribe_{uuid.uuid4()}.wav"
    try:
        if not wav_path.exists():
            await asyncio.to_thread(extract_audio_to_wav, input_path, wav_path)
            
        stt = await asyncio.to_thread(get_stt_service)
        segments = await asyncio.to_thread(stt.transcribe, wav_path, language, initial_prompt)
        
        if not segments:
            raise ValueError("No speech detected during re-transcription")
            
        chunks = chunk_segments(segments)
        
        # 2. SUCCESS! Atomically clean old data
        async with async_session_factory() as db:
            source = await db.get(Source, source_id)
            if not source:
                return
                
            await db.execute(delete(Claim).where(Claim.source_id == source.id))
            await db.execute(delete(Chunk).where(Chunk.source_id == source.id))
            await db.commit()
            
        # 3. LLM Restructuring
        ollama = OllamaClient()
        MEDIA_STRUCTURING_PROMPT = """Ты — редактор транскрипций аудио. Твоя задача — очистить распознанный текст от фонетических опечаток STT и оформить его.

Сырой распознанный текст:
\"\"\"{raw_text}\"\"\"

ПРАВИЛА ОБРАБОТКИ:
1. Восстанови исходные слова по контексту и созвучию.
2. ОФОРМЛЕНИЕ: Оформи абзацами, не сочиняй лишнего. Выведи только готовый текст."""
        concurrency = int(os.getenv("PKA_LLM_MAX_CONCURRENCY", 3))
        semaphore = asyncio.Semaphore(concurrency)

        async def process_chunk_safe(i: int, c: dict):
            prompt = MEDIA_STRUCTURING_PROMPT.format(raw_text=c["text"])
            async with semaphore:
                try:
                    structured_text = await ollama.generate(
                        model=settings.OLLAMA_QA_MODEL,
                        prompt=prompt,
                        system="Ты педантичный редактор текста. Отвечай только переработанным текстом."
                    )
                    if structured_text and len(structured_text) > 10:
                        c["text"] = structured_text.strip()
                except Exception as e:
                    pass

        await asyncio.gather(*(process_chunk_safe(i, c) for i, c in enumerate(chunks)))
        
        full_text = "\n\n".join([f"[{c['formatted_time']}]\n{c['text']}" for c in chunks])
        raw_text_full = "\n".join([seg['text'] for seg in segments])
        
        extractor = TranscriptInsightExtractor()
        insights = await extractor.extract_insights(full_text)
        insights_dict = insights.model_dump()
        
        # 4. Ingest new chunks/claims
        async with async_session_factory() as db:
            # We already deleted old chunks, so we just update the source and add new ones
            meta = source.meta_info or {}
            
            transcript_segments = [
                {"start": round(s["start"], 1), "end": round(s["end"], 1), "text": s["text"].strip()}
                for s in segments if s.get("text")
            ]
            
            transcription_meta = meta.get("transcription", {})
            transcription_meta.update({
                "status": "completed",
                "retranscribed_at": datetime.utcnow().isoformat()
            })
            meta["transcription"] = transcription_meta
            
            meta.update({
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
                    tsv=func.to_tsvector("russian", text_with_timecode),
                    meta_info=chunk_metadata,
                    metadata_info=chunk_metadata,
                    is_active=True
                )
                db_chunks.append(db_chunk)
                
            db.add_all(db_chunks)
            await db.flush()
            
            if insights.decisions or insights.key_topics:
                first_chunk_id = db_chunks[0].id if db_chunks else None
                if first_chunk_id:
                    for decision in insights.decisions:
                        db.add(Claim(source_id=source_id, chunk_id=first_chunk_id, content=decision, claim_type="decision", confidence=0.9))
                    for topic in insights.key_topics:
                        db.add(Claim(source_id=source_id, chunk_id=first_chunk_id, content=topic, claim_type="fact", category="key_topic", confidence=0.9))
            
            await db.commit()
            logger.info(f"[Media Re-Ingestion] Job completed for {source_id}")
            
    except Exception as e:
        logger.error(f"[Media Re-Ingestion] Failed for {source_id}: {e}")
        async with async_session_factory() as db:
            await db.execute(update(Source).where(Source.id == source_id).values(status="error", error_message=str(e)))
            await db.commit()
    finally:
        if wav_path.exists():
            wav_path.unlink()
