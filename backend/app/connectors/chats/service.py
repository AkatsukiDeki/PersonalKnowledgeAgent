import json
import os
import uuid
import zipfile
import shutil
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app.db.models import ImportJob, Source, Chunk
from app.connectors.chats.chatgpt import ChatGPTParser
from app.connectors.chats.segmenter import TopicSegmenter

PREVIEW_DIR = "/tmp/pka_previews"
os.makedirs(PREVIEW_DIR, exist_ok=True)

class ChatImportService:
    @staticmethod
    async def process_upload(job_id: uuid.UUID, file_path: str, provider: str, db: AsyncSession):
        job = await db.get(ImportJob, job_id)
        if not job:
            return

        try:
            job.status = "processing"
            await db.commit()

            # 1. Unzip if necessary
            target_jsons = []
            temp_dir = f"/tmp/pka_extract_{job_id}"
            
            if file_path.endswith('.zip'):
                os.makedirs(temp_dir, exist_ok=True)
                with zipfile.ZipFile(file_path, 'r') as zip_ref:
                    zip_ref.extractall(temp_dir)
                
                if provider == "gemini":
                    for root, _, files in os.walk(temp_dir):
                        for f in files:
                            if f.endswith(".txt") and "Conversation History" in root:
                                target_jsons.append(os.path.join(root, f))
                            elif f.endswith(".json") and not f.startswith("__MACOSX"):
                                target_jsons.append(os.path.join(root, f))
                else:
                    json_files = []
                    for root, _, files in os.walk(temp_dir):
                        for f in files:
                            if f.endswith(".json") and not f.startswith("__MACOSX"):
                                json_files.append(os.path.join(root, f))
                    
                    if not json_files:
                        raise ValueError("No .json file found in the uploaded archive.")
                        
                    target_json = next((f for f in json_files if os.path.basename(f) == "conversations.json"), None)
                    if not target_json:
                        target_json = max(json_files, key=os.path.getsize)
                    target_jsons = [target_json]
                    
                if not target_jsons:
                    raise ValueError(f"No suitable files found in the uploaded archive for provider {provider}.")
            else:
                target_jsons = [file_path]
            
            if provider == "chatgpt":
                parser = ChatGPTParser()
            elif provider == "claude":
                from app.connectors.chats.claude import ClaudeParser
                parser = ClaudeParser()
            elif provider == "gemini":
                from app.connectors.chats.gemini import GeminiParser
                parser = GeminiParser()
            else:
                parser = None
                
            if not parser:
                raise ValueError(f"Provider {provider} not supported yet")

            segmenter = TopicSegmenter()

            total_convs = 0
            total_topics = 0
            new_convs = 0
            updated_convs = 0
            skipped_convs = 0
            domains = {"personal": 0}
            
            previews = []
            
            for target_json in target_jsons:
                async for conv in parser.parse(target_json):
                    total_convs += 1
                    topics = list(segmenter.segment(conv))
                    total_topics += len(topics)
                    
                    # Check deduplication
                    stmt = select(Source).where(
                        text("metadata_info->>'provider' = :provider AND metadata_info->>'external_id' = :ext_id")
                    ).params(provider=provider, ext_id=conv.external_id)
                    
                    existing = (await db.execute(stmt)).scalars().first()
                    
                    status = "new"
                    if existing:
                        existing_hash = existing.metadata_info.get("conversation_hash")
                        if existing_hash == conv.conversation_hash:
                            status = "skipped"
                            skipped_convs += 1
                        else:
                            status = "updated"
                            updated_convs += 1
                    else:
                        new_convs += 1

                    domains["personal"] += len(topics)

                    previews.append({
                        "external_id": conv.external_id,
                        "title": conv.title,
                        "status": status,
                        "domain": "personal",
                        "topics_count": len(topics),
                        "messages_count": len(conv.messages),
                        "conversation_hash": conv.conversation_hash,
                        "topics_data": [t.model_dump() for t in topics]  # Cache the segmented data
                    })

            summary = {
                "total_conversations": total_convs,
                "total_topics": total_topics,
                "new_conversations": new_convs,
                "updated_conversations": updated_convs,
                "skipped_conversations": skipped_convs,
                "domains": domains
            }

            preview_path = os.path.join(PREVIEW_DIR, f"{job_id}.json")
            with open(preview_path, "w", encoding="utf-8") as f:
                json.dump({"summary": summary, "previews": previews}, f)

            job.status = "preview"
            job.stats = summary
            job.preview_data_path = preview_path
            await db.commit()

            if file_path.endswith('.zip'):
                shutil.rmtree(temp_dir, ignore_errors=True)

        except Exception as e:
            job.status = "failed"
            job.error_message = str(e)
            await db.commit()

    @staticmethod
    async def commit_job(job_id: uuid.UUID, mode: str, selected_ids: list[str], db: AsyncSession):
        job = await db.get(ImportJob, job_id)
        if not job or job.status != "preview":
            return

        job.status = "ingesting"
        await db.commit()
        
        try:
            with open(job.preview_data_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                
            previews = data["previews"]
            
            for p in previews:
                status = p["status"]
                ext_id = p["external_id"]
                
                if mode == "NEW_ONLY" and status != "new":
                    continue
                if mode == "SELECTIVE" and ext_id not in selected_ids:
                    continue
                if status == "skipped":
                    continue
                    
                # DB INGESTION LOGIC
                # Handle UPDATE mode -> soft delete old source / chunks
                if status == "updated":
                    stmt = select(Source).where(
                        text("metadata_info->>'provider' = :provider AND metadata_info->>'external_id' = :ext_id")
                    ).params(provider=job.provider, ext_id=ext_id)
                    existing = (await db.execute(stmt)).scalars().first()
                    if existing:
                        existing.is_deleted = True
                        db.add(existing)
                        
                source = Source(
                    title=p["title"],
                    content="Chat Export",
                    source_type="chat_export",
                    domain=p["domain"],
                    metadata_info={
                        "provider": job.provider,
                        "external_id": ext_id,
                        "conversation_hash": p["conversation_hash"]
                    }
                )
                db.add(source)
                await db.flush()
                
                for idx, t_data in enumerate(p["topics_data"]):
                    chunk = Chunk(
                        source_id=source.id,
                        chunk_index=idx,
                        text_content=t_data["context_text"],
                        metadata_info={
                            "user_claims_candidates": t_data["user_claims_candidates"]
                        }
                    )
                    db.add(chunk)
                    
            await db.commit()
            job.status = "completed"
            job.completed_at = datetime.utcnow()
            await db.commit()
            
            # TODO: Kick off TASK_EXTRACTION for new chunks (only user_claims_candidates)
            
        except Exception as e:
            job.status = "failed"
            job.error_message = str(e)
            await db.commit()
