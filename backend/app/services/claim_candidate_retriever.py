from typing import List, Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import Claim, Source

class ClaimCandidateRetriever:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_candidates(
        self,
        claim_id: str,
        embedding: List[float],
        domain: Optional[str],
        global_limit: int = 5,
        domain_limit: int = 5,
        min_similarity: float = 0.65
    ) -> List[Claim]:
        candidates_by_id = {}
        
        # Convert min_similarity (cosine similarity) to pgvector cosine distance
        # cos_sim >= 0.65 => cos_dist <= 0.35
        max_distance = 1.0 - min_similarity

        # 1. Глобальный семантический поиск Top-5
        global_stmt = (
            select(Claim)
            .where(
                and_(
                    Claim.id != claim_id,
                    Claim.is_active == True,
                    Claim.embedding.cosine_distance(embedding) <= max_distance
                )
            )
            .order_by(Claim.embedding.cosine_distance(embedding))
            .limit(global_limit)
        )
        global_res = await self.db.execute(global_stmt)
        for c in global_res.scalars().all():
            candidates_by_id[c.id] = c

        # 2. Семантический поиск внутри того же домена Top-5
        if domain:
            domain_stmt = (
                select(Claim)
                .join(Source, Claim.source_id == Source.id)
                .where(
                    and_(
                        Claim.id != claim_id,
                        Claim.is_active == True,
                        Source.domain == domain,
                        Claim.embedding.cosine_distance(embedding) <= max_distance
                    )
                )
                .order_by(Claim.embedding.cosine_distance(embedding))
                .limit(domain_limit)
            )
            domain_res = await self.db.execute(domain_stmt)
            for c in domain_res.scalars().all():
                candidates_by_id.setdefault(c.id, c)

        return list(candidates_by_id.values())
