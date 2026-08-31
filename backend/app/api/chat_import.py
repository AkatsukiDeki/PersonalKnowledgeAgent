import os
import uuid
import json
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from ..db.session import get_db
from ..db.models import ImportJob
from ..schemas.chat_import import (
    ImportJobResponse,
    ImportPreviewResponse,
    CommitImportRequest
)
from ..connectors.chats.service import ChatImportService

router = APIRouter()

@router.post("/import", response_model=ImportJobResponse)
async def start_import(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    provider: str = Form("chatgpt"),
    db: AsyncSession = Depends(get_db)
):
    if provider not in ["chatgpt", "claude", "gemini"]:
        raise HTTPException(status_code=400, detail="Unsupported provider")

    # Save uploaded file with its original extension
    file_id = uuid.uuid4()
    ext = ".zip"
    if file.filename:
        _, file_ext = os.path.splitext(file.filename)
        if file_ext:
            ext = file_ext.lower()
    
    save_path = f"/tmp/pka_upload_{file_id}{ext}"
    
    content = await file.read()
    if len(content) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (limit 100MB)")
        
    with open(save_path, "wb") as f:
        f.write(content)
        
    job = ImportJob(
        id=file_id,
        provider=provider,
        status="pending",
        file_path=save_path
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    
    background_tasks.add_task(ChatImportService.process_upload, job.id, save_path, provider, db)
    
    return ImportJobResponse(
        job_id=job.id,
        status=job.status,
        created_at=job.created_at
    )


@router.get("/import/{job_id}", response_model=dict)
async def get_import_status(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    job = await db.get(ImportJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    return {
        "job_id": job.id,
        "status": job.status,
        "error_message": job.error_message,
        "created_at": job.created_at
    }


@router.get("/import/{job_id}/preview", response_model=ImportPreviewResponse)
async def get_import_preview(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    job = await db.get(ImportJob, job_id)
    if not job or job.status != "preview":
        raise HTTPException(status_code=400, detail="Job is not in preview state")
        
    if not job.preview_data_path or not os.path.exists(job.preview_data_path):
        raise HTTPException(status_code=500, detail="Preview data missing")
        
    with open(job.preview_data_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    return ImportPreviewResponse(
        job_id=job.id,
        summary=data.get("summary", {}),
        conversations_preview=data.get("previews", [])
    )


@router.post("/import/{job_id}/commit", response_model=dict)
async def commit_import(
    job_id: uuid.UUID,
    payload: CommitImportRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    job = await db.get(ImportJob, job_id)
    if not job or job.status != "preview":
        raise HTTPException(status_code=400, detail="Job is not in preview state")
        
    background_tasks.add_task(ChatImportService.commit_job, job.id, payload.mode, payload.selected_external_ids or [], db)
    
    return {
        "job_id": job.id,
        "status": "ingesting",
        "message": "Import execution started in background"
    }
