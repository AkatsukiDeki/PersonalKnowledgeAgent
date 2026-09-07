import logging
import urllib.parse
from typing import List, Dict, Any, Optional
import uuid
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from ..knowledge.embeddings.factory import get_embedding_provider

logger = logging.getLogger(__name__)

SIMILARITY_THRESHOLD = 0.88


def _clean_node_name(name: Optional[str]) -> str:
    """Декодирует URL-строки (%D0%...) и обрезает слишком длинные названия файлов."""
    if not name:
        return "Unknown"
    try:
        decoded = urllib.parse.unquote(str(name))
    except Exception:
        decoded = str(name)

    # Очищаем имя от путей и расширений файлов
    cleaned = decoded.split("/")[-1].split("\\")[-1]
    for ext in [".md", ".txt", ".mp3", ".wav", ".pdf", ".docx"]:
        if cleaned.lower().endswith(ext):
            cleaned = cleaned[:-len(ext)]
            break

    cleaned = cleaned.strip()
    return (cleaned[:28] + "...") if len(cleaned) > 28 else cleaned


class GraphService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.embedder = get_embedding_provider()

    async def upsert_entity(self, name: str, entity_type: str, description: str = "") -> UUID:
        normalized = name.strip()
        embedding = await self.embedder.embed_query(name)

        # 1. Поиск по точному совпадению канонического имени (case-insensitive)
        find_sql = text("""
            SELECT id FROM entities 
            WHERE LOWER(canonical_name) = LOWER(:name) AND entity_type = :type
            LIMIT 1
        """)
        res = await self.db.execute(find_sql, {"name": normalized, "type": entity_type})
        row = res.fetchone()
        if row:
            return row[0]

        # 2. Векторный поиск дубликатов (HNSW / pgvector)
        vector_sql = text("""
            SELECT id, 1 - (embedding <=> :emb\:\:vector) AS similarity
            FROM entities
            WHERE entity_type = :type AND embedding IS NOT NULL
            ORDER BY embedding <=> :emb\:\:vector
            LIMIT 1
        """)
        res = await self.db.execute(vector_sql, {"emb": str(embedding), "type": entity_type})
        match = res.fetchone()

        if match and match[1] >= SIMILARITY_THRESHOLD:
            return match[0]

        # 3. Вставка новой канонической сущности
        entity_id = uuid.uuid4()
        insert_sql = text("""
            INSERT INTO entities (id, canonical_name, entity_type, description, aliases, meta_info, embedding)
            VALUES (:id, :name, :type, :desc, ARRAY[:name]::varchar[], '{}'::jsonb, :emb\:\:vector)
            RETURNING id
        """)
        res = await self.db.execute(
            insert_sql,
            {
                "id": entity_id,
                "name": normalized,
                "type": entity_type,
                "desc": description,
                "emb": str(embedding),
            },
        )
        return res.scalar_one()

    async def add_relation(
        self,
        source_id: UUID,
        target_id: UUID,
        relation_type: str,
        weight: float = 1.0,
        chunk_id: Optional[UUID] = None,
    ) -> None:
        if source_id == target_id:
            return

        sql = text("""
            INSERT INTO entity_relations (source_entity_id, target_entity_id, relation_type, weight, source_chunk_id)
            VALUES (:src, :tgt, :type, :w, :chunk_id)
            ON CONFLICT (source_entity_id, target_entity_id, relation_type)
            DO UPDATE SET 
                weight = entity_relations.weight + :w
        """)
        await self.db.execute(
            sql,
            {
                "src": source_id,
                "tgt": target_id,
                "type": relation_type,
                "w": weight,
                "chunk_id": chunk_id,
            },
        )

    async def get_galaxy_graph_data(self, limit: int = 500) -> Dict[str, Any]:
        """Отдает узлы и ребра для Galaxy Universe 4D с группировкой по кластерам."""
        nodes_sql = text("""
            WITH top_nodes AS (
                SELECT e.id, 
                       e.canonical_name AS name, 
                       e.entity_type, 
                       e.description, 
                       e.created_at,
                       COUNT(r.id) AS connection_count
                FROM entities e
                LEFT JOIN entity_relations r 
                  ON e.id = r.source_entity_id OR e.id = r.target_entity_id
                GROUP BY e.id, e.canonical_name, e.entity_type, e.description, e.created_at
                ORDER BY connection_count DESC
                LIMIT :lim
            )
            SELECT * FROM top_nodes
        """)
        edges_sql = text("""
            WITH top_nodes AS (
                SELECT e.id
                FROM entities e
                LEFT JOIN entity_relations r 
                  ON e.id = r.source_entity_id OR e.id = r.target_entity_id
                GROUP BY e.id
                ORDER BY COUNT(r.id) DESC
                LIMIT :lim
            )
            SELECT r.id, 
                   r.source_entity_id AS source, 
                   r.target_entity_id AS target,
                   r.relation_type, 
                   r.weight, 
                   r.source_chunk_id, 
                   r.created_at
            FROM entity_relations r
            WHERE r.source_entity_id IN (SELECT id FROM top_nodes)
              AND r.target_entity_id IN (SELECT id FROM top_nodes)
            LIMIT :lim * 2
        """)

        nodes_res = await self.db.execute(nodes_sql, {"lim": limit})
        edges_res = await self.db.execute(edges_sql, {"lim": limit})

        nodes = [
            {
                "id": str(r.id),
                "name": _clean_node_name(r.name),
                "raw_name": r.name,
                "type": r.entity_type,
                "description": r.description or "",
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "size": max(8, min(32, int((r.connection_count or 0) * 2) + 8)),
                "connection_count": r.connection_count or 0,
            }
            for r in nodes_res.fetchall()
        ]

        edges = [
            {
                "id": str(r.id),
                "source": str(r.source),
                "target": str(r.target),
                "fromId": str(r.source),
                "toId": str(r.target),
                "from": str(r.source),
                "to": str(r.target),
                "relation": r.relation_type,
                "weight": float(r.weight or 1.0),
                "source_chunk_id": str(r.source_chunk_id) if r.source_chunk_id else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in edges_res.fetchall()
            if r.source is not None and r.target is not None
        ]

        return {"nodes": nodes, "edges": edges}

    async def get_entity_details(self, entity_id: str) -> Optional[Dict[str, Any]]:
        entity_sql = text("""
            SELECT id, canonical_name AS name, entity_type, description, created_at
            FROM entities
            WHERE id = :id
        """)
        res = await self.db.execute(entity_sql, {"id": entity_id})
        entity_row = res.fetchone()

        if not entity_row:
            return None

        relations_sql = text("""
            SELECT r.id, r.relation_type, r.weight,
                   CASE WHEN r.source_entity_id = :id THEN r.target_entity_id ELSE r.source_entity_id END AS related_id,
                   CASE WHEN r.source_entity_id = :id THEN 'outgoing' ELSE 'incoming' END AS direction,
                   e.canonical_name AS related_name,
                   e.entity_type AS related_type,
                   r.source_chunk_id,
                   s.id AS source_file_id,
                   s.title AS source_title
            FROM entity_relations r
            JOIN entities e ON e.id = (CASE WHEN r.source_entity_id = :id THEN r.target_entity_id ELSE r.source_entity_id END)
            LEFT JOIN chunks c ON c.id = r.source_chunk_id
            LEFT JOIN sources s ON s.id = c.source_id
            WHERE r.source_entity_id = :id OR r.target_entity_id = :id
            ORDER BY r.weight DESC
            LIMIT 100
        """)
        rels_res = await self.db.execute(relations_sql, {"id": entity_id})

        relations = []
        sources = {}

        for r in rels_res.fetchall():
            relations.append({
                "id": str(r.id),
                "relation_type": r.relation_type,
                "weight": float(r.weight or 1.0),
                "direction": r.direction,
                "related_id": str(r.related_id),
                "related_name": _clean_node_name(r.related_name),
                "related_type": r.related_type,
            })

            if r.source_chunk_id and r.source_file_id:
                sources[str(r.source_file_id)] = {
                    "id": str(r.source_file_id),
                    "title": r.source_title,
                }

        return {
            "id": str(entity_row.id),
            "name": _clean_node_name(entity_row.name),
            "raw_name": entity_row.name,
            "type": entity_row.entity_type,
            "description": entity_row.description or "",
            "created_at": entity_row.created_at.isoformat() if entity_row.created_at else None,
            "relations": relations,
            "sources": list(sources.values()),
        }
