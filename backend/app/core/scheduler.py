import asyncio
import logging
import json
from datetime import datetime, timezone
from sqlalchemy import text
from ..db.session import async_session_factory
from ..knowledge.pattern_engine import run_pattern_discovery_pipeline
from ..db.models import PlannerReminder
from ..api.endpoints.calendar import manager

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

class GraphScheduler:
    def __init__(self, check_interval_seconds: int = 120):
        self.check_interval_seconds = check_interval_seconds
        self.task = None

    async def start(self):
        logger.info("[GraphScheduler] Starting background scheduler...")
        self.task = asyncio.create_task(self._run_loop())

    async def stop(self):
        if self.task:
            logger.info("[GraphScheduler] Stopping background scheduler...")
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            logger.info("[GraphScheduler] Stopped.")

    async def _run_loop(self):
        try:
            while True:
                await asyncio.sleep(self.check_interval_seconds)
                await self._check_and_run()
        except asyncio.CancelledError:
            logger.info("[GraphScheduler] Task cancelled.")
        except Exception as e:
            logger.error(f"[GraphScheduler] Unexpected error: {e}")

    async def _check_and_run(self):
        try:
            async with async_session_factory() as db:
                # Check for claims with memory_score >= 0.60 and < 2 relations
                check_stmt = text("""
                    WITH rel_counts AS (
                        SELECT source_claim_id as claim_id, COUNT(id) as cnt FROM claim_relations GROUP BY source_claim_id
                        UNION ALL
                        SELECT target_claim_id as claim_id, COUNT(id) as cnt FROM claim_relations GROUP BY target_claim_id
                    ),
                    agg_counts AS (
                        SELECT claim_id, SUM(cnt) as total_rels FROM rel_counts GROUP BY claim_id
                    )
                    SELECT COUNT(c.id) as unconnected_count
                    FROM claims c
                    LEFT JOIN agg_counts a ON c.id = a.claim_id
                    WHERE c.is_active = true 
                      AND c.memory_score >= 0.60 
                      AND COALESCE(a.total_rels, 0) < 2
                """)
                res = await db.execute(check_stmt)
                row = res.fetchone()
                await db.rollback()
                
                if row:
                    unconnected_count = row.unconnected_count
                    if unconnected_count >= 99999:
                        logger.info(f"[GraphScheduler] Threshold reached (Unconnected Claims: {unconnected_count} >= 99999). Triggering Relink Pipeline.")
                        # Import and run relinking
                        from ..knowledge.graph_linker import relink_durable_claims
                        await relink_durable_claims(db)
                    else:
                        logger.debug(f"[GraphScheduler] Threshold not met. (Unconnected Claims: {unconnected_count}/99999)")
        except Exception as e:
            logger.error(f"[GraphScheduler] Error in check loop: {e}")


class NotificationScheduler:
    def __init__(self, check_interval_seconds: int = 30):
        self.check_interval_seconds = check_interval_seconds
        self.task = None

    async def start(self):
        logger.info("[NotificationScheduler] Starting background scheduler...")
        self.task = asyncio.create_task(self._run_loop())

    async def stop(self):
        if self.task:
            logger.info("[NotificationScheduler] Stopping background scheduler...")
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            logger.info("[NotificationScheduler] Stopped.")

    async def _run_loop(self):
        try:
            while True:
                await asyncio.sleep(self.check_interval_seconds)
                await self._check_and_run()
        except asyncio.CancelledError:
            logger.info("[NotificationScheduler] Task cancelled.")
        except Exception as e:
            logger.error(f"[NotificationScheduler] Unexpected error: {e}")

    async def _check_and_run(self):
        try:
            async with async_session_factory() as db:
                from sqlalchemy.future import select
                now = datetime.now(timezone.utc)
                stmt = select(PlannerReminder).where(
                    PlannerReminder.is_triggered == False,
                    PlannerReminder.trigger_time <= now
                )
                res = await db.execute(stmt)
                reminders = res.scalars().all()
                
                for rem in reminders:
                    msg = {
                        "type": "reminder",
                        "id": str(rem.id),
                        "message": rem.message,
                        "priority": rem.priority,
                        "event_id": str(rem.event_id) if rem.event_id else None
                    }
                    # Send alert
                    await manager.send_personal_message(json.dumps(msg), str(rem.user_id))
                    
                    # Mark as triggered
                    rem.is_triggered = True
                
                if reminders:
                    await db.commit()
        except Exception as e:
            logger.error(f"[NotificationScheduler] Error in check loop: {e}")

scheduler = PatternScheduler(check_interval_seconds=60) # Check every 60 seconds
graph_scheduler = GraphScheduler(check_interval_seconds=120) # Check every 120 seconds
notification_scheduler = NotificationScheduler(check_interval_seconds=30) # Check every 30 seconds
