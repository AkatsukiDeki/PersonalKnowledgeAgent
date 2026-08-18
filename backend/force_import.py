import asyncio
from sqlalchemy import select
from app.db.session import async_session_factory
from app.db.models import ImportJob
from app.connectors.chats.service import ChatImportService
import json

async def main():
    job_id = "d2db3f8e-ecd5-48be-ba5f-8a3f5e6d2219"
    async with async_session_factory() as db:
        j = await db.get(ImportJob, job_id)
        if not j:
            print("Job not found!")
            return
            
        j.status = 'preview'
        await db.commit()
        
        with open(j.preview_data_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        ext_ids = [p["external_id"] for p in data["previews"]]
        
        print(f"Forcing commit of job {j.id} with {len(ext_ids)} selected IDs.")
        await ChatImportService.commit_job(j.id, "SELECTIVE", ext_ids, db)
        print(f"Job status after retry: {j.status}, error: {j.error_message}")

if __name__ == '__main__':
    asyncio.run(main())
