import asyncio
import hashlib
import uuid
from datetime import datetime
from typing import Dict, List, Any
import os

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import async_session_factory
from ...db.models import Source, Chunk, Claim
from ...knowledge.ingestion import process_source_chunks_bg
from .schemas import ImportJobState, FilePreview, ImportPreview
from .parser import parse_markdown_file, extract_zip_safe
from .resolver import determine_domain_from_tags
import logging
import tempfile
import shutil

logger = logging.getLogger(__name__)

# In-memory job state (for now)
_jobs: Dict[str, ImportJobState] = {}
_jobs_lock = asyncio.Lock()

async def get_job(job_id: str) -> ImportJobState | None:
    async with _jobs_lock:
        return _jobs.get(job_id)

async def set_job(job: ImportJobState):
    async with _jobs_lock:
        _jobs[job.id] = job

def _compute_hash(content: str) -> str:
    return hashlib.sha256(content.encode('utf-8')).hexdigest()

async def generate_preview(zip_path: str, vault_name: str) -> ImportPreview:
    """Generate a preview without saving anything to DB."""
    try:
        temp_dir = tempfile.mkdtemp()
        extracted_files = extract_zip_safe(zip_path, temp_dir)
        
        file_previews = []
        new_files = 0
        modified_files = 0
        unchanged_files = 0
        
        async with async_session_factory() as db:
            # Get existing snapshot
            stmt = select(Source).where(
                Source.source_type == "obsidian",
                Source.metadata_info["vault_name"].astext == vault_name,
                Source.is_deleted == False
            )
            result = await db.execute(stmt)
            existing_sources = {
                s.metadata_info.get("vault_uri"): s 
                for s in result.scalars().all() 
                if s.metadata_info and "vault_uri" in s.metadata_info
            }
            
            existing_uris = set(existing_sources.keys())
            processed_uris = set()
            
            for file_path in extracted_files:
                relative_path = os.path.relpath(file_path, temp_dir).replace("\\", "/")
                vault_uri = f"{vault_name}:{relative_path}"
                processed_uris.add(vault_uri)
                
                content, fm, tags, aliases, wikilinks = parse_markdown_file(file_path)
                content_hash = _compute_hash(content)
                domain = determine_domain_from_tags(tags)
                
                status = "new"
                if vault_uri in existing_sources:
                    old_source = existing_sources[vault_uri]
                    if old_source.metadata_info.get("content_hash") == content_hash:
                        status = "unchanged"
                        unchanged_files += 1
                    else:
                        status = "modified"
                        modified_files += 1
                else:
                    new_files += 1
                    
                file_previews.append(FilePreview(
                    relative_path=relative_path,
                    status=status,
                    tags=tags,
                    domain=domain,
                    size_bytes=len(content.encode('utf-8'))
                ))
                
            # Check for deleted files
            deleted_files = len(existing_uris - processed_uris)
            for deleted_uri in (existing_uris - processed_uris):
                # We could add them to the preview list, but just counting them is fine
                rel_path = deleted_uri.split(":", 1)[1]
                file_previews.append(FilePreview(
                    relative_path=rel_path,
                    status="deleted",
                    tags=[],
                    size_bytes=0
                ))
            
        shutil.rmtree(temp_dir, ignore_errors=True)
        
        return ImportPreview(
            vault_name=vault_name,
            total_files=len(extracted_files),
            new_files=new_files,
            modified_files=modified_files,
            unchanged_files=unchanged_files,
            deleted_files=deleted_files,
            files=file_previews
        )
    except Exception as e:
        logger.error(f"Error generating preview: {e}")
        if 'temp_dir' in locals():
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise

async def process_obsidian_import(job_id: str, zip_path: str, vault_name: str):
    """Background task to run the actual import logic (Diff-Engine)."""
    job = await get_job(job_id)
    if not job:
        return
        
    job.status = "processing"
    await set_job(job)
    
    temp_dir = ""
    try:
        temp_dir = tempfile.mkdtemp()
        extracted_files = extract_zip_safe(zip_path, temp_dir)
        
        async with async_session_factory() as db:
            # 1. Database Snapshot
            stmt = select(Source).where(
                Source.source_type == "obsidian",
                Source.metadata_info["vault_name"].astext == vault_name,
                Source.is_deleted == False
            )
            result = await db.execute(stmt)
            existing_sources = {
                s.metadata_info.get("vault_uri"): s 
                for s in result.scalars().all() 
                if s.metadata_info and "vault_uri" in s.metadata_info
            }
            
            existing_uris = set(existing_sources.keys())
            processed_uris = set()
            
            # Use gather to trigger background ingestion after all DB changes are committed
            sources_to_ingest = []
            
            for file_path in extracted_files:
                job.processed_files += 1
                if job.processed_files % 10 == 0:
                    await set_job(job) # periodic update
                    
                relative_path = os.path.relpath(file_path, temp_dir).replace("\\", "/")
                vault_uri = f"{vault_name}:{relative_path}"
                processed_uris.add(vault_uri)
                
                content, fm, tags, aliases, wikilinks = parse_markdown_file(file_path)
                content_hash = _compute_hash(content)
                domain = determine_domain_from_tags(tags)
                
                title = fm.get('title') or os.path.basename(relative_path).replace('.md', '')
                
                # Update detected domains/tags for stats
                for t in tags:
                    if t not in job.detected_tags:
                        job.detected_tags.append(t)
                if domain and domain not in job.detected_domains:
                    job.detected_domains.append(domain)
                
                metadata_info = {
                    "vault_name": vault_name,
                    "vault_uri": vault_uri,
                    "relative_path": relative_path,
                    "content_hash": content_hash,
                    "tags": tags,
                    "aliases": aliases,
                    "wikilinks": wikilinks
                }
                
                try:
                    if vault_uri in existing_sources:
                        old_source = existing_sources[vault_uri]
                        if old_source.metadata_info.get("content_hash") == content_hash:
                            # UNCHANGED
                            job.skipped_count += 1
                        else:
                            # MODIFIED -> VERSION & RE-INDEX
                            old_source.is_deleted = True
                            
                            # Soft-delete old chunks and claims
                            old_chunks_stmt = select(Chunk).where(Chunk.source_id == old_source.id, Chunk.is_active == True)
                            old_chunks = (await db.execute(old_chunks_stmt)).scalars().all()
                            for c in old_chunks:
                                c.is_active = False
                                
                            old_claims_stmt = select(Claim).where(Claim.source_id == old_source.id, Claim.is_active == True)
                            old_claims = (await db.execute(old_claims_stmt)).scalars().all()
                            for cl in old_claims:
                                cl.is_active = False
                                
                            # Create new source
                            new_source = Source(
                                title=title,
                                content=content,
                                source_type="obsidian",
                                domain=domain,
                                version=old_source.version + 1,
                                superseded_by=old_source.id,
                                raw_content=content,
                                file_type="md",
                                is_deleted=False,
                                metadata_info=metadata_info
                            )
                            db.add(new_source)
                            await db.flush() # get ID
                            sources_to_ingest.append(new_source.id)
                            job.modified_count += 1
                            job.imported_count += 1
                    else:
                        # NEW -> CREATE & INGEST
                        new_source = Source(
                            title=title,
                            content=content,
                            source_type="obsidian",
                            domain=domain,
                            version=1,
                            raw_content=content,
                            file_type="md",
                            is_deleted=False,
                            metadata_info=metadata_info
                        )
                        db.add(new_source)
                        await db.flush() # get ID
                        sources_to_ingest.append(new_source.id)
                        job.imported_count += 1
                        
                except Exception as ex:
                    logger.error(f"Failed to process file {relative_path}: {ex}")
                    job.failed_count += 1
                    job.errors.append(f"{relative_path}: {str(ex)}")

            # DELETED -> SOFT DELETE
            deleted_uris = existing_uris - processed_uris
            for deleted_uri in deleted_uris:
                old_source = existing_sources[deleted_uri]
                old_source.is_deleted = True
                
                # Soft-delete chunks and claims
                old_chunks_stmt = select(Chunk).where(Chunk.source_id == old_source.id, Chunk.is_active == True)
                old_chunks = (await db.execute(old_chunks_stmt)).scalars().all()
                for c in old_chunks:
                    c.is_active = False
                    
                old_claims_stmt = select(Claim).where(Claim.source_id == old_source.id, Claim.is_active == True)
                old_claims = (await db.execute(old_claims_stmt)).scalars().all()
                for cl in old_claims:
                    cl.is_active = False
                    
                job.deleted_count += 1
                
            await db.commit()
            
            # Fire off ingestion tasks
            for src_id in sources_to_ingest:
                asyncio.create_task(process_source_chunks_bg(src_id))
            
    except Exception as e:
        logger.error(f"Obsidian import job {job_id} failed: {e}")
        job.status = "failed"
        job.errors.append(str(e))
    else:
        job.status = "completed"
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
            
        # Clean up zip file
        if os.path.exists(zip_path):
            os.remove(zip_path)
            
        job.completed_at = datetime.utcnow()
        await set_job(job)
        logger.info(f"Obsidian import job {job_id} {job.status}")
