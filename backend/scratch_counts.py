import asyncio
from sqlalchemy import select
from app.db.session import async_session_factory
from app.db.models import ImportJob

async def main():
    job_id = "d2db3f8e-ecd5-48be-ba5f-8a3f5e6d2219"
    async with async_session_factory() as db:
        j = await db.get(ImportJob, job_id)
        print(j.preview_data_path)

if __name__ == '__main__':
    asyncio.run(main())
