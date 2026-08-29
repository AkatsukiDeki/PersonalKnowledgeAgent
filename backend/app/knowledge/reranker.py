import logging
from typing import List, Dict, Any
from flashrank import Ranker, RerankRequest
from ..core.config import PROJECT_ROOT

logger = logging.getLogger(__name__)

class RerankService:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(RerankService, cls).__new__(cls, *args, **kwargs)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
            
        self.model_name = "ms-marco-TinyBERT-L-2-v2"
        self.ranker = None
        self._cache_dir = PROJECT_ROOT / ".cache" / "flashrank"
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        self._initialized = True
        logger.info("RerankService initialized (lazy load mode).")

    def _get_ranker(self):
        if self.ranker is None:
            logger.info(f"Loading FlashRank model: {self.model_name}")
            self.ranker = Ranker(model_name=self.model_name, cache_dir=str(self._cache_dir))
        return self.ranker

    def rerank(self, query: str, candidates: List[Dict[str, Any]], top_n: int = 3) -> List[Dict[str, Any]]:
        """
        Rerank a list of candidates. Each candidate must have a 'text_content' field.
        """
        if not candidates:
            return []

        passages = []
        for i, c in enumerate(candidates):
            text = c.get("text_content", "")
            if not text:
                text = ""
            passages.append({
                "id": str(i),
                "text": text
            })

        rankrequest = RerankRequest(query=query, passages=passages)
        ranker = self._get_ranker()
        results = ranker.rerank(rankrequest)

        reranked = []
        for r in results[:top_n]:
            idx = int(r["id"])
            candidate = candidates[idx].copy()
            candidate["rerank_score"] = r.get("score", 0.0)
            reranked.append(candidate)
            
        return reranked

rerank_service = RerankService()
