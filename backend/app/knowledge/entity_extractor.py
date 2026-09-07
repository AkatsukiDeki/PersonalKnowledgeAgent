import json
import logging
from typing import List, Dict, Any, Optional
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

GRAPH_EXTRACTION_SYSTEM_PROMPT = """You are a knowledge graph extractor. 
Analyze the input text and extract key technical entities and semantic relationships between them.

Rules:
1. Extract canonical entity names (e.g. use "PostgreSQL" instead of "postgres db").
2. Types must be strictly one of: ["technology", "concept", "pattern", "tool", "person"].
3. Relations must be strictly one of: ["depends_on", "implements", "uses", "relates_to", "conflicts_with"].
4. Output MUST be a valid JSON object matching this schema:
{
  "entities": [
    {"name": "Entity Name", "type": "technology", "description": "Brief description"}
  ],
  "relations": [
    {"source": "Entity Name", "target": "Other Entity", "type": "uses", "weight": 1.0}
  ]
}
Do NOT include markdown formatting or explanations. Output pure JSON only."""


class EntityExtractor:
    def __init__(self, ollama_base_url: Optional[str] = None, model: Optional[str] = None):
        self.base_url = ollama_base_url or settings.OLLAMA_BASE_URL
        self.model = model or settings.OLLAMA_QA_MODEL

    async def extract_triplets(self, text: str) -> Dict[str, List[Dict[str, Any]]]:
        if not text or len(text.strip()) < 20:
            return {"entities": [], "relations": []}

        prompt = f"Text to extract from:\n\"\"\"\n{text}\n\"\"\""

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=10.0)) as client:
                response = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": self.model,
                        "system": GRAPH_EXTRACTION_SYSTEM_PROMPT,
                        "prompt": prompt,
                        "stream": False,
                        "format": "json",
                        "options": {
                            "temperature": 0.1,
                            "top_p": 0.9,
                        },
                    },
                )
                response.raise_for_status()
                data = response.json()
                raw_json = data.get("response", "{}")
                parsed = json.loads(raw_json)

                entities = parsed.get("entities", [])
                relations = parsed.get("relations", [])
                return {"entities": entities, "relations": relations}

        except Exception as exc:
            logger.error(f"[EntityExtractor] Triplet extraction failed: {exc}", exc_info=True)
            return {"entities": [], "relations": []}
