import pytest
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select

from app.db.models import Claim
from app.db.models import Entity, ClaimRelation
from app.db.models import Source
from app.db.models import Chunk

# ==========================================
# 1. DB CONSTRAINTS & INTEGRITY TESTS (Phase 3B)
# ==========================================

@pytest.mark.asyncio
async def test_self_relation_rejected(db_session, sample_claim):
    """3. Запрет создания связи факта с самим собой (CheckConstraint)."""
    rel = ClaimRelation(
        source_claim_id=sample_claim.id,
        target_claim_id=sample_claim.id,
        relation_type="supports",
        confidence=0.9,
        evidence_summary="Self-reference test",
        evidence_claim_ids=[sample_claim.id],
        evidence_chunk_ids=[sample_claim.chunk_id],
    )
    db_session.add(rel)
    with pytest.raises(IntegrityError, match="check_no_self_relation"):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid_confidence", [-0.1, 1.01, 2.0])
async def test_relation_confidence_range_validation(db_session, sample_claim_a, sample_claim_b, invalid_confidence):
    """2. Валидация диапазона confidence [0.0, 1.0] на уровне БД."""
    rel = ClaimRelation(
        source_claim_id=sample_claim_a.id,
        target_claim_id=sample_claim_b.id,
        relation_type="supports",
        confidence=invalid_confidence,
        evidence_summary="Out of range confidence test",
        evidence_claim_ids=[sample_claim_a.id, sample_claim_b.id],
        evidence_chunk_ids=[sample_claim_a.chunk_id, sample_claim_b.chunk_id],
    )
    db_session.add(rel)
    with pytest.raises(IntegrityError, match="check_confidence_range"):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_duplicate_relation_rejected(db_session, sample_claim_a, sample_claim_b):
    """Проверка UniqueConstraint на пару утверждений и тип связи."""
    rel1 = ClaimRelation(
        source_claim_id=sample_claim_a.id,
        target_claim_id=sample_claim_b.id,
        relation_type="supports",
        confidence=0.88,
        evidence_summary="Первое обоснование",
        evidence_claim_ids=[sample_claim_a.id, sample_claim_b.id],
        evidence_chunk_ids=[sample_claim_a.chunk_id, sample_claim_b.chunk_id],
    )
    db_session.add(rel1)
    await db_session.commit()

    rel2 = ClaimRelation(
        source_claim_id=sample_claim_a.id,
        target_claim_id=sample_claim_b.id,
        relation_type="supports",
        confidence=0.88,
        evidence_summary="Дублирующее ребро",
        evidence_claim_ids=[sample_claim_a.id, sample_claim_b.id],
        evidence_chunk_ids=[sample_claim_a.chunk_id, sample_claim_b.chunk_id],
    )
    db_session.add(rel2)
    with pytest.raises(IntegrityError, match="ix_unique_relation"):
        await db_session.commit()
    await db_session.rollback()


# ==========================================
# 5. RAG CORE L1 REGRESSION TESTS (End-to-End)
# ==========================================

@pytest.mark.asyncio
async def test_existing_rag_remains_functional(client):
    """Проверка, что L1 Hybrid Search и SSE-стриминг не деградировали после добавления L2."""
    payload = {
        "query": "Какие технологии используются для контейнеризации?",
        "history": []
    }
    response = await client.post("/api/v1/chat/stream", json=payload)
    assert response.status_code == 200
    assert "text/event-stream" in response.headers.get("content-type", "")


@pytest.mark.asyncio
async def test_bidirectional_claim_relations_endpoint(client, db_session, sample_claim_a, sample_claim_b):
    """Проверка эндпоинта /api/v1/graph/claims/{id} на симметричную выборку (OR)."""
    rel = ClaimRelation(
        source_claim_id=sample_claim_a.id,
        target_claim_id=sample_claim_b.id,
        relation_type="related_to",
        confidence=0.82,
        evidence_summary="Оба факта описывают изоляцию сред",
    )
    db_session.add(rel)
    await db_session.commit()

    # Запрос для target_claim_id (должен вернуть связь, несмотря на то, что факт целевой)
    resp = await client.get(f"/api/v1/graph/claims/{sample_claim_b.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data.get("relations", [])) == 1
    assert data["relations"][0]["relation_type"] == "related_to"
    assert data["relations"][0]["evidence_summary"] == "Оба факта описывают изоляцию сред"

@pytest.mark.asyncio
async def test_graph_topology_endpoint(client, db_session, sample_claim_a, sample_claim_b, sample_entity):
    """Проверка эндпоинта /api/v1/graph/topology на отдачу нод и связей."""
    # Link claim to entity manually for test
    from app.db.models import claim_entities
    await db_session.execute(claim_entities.insert().values(claim_id=sample_claim_a.id, entity_id=sample_entity.id))
    
    rel = ClaimRelation(
        source_claim_id=sample_claim_a.id,
        target_claim_id=sample_claim_b.id,
        relation_type="supports",
        confidence=0.9,
    )
    db_session.add(rel)
    await db_session.commit()

    resp = await client.get("/api/v1/graph/topology")
    assert resp.status_code == 200
    data = resp.json()
    
    assert "nodes" in data
    assert "links" in data
    
    node_ids = [n["id"] for n in data["nodes"]]
    assert str(sample_claim_a.id) in node_ids
    assert str(sample_claim_b.id) in node_ids
    assert str(sample_entity.id) in node_ids
    
    link_sources = [l["source"] for l in data["links"]]
    assert str(sample_claim_a.id) in link_sources
