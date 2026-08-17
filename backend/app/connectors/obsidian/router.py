import uuid
import os
import shutil
import tempfile
from datetime import datetime
from fastapi import APIRouter, File, UploadFile, BackgroundTasks, HTTPException, status, Form

from .schemas import ImportPreview, ImportJobState
from .service import generate_preview, process_obsidian_import, get_job, set_job
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/obsidian", tags=["Connectors", "Obsidian"])


@router.post("/preview", response_model=ImportPreview)
async def preview_import(
    file: UploadFile = File(...),
    vault_name: str = Form(...)
):
    """Generate a preview of the import diff without applying changes."""
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Only ZIP files are supported.")
        
    temp_fd, temp_path = tempfile.mkstemp(suffix=".zip")
    try:
        with os.fdopen(temp_fd, 'wb') as f:
            shutil.copyfileobj(file.file, f)
            
        preview = await generate_preview(temp_path, vault_name)
        return preview
    except Exception as e:
        logger.error(f"Failed to generate preview: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@router.post("/import", response_model=ImportJobState)
async def start_import(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    vault_name: str = Form(...)
):
    """Start the asynchronous import process."""
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Only ZIP files are supported.")
        
    job_id = str(uuid.uuid4())
    
    # Save uploaded file temporarily
    temp_fd, temp_path = tempfile.mkstemp(suffix=".zip")
    with os.fdopen(temp_fd, 'wb') as f:
        shutil.copyfileobj(file.file, f)
        
    # Get total files roughly
    import zipfile
    with zipfile.ZipFile(temp_path, 'r') as zf:
        total_files = sum(1 for info in zf.infolist() if info.filename.endswith('.md') and not info.is_dir())
        
    # Initialize job state
    job = ImportJobState(
        id=job_id,
        status="pending",
        vault_name=vault_name,
        total_files=total_files,
        created_at=datetime.utcnow()
    )
    
    await set_job(job)
    
    # Start background task
    background_tasks.add_task(process_obsidian_import, job_id, temp_path, vault_name)
    
    return job


@router.get("/import/{job_id}", response_model=ImportJobState)
async def get_import_status(job_id: str):
    """Check the status of an ongoing import job."""
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Import job not found.")
    return job
