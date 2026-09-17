import re
import xml.etree.ElementTree as ET
import httpx
import asyncio
from typing import Optional, List, Dict
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import TrainingResearch

class PubMedParser:
    PMID_PATTERN = re.compile(r"(?:pubmed\.ncbi\.nlm\.nih\.gov/|pmid/)?(\d{6,9})", re.IGNORECASE)

    @classmethod
    def extract_pmid(cls, source_str: str) -> Optional[str]:
        if not source_str:
            return None
        match = cls.PMID_PATTERN.search(source_str.strip())
        return match.group(1) if match else None

    @classmethod
    async def fetch_abstract(cls, pmid: str) -> Dict[str, Optional[str]]:
        url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id={pmid}&retmode=xml"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return {"title": None, "abstract": None}

        root = ET.fromstring(resp.text)
        
        # Извлечение заголовка
        title_el = root.find(".//ArticleTitle")
        title = "".join(title_el.itertext()) if title_el is not None else None
        
        # Извлечение аннотации
        abstract_nodes = root.findall(".//AbstractText")
        abstract_parts = []
        for node in abstract_nodes:
            label = node.get("Label")
            text = "".join(node.itertext())
            if label:
                abstract_parts.append(f"{label}: {text}")
            else:
                abstract_parts.append(text)
                
        abstract = "\n\n".join(abstract_parts) if abstract_parts else None
        return {"title": title, "abstract": abstract}


class KineticsRAGService:
    @staticmethod
    async def _generate_embedding(embedding_service, text: str) -> Optional[List[float]]:
        if not embedding_service:
            return None
        try:
            # Проверяем все возможные методы провайдера PKA
            if hasattr(embedding_service, "embed_query"):
                res = embedding_service.embed_query(text)
            elif hasattr(embedding_service, "aembed_query"):
                res = await embedding_service.aembed_query(text)
            elif hasattr(embedding_service, "get_text_embedding"):
                res = embedding_service.get_text_embedding(text)
            elif hasattr(embedding_service, "embed_text"):
                res = embedding_service.embed_text(text)
            else:
                return None

            if asyncio.iscoroutine(res):
                res = await res
            return res
        except Exception as e:
            print(f"[Kinetics RAG] Embedding generation skipped: {e}")
            return None

    @staticmethod
    async def search_relevant_researches(
        query: str,
        user_id: str,
        db: AsyncSession,
        embedding_service,
        limit: int = 3
    ) -> List[TrainingResearch]:
        try:
            query_vector = await KineticsRAGService._generate_embedding(embedding_service, query)
            if not query_vector:
                return []

            stmt = (
                select(TrainingResearch)
                .where(
                    TrainingResearch.user_id == UUID(str(user_id)),
                    TrainingResearch.embedding.isnot(None)
                )
                .order_by(TrainingResearch.embedding.cosine_distance(query_vector))
                .limit(limit)
            )
            res = await db.execute(stmt)
            return list(res.scalars().all())
        except Exception as e:
            print(f"[Kinetics RAG Search] Error: {e}")
            return []
