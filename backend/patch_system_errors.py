import asyncio
import logging
from app.db.session import engine
from app.db.models import SystemError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def run_patch():
    logger.info("Creating system_errors table...")
    async with engine.begin() as conn:
        await conn.run_sync(SystemError.__table__.create, checkfirst=True)
    logger.info("system_errors table created successfully.")

if __name__ == "__main__":
    asyncio.run(run_patch())
