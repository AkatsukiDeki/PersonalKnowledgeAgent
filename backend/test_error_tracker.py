import asyncio
import logging
from sqlalchemy import select, delete
from app.db.session import async_session_factory
from app.db.models import SystemError
from app.core.error_tracker import record_error, resolve_granular_error, compute_stable_fingerprint

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def run_smoke_test():
    async with async_session_factory() as db:
        await db.execute(delete(SystemError))
        await db.commit()
    
    # 1. Test Fail-safe Upsert and Fingerprint
    try:
        raise ValueError("Invalid token bearer 123456789abc")
    except ValueError as err:
        await record_error(err, "test_stage", provider="ollama")
        # Same error again -> should update occurrences
        await record_error(err, "test_stage", provider="ollama")
        
    # Different error -> should insert new
    try:
        raise TypeError("Another error")
    except TypeError as err2:
        await record_error(err2, "test_stage", provider="ollama")
    
    async with async_session_factory() as db:
        res = await db.execute(select(SystemError))
        errors = res.scalars().all()
        if len(errors) != 2:
            for e in errors:
                logger.error(f"Error in DB: {e.fingerprint}, {e.message}, {e.occurrences}")
        assert len(errors) == 2, f"Expected 2 distinct errors, got {len(errors)}"
        
        fingerprints = [e.fingerprint for e in errors]
        assert len(set(fingerprints)) == 2
        
        err1_db = next(e for e in errors if "bearer" in e.message)
        assert err1_db.occurrences == 2, "Occurrences should be 2 for the duplicate error"
        assert "***REDACTED***" in err1_db.message, "Secrets should be redacted"
    
    # 2. Test Granular Resolve
    count = await resolve_granular_error("test_stage")
    assert count == 2, "Should resolve 2 errors"
    
    async with async_session_factory() as db:
        res = await db.execute(select(SystemError))
        errors = res.scalars().all()
        for e in errors:
            assert e.status == "resolved"
            assert e.resolved_at is not None

    logger.info("Smoke test passed successfully!")

if __name__ == "__main__":
    asyncio.run(run_smoke_test())
