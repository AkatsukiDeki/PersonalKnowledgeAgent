from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .deps import get_db
from ..db.models import Claim
from ..knowledge.retrieval import hybrid_search

router = APIRouter(prefix="/search", tags=["Search"])


class SearchHit(BaseModel):
    chunk_id: str
    source_id: str
    text_content: str
    similarity: float | None = None
    rrf_score: float | None = None
    claim_id: str | None = None


class SearchResponse(BaseModel):
    results: list[SearchHit]


def _as_uuid(value: object) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except ValueError:
        return None


@router.get("", response_model=SearchResponse)
@router.get("/", response_model=SearchResponse, include_in_schema=False)
async def semantic_search(
    query: str = Query(..., min_length=1),
    limit: int = Query(8, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    rows = await hybrid_search(db, query, query, limit=limit)

    chunk_ids: list[UUID] = []
    for row in rows:
        parsed = _as_uuid(row.get("chunk_id"))
        if parsed is not None:
            chunk_ids.append(parsed)

    claim_by_chunk: dict[str, str] = {}
    if chunk_ids:
        stmt = select(Claim).where(Claim.chunk_id.in_(chunk_ids), Claim.is_active.is_(True))
        claims = (await db.execute(stmt)).scalars().all()
        for claim in claims:
            claim_by_chunk[str(claim.chunk_id)] = str(claim.id)

    results: list[SearchHit] = []
    for row in rows:
        chunk_id = str(row.get("chunk_id") or "")
        similarity = row.get("similarity")
        rrf_score = row.get("rrf_score")
        results.append(
            SearchHit(
                chunk_id=chunk_id,
                source_id=str(row.get("source_id") or ""),
                text_content=str(row.get("text_content") or ""),
                similarity=float(similarity) if similarity is not None else None,
                rrf_score=float(rrf_score) if rrf_score is not None else None,
                claim_id=claim_by_chunk.get(chunk_id),
            )
        )

    return SearchResponse(results=results)
