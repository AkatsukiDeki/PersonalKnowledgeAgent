import asyncio
import logging
from sqlalchemy import text
from app.db.session import async_session_factory

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def run_patch():
    async with async_session_factory() as db:
        logger.info("Adding status column to patterns table...")
        await db.execute(text("ALTER TABLE patterns ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending_review';"))
        
        logger.info("Creating index ix_patterns_status...")
        await db.execute(text("CREATE INDEX IF NOT EXISTS ix_patterns_status ON patterns(status);"))
        
        await db.commit()
        logger.info("Patch applied successfully.")

if __name__ == "__main__":
    asyncio.run(run_patch())
