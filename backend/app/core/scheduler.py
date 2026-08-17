import asyncio
import logging
from sqlalchemy import text
from app.db.session import async_session_factory
from app.knowledge.pattern_engine import run_pattern_discovery_pipeline

logger = logging.getLogger(__name__)

class PatternScheduler:
    def __init__(self, check_interval_seconds: int = 300):
        self.check_interval_seconds = check_interval_seconds
        self.task = None
        self.last_analyzed_claims_count = 0
        self.last_analyzed_domains_count = 0

    async def start(self):
        logger.info("[PatternScheduler] Starting background scheduler...")
        self.task = asyncio.create_task(self._run_loop())

    async def stop(self):
        if self.task:
            logger.info("[PatternScheduler] Stopping background scheduler...")
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            logger.info("[PatternScheduler] Stopped.")

    async def _run_loop(self):
        try:
            while True:
                await asyncio.sleep(self.check_interval_seconds)
                await self._check_and_run()
        except asyncio.CancelledError:
            logger.info("[PatternScheduler] Task cancelled.")
        except Exception as e:
            logger.error(f"[PatternScheduler] Unexpected error: {e}")

    async def _check_and_run(self):
        try:
            async with async_session_factory() as db:
                check_stmt = text("""
                    WITH last_pattern AS (
                        SELECT COALESCE(MAX(created_at), '1970-01-01'::timestamp) as max_date 
                        FROM patterns
                    ),
                    new_claims AS (
                        SELECT id, category FROM claims 
                        WHERE created_at > (SELECT max_date FROM last_pattern)
                    )
                    SELECT count(id) as c_count, count(DISTINCT category) as cat_count
                    FROM new_claims
                """)
                res = await db.execute(check_stmt)
                row = res.fetchone()
                
                # SQLAlchemy 2.0 implicitly starts a transaction on execute.
                # Since the pipeline creates its own nested transactions using db.begin(),
                # we must close the current transaction first.
                await db.rollback()
                
                if row:
                    current_claims = row.c_count
                    current_domains = row.cat_count
                    
                    delta_claims = current_claims - self.last_analyzed_claims_count
                    delta_domains = current_domains - self.last_analyzed_domains_count
                    
                    if delta_claims >= 20 or delta_domains >= 2:
                        logger.info(f"[PatternScheduler] Threshold reached (Delta Claims: {delta_claims}, Delta Domains: {delta_domains}). Triggering Pipeline.")
                        
                        patterns = await run_pattern_discovery_pipeline(db)
                        if patterns:
                            # Reset in-memory state since a new pattern was created (updating last_run in DB)
                            self.last_analyzed_claims_count = 0
                            self.last_analyzed_domains_count = 0
                        else:
                            # Update in-memory state so we don't trigger again for the same delta
                            self.last_analyzed_claims_count = current_claims
                            self.last_analyzed_domains_count = current_domains
                    else:
                        logger.debug(f"[PatternScheduler] Threshold not met. (Delta Claims: {delta_claims}/20, Delta Domains: {delta_domains}/2)")
        except Exception as e:
            logger.error(f"[PatternScheduler] Error in check loop: {e}")

scheduler = PatternScheduler(check_interval_seconds=60) # Check every 60 seconds
