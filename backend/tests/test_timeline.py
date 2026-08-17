import pytest
import uuid
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select

from app.db.models import Claim, ClaimConflict

# ==========================================
# Phase 3D: Contradictions & Timeline Tests
# ==========================================

@pytest.mark.asyncio
async def test_claim_no_self_supersede(db_session, sample_source, sample_chunk):
    """Verifies that a claim cannot supersede itself."""
    claim = Claim(
        source_id=sample_source.id,
        chunk_id=sample_chunk.id,
        content="I use Django.",
        claim_type="preference",
        category="programming",
        confidence=1.0,
    )
    db_session.add(claim)
    await db_session.commit()
    await db_session.refresh(claim)
    
    # Try to set supersede to itself
    claim.superseded_by = claim.id
    db_session.add(claim)
    
    with pytest.raises(IntegrityError) as exc:
        await db_session.commit()
    assert "ck_claim_no_self_supersede" in str(exc.value)

@pytest.mark.asyncio
async def test_claim_supersession_flow(db_session, sample_source, sample_chunk):
    """Verifies the normal supersession flow."""
    claim1 = Claim(
        source_id=sample_source.id,
        chunk_id=sample_chunk.id,
        content="I use Django.",
        claim_type="preference",
        category="programming",
        confidence=1.0,
        is_active=True
    )
    claim2 = Claim(
        source_id=sample_source.id,
        chunk_id=sample_chunk.id,
        content="I moved to FastAPI.",
        claim_type="preference",
        category="programming",
        confidence=1.0,
        is_active=True
    )
    db_session.add_all([claim1, claim2])
    await db_session.commit()
    await db_session.refresh(claim1)
    await db_session.refresh(claim2)
    
    claim1.is_active = False
    claim1.superseded_by = claim2.id
    db_session.add(claim1)
    await db_session.commit()
    await db_session.refresh(claim1)
    
    assert claim1.is_active is False
    assert claim1.superseded_by == claim2.id

@pytest.mark.asyncio
async def test_claim_conflict_creation(db_session, sample_source, sample_chunk):
    """Verifies ClaimConflict table works correctly."""
    claim1 = Claim(
        source_id=sample_source.id,
        chunk_id=sample_chunk.id,
        content="Apples are bad.",
        claim_type="preference",
        category="food",
    )
    claim2 = Claim(
        source_id=sample_source.id,
        chunk_id=sample_chunk.id,
        content="Apples are great.",
        claim_type="preference",
        category="food",
    )
    db_session.add_all([claim1, claim2])
    await db_session.commit()
    await db_session.refresh(claim1)
    await db_session.refresh(claim2)
    
    conflict = ClaimConflict(
        claim_a_id=claim1.id,
        claim_b_id=claim2.id,
        status="unresolved",
        resolution_summary="Contradiction on apples"
    )
    db_session.add(conflict)
    await db_session.commit()
    await db_session.refresh(conflict)
    
    assert conflict.id is not None
    assert conflict.status == "unresolved"
    assert conflict.resolution_summary == "Contradiction on apples"

@pytest.mark.asyncio
async def test_api_resolve_conflict_supersede(client, db_session, sample_source, sample_chunk):
    """Verifies the /api/v1/conflicts/{id}/resolve endpoint with supersede strategy."""
    # Create claims and conflict
    claim1 = Claim(
        source_id=sample_source.id, chunk_id=sample_chunk.id,
        content="Claim A", claim_type="fact", category="test", confidence=1.0, is_active=True
    )
    claim2 = Claim(
        source_id=sample_source.id, chunk_id=sample_chunk.id,
        content="Claim B", claim_type="fact", category="test", confidence=1.0, is_active=True
    )
    db_session.add_all([claim1, claim2])
    await db_session.commit()
    
    conflict = ClaimConflict(
        claim_a_id=claim1.id, claim_b_id=claim2.id,
        status="unresolved"
    )
    db_session.add(conflict)
    await db_session.commit()
    
    # Resolve using API
    response = await client.post(
        f"/api/v1/conflicts/{conflict.id}/resolve",
        json={
            "strategy": "supersede",
            "winner_claim_id": str(claim1.id),
            "resolution_notes": "Claim A is newer"
        }
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "resolved"
    assert data["resolution_summary"] == "Claim A is newer"
    
    # Refresh claims from DB
    await db_session.refresh(claim1)
    await db_session.refresh(claim2)
    
    # Check that Claim B was superseded by Claim A
    assert claim1.is_active is True
    assert claim2.is_active is False
    assert claim2.superseded_by == claim1.id

@pytest.mark.asyncio
async def test_api_resolve_conflict_edit(client, db_session, sample_source, sample_chunk):
    """Verifies the /api/v1/conflicts/{id}/resolve endpoint with edit strategy."""
    # Create claims and conflict
    claim1 = Claim(
        source_id=sample_source.id, chunk_id=sample_chunk.id,
        content="Original A", claim_type="fact", category="test", confidence=1.0, is_active=True
    )
    claim2 = Claim(
        source_id=sample_source.id, chunk_id=sample_chunk.id,
        content="Original B", claim_type="fact", category="test", confidence=1.0, is_active=True
    )
    db_session.add_all([claim1, claim2])
    await db_session.commit()
    
    conflict = ClaimConflict(
        claim_a_id=claim1.id, claim_b_id=claim2.id,
        status="unresolved"
    )
    db_session.add(conflict)
    await db_session.commit()
    
    # Resolve using API
    response = await client.post(
        f"/api/v1/conflicts/{conflict.id}/resolve",
        json={
            "strategy": "edit",
            "edited_claims": [
                {"claim_id": str(claim1.id), "new_content": "Edited A"}
            ],
            "resolution_notes": "Edited claim A to clarify context"
        }
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "resolved"
    
    # Refresh claims from DB
    await db_session.refresh(claim1)
    await db_session.refresh(claim2)
    
    # Check that Claim A was updated and history saved
    assert claim1.content == "Edited A"
    assert claim1.is_active is True
    assert claim2.is_active is True
    assert "previous_versions" in claim1.meta_info
    assert claim1.meta_info["previous_versions"][0]["content"] == "Original A"
