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


class QuickSearchResultItem(BaseModel):
    id: str
    type: str  # "claim" | "source" | "subject"
    title: str
    snippet: str
    score: float

class QuickSearchResponse(BaseModel):
    query: str
    results: list[QuickSearchResultItem]

@router.get("/quick-lookup", response_model=QuickSearchResponse)
async def quick_lookup(
    q: str = Query(..., min_length=2, max_length=200),
    db: AsyncSession = Depends(get_db)
):
    rows = await hybrid_search(db, q, q, limit=5)
    
    chunk_ids = []
    for r in rows:
        parsed = _as_uuid(r.get("chunk_id"))
        if parsed is not None:
            chunk_ids.append(parsed)
            
    claim_by_chunk = {}
    if chunk_ids:
        stmt = select(Claim).where(Claim.chunk_id.in_(chunk_ids), Claim.is_active.is_(True))
        claims = (await db.execute(stmt)).scalars().all()
        for claim in claims:
            claim_by_chunk[str(claim.chunk_id)] = claim
            
    results = []
    for r in rows:
        chunk_id = str(r.get("chunk_id") or "")
        claim = claim_by_chunk.get(chunk_id)
        
        snippet = str(r.get("text_content") or "")
        if len(snippet) > 150:
            snippet = snippet[:150] + "..."
            
        if claim:
            title = claim.content[:50] + "..." if len(claim.content) > 50 else claim.content
            results.append(QuickSearchResultItem(
                id=str(claim.id),
                type="claim",
                title=title,
                snippet=snippet,
                score=float(r.get("rrf_score") or 0.0)
            ))
        else:
            source_id_str = str(r.get("source_id") or "")
            results.append(QuickSearchResultItem(
                id=source_id_str,
                type="source",
                title=f"Source snippet ({source_id_str[:8]})",
                snippet=snippet,
                score=float(r.get("rrf_score") or 0.0)
            ))
            
    return QuickSearchResponse(query=q, results=results)
