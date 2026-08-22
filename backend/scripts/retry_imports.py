import asyncio
from sqlalchemy import select
from app.db.session import async_session_factory
from app.db.models import ImportJob
from app.connectors.chats.service import ChatImportService

async def main():
    async with async_session_factory() as db:
        jobs = (await db.execute(select(ImportJob).where(ImportJob.status == 'failed'))).scalars().all()
        for j in jobs:
            print(f"Retrying Job {j.id}")
            j.status = 'preview'
            await db.commit()
            
            import json
            with open(j.preview_data_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            ext_ids = [p["external_id"] for p in data["previews"]]
            await ChatImportService.commit_job(j.id, "SELECTIVE", ext_ids, db)
            print(f"Job {j.id} status after retry: {j.status}, error: {j.error_message}")

if __name__ == '__main__':
    asyncio.run(main())
