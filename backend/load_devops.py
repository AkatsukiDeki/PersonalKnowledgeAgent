import asyncio
import os
import hashlib
from app.db.session import async_session_factory
from app.db.models import Source
from app.knowledge.ingestion import process_source_chunks_bg

# Папка с вашими 6 файлами .md
FILES_DIR = os.path.join(os.path.dirname(__file__), "tests", "evaluation", "corpus")

async def main():
    async with async_session_factory() as db:
        for fname in os.listdir(FILES_DIR):
            if fname.endswith(".md"):
                path = os.path.join(FILES_DIR, fname)
                with open(path, "r", encoding="utf-8") as f:
                    text = f.read()
                
                title = fname.replace(".md", "")
                source = Source(
                    title=title,
                    content=text,
                    source_type="file",
                    metadata_info={"filename": fname}
                )
                db.add(source)
                await db.commit()
                await db.refresh(source)
                print(f"Uploaded: {title}")
                
                # Запуск нарезки и векторизации
                await process_source_chunks_bg(source.id)
                print(f"Processed chunks & claims for: {title}")
            elif fname.endswith(".json"):
                import json
                from app.knowledge.chat_pipeline import process_chat_pipeline
                path = os.path.join(FILES_DIR, fname)
                with open(path, "r", encoding="utf-8") as f:
                    chat_data = json.load(f)
                await process_chat_pipeline(db, chat_data, title=fname)
                print(f"Processed chat pipeline for: {fname}")

if __name__ == "__main__":
    asyncio.run(main())
