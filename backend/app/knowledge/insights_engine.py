import json
import uuid
import asyncio
import logging
import re
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from ..db.models import Insight, Decision, ConversationMemory, Claim, Source
from ..core.llm import generate_with_retry

PROACTIVE_SYSTEM_PROMPT = """Ты — ведущий системный архитектор и аналитик. 
Тебе предоставлены фрагменты опыта из базы знаний проекта (Decisions, Memories, Claims). 
Твоя задача — выявить скрытую закономерность, противоречие или неочевидный вывод. 
Сформулируй краткий проактивный Insight (вывод).

Формат ответа строго JSON:
{
  "title": "Краткий заголовок инсайта (до 60 символов)",
  "description": "Развернутое описание проблемы или тренда, с рекомендацией",
  "importance_score": 0.85
}
"""

async def synthesize_insight(context_text: str) -> Dict[str, Any]:
    prompt = f"Проанализируй следующие данные и сгенерируй инсайт:\n\n{context_text}"
    
    try:
        response_text = await generate_with_retry(
            prompt=prompt,
            system=PROACTIVE_SYSTEM_PROMPT
        )
        # Parse JSON
        start_idx = response_text.find("{")
        end_idx = response_text.rfind("}")
        if start_idx != -1 and end_idx != -1:
            json_str = response_text[start_idx:end_idx+1]
            return json.loads(json_str)
        return None
    except Exception as e:
        print(f"Error synthesizing insight: {e}")
        return None


class InsightsEngine:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def run_all_heuristics(self):
        print("Running Semantic Collisions...")
        await self.heuristic_semantic_collisions()
        print("Running Contradiction Detection...")
        await self.heuristic_contradictions()
        print("Running Graph Centrality...")
        await self.heuristic_graph_centrality()
        print("Running Attempt Loops...")
        await self.heuristic_attempt_loops()
        
    async def heuristic_semantic_collisions(self):
        # 1. Поиск кросс-доменных связей (Semantic Collisions)
        # Находим пары Decision из разных доменов, где косинусное расстояние < 0.25 (sim > 0.75)
        stmt = (
            select(Decision)
            .where(Decision.embedding.is_not(None))
            .where(Decision.status == 'active')
        )
        decisions = (await self.db.execute(stmt)).scalars().all()
        
        seen_pairs = set()
        
        for dec1 in decisions:
            # Ищем ближайших соседей
            knn_stmt = (
                select(Decision, Decision.embedding.cosine_distance(dec1.embedding).label("distance"))
                .where(Decision.id != dec1.id)
                .where(Decision.embedding.is_not(None))
                .where(Decision.domain != dec1.domain) # Разные домены
                .order_by(Decision.embedding.cosine_distance(dec1.embedding))
                .limit(3)
            )
            neighbors = (await self.db.execute(knn_stmt)).all()
            
            for dec2, dist in neighbors:
                if dist > 0.25: # sim < 0.75
                    continue
                    
                pair_key = tuple(sorted([str(dec1.id), str(dec2.id)]))
                if pair_key in seen_pairs:
                    continue
                seen_pairs.add(pair_key)
                
                # Синтезируем инсайт
                context = (
                    f"Домен {dec1.domain}: Решение '{dec1.decision}'. Обоснование: '{dec1.rationale}'\n\n"
                    f"Домен {dec2.domain}: Решение '{dec2.decision}'. Обоснование: '{dec2.rationale}'"
                )
                
                insight_data = await synthesize_insight(context)
                if insight_data:
                    insight = Insight(
                        id=uuid.uuid4(),
                        insight_type="cross_domain_link",
                        title=insight_data.get("title", "Cross-domain connection"),
                        description=insight_data.get("description", ""),
                        evidence_links=[str(dec1.id), str(dec2.id)],
                        domains_involved=[dec1.domain, dec2.domain],
                        importance_score=insight_data.get("importance_score", 0.7)
                    )
                    self.db.add(insight)
        await self.db.commit()

    async def heuristic_contradictions(self):
        # 2. Contradiction Detection
        # Для простоты: берем активные Claims и ищем семантически похожие, но от разных источников
        stmt = (
            select(Claim)
            .where(Claim.embedding.is_not(None))
            .where(Claim.is_active == True)
        )
        claims = (await self.db.execute(stmt)).scalars().all()
        
        seen_pairs = set()
        for c1 in claims:
            knn_stmt = (
                select(Claim, Claim.embedding.cosine_distance(c1.embedding).label("distance"))
                .where(Claim.id != c1.id)
                .where(Claim.embedding.is_not(None))
                .where(Claim.source_id != c1.source_id)
                .order_by(Claim.embedding.cosine_distance(c1.embedding))
                .limit(2)
            )
            neighbors = (await self.db.execute(knn_stmt)).all()
            for c2, dist in neighbors:
                if dist > 0.15: # sim < 0.85
                    continue
                
                pair_key = tuple(sorted([str(c1.id), str(c2.id)]))
                if pair_key in seen_pairs:
                    continue
                seen_pairs.add(pair_key)
                
                context = (
                    f"Утверждение 1: '{c1.content}'\n"
                    f"Утверждение 2: '{c2.content}'\n"
                    f"Найди логическое противоречие между ними."
                )
                
                insight_data = await synthesize_insight(context)
                if insight_data:
                    insight = Insight(
                        id=uuid.uuid4(),
                        insight_type="contradiction",
                        title=insight_data.get("title", "Found Contradiction"),
                        description=insight_data.get("description", ""),
                        evidence_links=[str(c1.id), str(c2.id)],
                        domains_involved=[],
                        importance_score=insight_data.get("importance_score", 0.8)
                    )
                    self.db.add(insight)
        await self.db.commit()

    async def heuristic_graph_centrality(self):
        # 3. Graph Centrality (Узкие места)
        # Найти Source или ConversationMemory на которые ссылается много Decisions или Claims (пока заглушка: найдем часто упоминаемый домен)
        # В реальной реализации можно считать in-degree узлов в claim_relations
        pass

    async def heuristic_attempt_loops(self):
        # 4. Attempt Loops
        # Если в ConversationMemory.attempts фиксируется >= 3 неудачных подходов
        stmt = select(ConversationMemory)
        memories = (await self.db.execute(stmt)).scalars().all()
        
        for mem in memories:
            attempts = mem.attempts if mem.attempts else []
            if len(attempts) >= 3:
                context = f"Проблема: {mem.problem}\nНеудачные попытки:\n"
                for i, att in enumerate(attempts, 1):
                    context += f"{i}. {att}\n"
                context += f"\nИтог: {mem.outcome}\nСгенерируй инсайт о скрытом техническом долге или сложности."
                
                insight_data = await synthesize_insight(context)
                if insight_data:
                    insight = Insight(
                        id=uuid.uuid4(),
                        insight_type="attempt_loop",
                        title=insight_data.get("title", "High Effort Loop"),
                        description=insight_data.get("description", ""),
                        evidence_links=[str(mem.id)],
                        domains_involved=[],
                        importance_score=insight_data.get("importance_score", 0.9)
                    )
                    self.db.add(insight)
        await self.db.commit()
