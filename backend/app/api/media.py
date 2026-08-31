from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, status, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path
import shutil
import tempfile
import uuid
from typing import Optional

from ..db.session import get_db
from ..db.models import Source
from ..api.sources import _enrich_source_response, SourceResponse
from ..core.queue import task_queue
from ..media.pipeline import run_media_ingestion_job, run_retranscribe_job
from ..schemas.media import RetranscribeRequest
from ..media.classifier import detect_media_type
import os
import mimetypes

router = APIRouter(prefix="/media", tags=["Media"])

@router.post("/upload", response_model=SourceResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_media(
    file: UploadFile = File(...),
    subject_id: str | None = Form(None),
    profile: str = Form("speech"),
    media_type: str | None = Form(None),
    db: AsyncSession = Depends(get_db)
):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in [".mp3", ".wav", ".m4a", ".mp4", ".mkv", ".webm", ".ogg", ".aac", ".m4b", ".oga", ".flac", ".opus", ".avi", ".mov"]:
        raise HTTPException(status_code=400, detail="Unsupported media format")

    job_id = str(uuid.uuid4())
    source_id = uuid.uuid4()
    
    detected_type = detect_media_type(
        filename=file.filename or "recording.m4a",
        content_type=file.content_type,
        override=media_type,
    )
    
    # Save original file persistently
    upload_dir = Path("/app/uploads/media")
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    # Create safe filename
    safe_filename = "".join([c if c.isalnum() or c in " .-_" else "_" for c in file.filename])
    storage_path = upload_dir / f"{source_id}_{safe_filename}"
    
    with open(storage_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    meta_info = {
        "media": {
            "media_type": detected_type.value,
            "original_filename": file.filename,
            "mime_type": file.content_type or "audio/mpeg",
            "storage_path": str(storage_path),
            "transcript_segments": [],
            "structured_note": None,
            "smart_chapters": []
        },
        "transcription": {
            "job_id": job_id,
            "processing_profile": profile,
            "status": "pending"
        }
    }

    new_source = Source(
        id=source_id,
        title=file.filename,
        source_type="audio",
        meta_info=meta_info,
        original_file_path=str(storage_path),
        status="processing"
    )
    db.add(new_source)
    await db.commit()
    await db.refresh(new_source)

    # Queue the job directly using the function and its arguments
    task_queue.enqueue(
        run_media_ingestion_job,
        job_id=job_id,
        source_id=str(source_id),
        file_path=str(storage_path),
        original_filename=file.filename,
        subject_id=subject_id,
        profile=profile
    )

    return _enrich_source_response(new_source, 0, 0)

@router.post("/{source_id}/retranscribe", status_code=status.HTTP_202_ACCEPTED)
async def retranscribe_media(
    source_id: uuid.UUID,
    payload: Optional[RetranscribeRequest] = None,
    db: AsyncSession = Depends(get_db)
):
    source = await db.get(Source, source_id)
    if not source or source.source_type != "audio":
        raise HTTPException(status_code=404, detail="Media source not found")
        
    meta = source.meta_info or {}
    storage_path = meta.get("media", {}).get("storage_path")
    raw_path = storage_path or source.original_file_path
    
    if not raw_path:
        raise HTTPException(
            status_code=404, 
            detail="Source does not have an associated file path"
        )

    # Проверяем абсолютный путь или fallback относительно /app
    resolved_path = Path(raw_path)
    if not resolved_path.is_absolute():
        resolved_path = Path("/app") / resolved_path

    if not resolved_path.exists():
        raise HTTPException(
            status_code=404, 
            detail=f"Original media file is missing on disk: {resolved_path}. Re-upload required for legacy files."
        )

    req = payload or RetranscribeRequest()
    
    source.status = "processing"
    if "transcription" in meta:
        meta["transcription"]["status"] = "processing"
        source.meta_info = meta
        
    await db.commit()

    task_queue.enqueue(
        run_retranscribe_job,
        source_id=str(source.id),
        file_path=str(resolved_path),
        language=req.language,
        initial_prompt=req.initial_prompt
    )
    
    return {
        "status": "success",
        "source_id": str(source.id),
        "message": "Media retranscription queued"
    }

@router.get("/{source_id}/stream")
async def stream_media(source_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)):
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Media source not found")
        
    meta = source.meta_info or {}
    storage_path = meta.get("media", {}).get("storage_path")
    original_path = storage_path or source.original_file_path
    
    if not original_path or not os.path.exists(original_path):
        raise HTTPException(status_code=404, detail="Media file not found on disk")
        
    file_size = os.path.getsize(original_path)
    mime_type = meta.get("media", {}).get("mime_type") or mimetypes.guess_type(original_path)[0] or "application/octet-stream"
    
    range_header = request.headers.get("range")
    
    if not range_header:
        def file_iterator():
            with open(original_path, "rb") as f:
                while chunk := f.read(65536):
                    yield chunk
        return StreamingResponse(
            file_iterator(), 
            media_type=mime_type, 
            headers={"Accept-Ranges": "bytes", "Content-Length": str(file_size)}
        )
        
    try:
        byte_range = range_header.replace("bytes=", "").split("-")
        start = int(byte_range[0])
        end = int(byte_range[1]) if len(byte_range) > 1 and byte_range[1] else file_size - 1
    except ValueError:
        raise HTTPException(status_code=416, detail="Requested Range Not Satisfiable")
        
    if start >= file_size or end >= file_size:
        return Response(
            status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
            headers={"Content-Range": f"bytes */{file_size}"}
        )
        
    chunk_size = (end - start) + 1
    
    def range_file_iterator():
        with open(original_path, "rb") as f:
            f.seek(start)
            bytes_to_read = chunk_size
            while bytes_to_read > 0:
                read_size = min(65536, bytes_to_read)
                data = f.read(read_size)
                if not data:
                    break
                yield data
                bytes_to_read -= len(data)
                
    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(chunk_size),
    }
    
    return StreamingResponse(
        range_file_iterator(),
        status_code=status.HTTP_206_PARTIAL_CONTENT,
        media_type=mime_type,
        headers=headers
    )
