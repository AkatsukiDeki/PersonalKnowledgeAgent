import pytest
import uuid
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select

from app.db.models import Pattern

# ==========================================
# 1. DB CONSTRAINTS TESTS
# ==========================================

@pytest.mark.asyncio
async def test_pattern_min_domains_constraint(db_session):
    """Verifies that pattern must have at least 2 domains."""
    pattern = Pattern(
        title="Test pattern",
        description="Test",
        pattern_type="behavioral",
        domains=["sport"], # Only 1 domain!
        confidence=0.9,
        evidence_summary="Summary",
        evidence_claim_ids=[uuid.uuid4(), uuid.uuid4()]
    )
    db_session.add(pattern)
    with pytest.raises(IntegrityError) as exc:
        await db_session.commit()
    assert "ck_pattern_min_domains" in str(exc.value)

@pytest.mark.asyncio
async def test_pattern_confidence_validation(db_session):
    """Verifies confidence must be between 0 and 1."""
    pattern = Pattern(
        title="Test pattern",
        description="Test",
        pattern_type="behavioral",
        domains=["sport", "work"],
        confidence=1.5, # > 1.0!
        evidence_summary="Summary",
        evidence_claim_ids=[uuid.uuid4(), uuid.uuid4()]
    )
    db_session.add(pattern)
    with pytest.raises(IntegrityError) as exc:
        await db_session.commit()
    assert "ck_pattern_confidence_range" in str(exc.value)

@pytest.mark.asyncio
async def test_pattern_valid_creation(db_session):
    """Verifies valid pattern creation."""
    pattern = Pattern(
        title="Valid pattern",
        description="Test",
        pattern_type="productivity",
        domains=["study", "programming"],
        confidence=0.8,
        evidence_summary="Summary",
        evidence_claim_ids=[uuid.uuid4(), uuid.uuid4()]
    )
    db_session.add(pattern)
    await db_session.commit()
    await db_session.refresh(pattern)
    
    assert pattern.id is not None
    assert len(pattern.domains) == 2
