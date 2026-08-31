from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path
import shutil
import tempfile
import uuid

from ..db.session import get_db
from ..db.models import Source
from ..api.sources import _enrich_source_response, SourceResponse
from ..core.queue import task_queue
from ..media.pipeline import run_media_ingestion_job

router = APIRouter(prefix="/media", tags=["Media"])

@router.post("/upload", response_model=SourceResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_media(
    file: UploadFile = File(...),
    subject_id: str | None = Form(None),
    profile: str = Form("speech"),
    db: AsyncSession = Depends(get_db)
):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in [".mp3", ".wav", ".m4a", ".mp4", ".mkv", ".webm", ".ogg"]:
        raise HTTPException(status_code=400, detail="Unsupported media format")

    job_id = str(uuid.uuid4())
    temp_dir = Path(tempfile.gettempdir()) / "pka_media"
    temp_dir.mkdir(exist_ok=True)
    temp_file_path = temp_dir / f"{job_id}{suffix}"

    with open(temp_file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    source_id = uuid.uuid4()
    new_source = Source(
        id=source_id,
        title=file.filename,
        source_type="audio",
        meta_info={"original_filename": file.filename, "job_id": job_id, "processing_profile": profile},
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
        file_path=str(temp_file_path),
        original_filename=file.filename,
        subject_id=subject_id,
        profile=profile
    )

    return _enrich_source_response(new_source, 0, 0)
