import asyncio
import os
import hashlib
from app.db.session import async_session_factory
from app.db.models import Source
from app.knowledge.ingestion import process_source_chunks_bg

# Папка с вашими 6 файлами .md
FILES_DIR = r"C:\Users\Andrey\PycharmProjects\PKA\devops_notes"

async def main():
    async with async_session_factory() as db:
        for fname in os.listdir(FILES_DIR):
            if not fname.endswith(".md"):
                continue
            path = os.path.join(FILES_DIR, fname)
            with open(path, "r", encoding="utf-8") as f:
                text = f.read()
            
            title = fname.replace(".md", "")
            source = Source(
                title=title,
                content=text,
                domain="study", # или "programming"
                source_kind="manual",
                content_hash=hashlib.sha256(text.encode("utf-8")).hexdigest(),
                metadata_info={"filename": fname}
            )
            db.add(source)
            await db.commit()
            await db.refresh(source)
            print(f"Uploaded: {title}")
            
            # Запуск нарезки и векторизации
            await process_source_chunks_bg(source.id)
            print(f"Processed chunks & claims for: {title}")

if __name__ == "__main__":
    asyncio.run(main())
