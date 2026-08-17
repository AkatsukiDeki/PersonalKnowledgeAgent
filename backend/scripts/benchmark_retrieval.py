import asyncio
import logging
import time

from app.db.session import async_session_factory
from app.knowledge.retrieval import hybrid_search

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Sample benchmark, should be extended with actual ground truth map
TEST_QUERIES = [
    "what framework is used for backend?",
    "how does docker compose help?",
    "what are the embedding dimensions?",
]

async def run_benchmark():
    logger.info("Starting retrieval benchmark...")
    
    async with async_session_factory() as db:
        latencies = []
        for query in TEST_QUERIES:
            start_time = time.time()
            results = await hybrid_search(db, query, query, limit=5)
            end_time = time.time()
            
            latency = (end_time - start_time) * 1000
            latencies.append(latency)
            
            logger.info(f"Query: '{query}' -> Latency: {latency:.2f}ms, Retrieved: {len(results)} chunks")
            # Calculate Precision@5 / Recall here if ground truth exists

        avg_latency = sum(latencies) / len(latencies)
        logger.info(f"Average Latency: {avg_latency:.2f}ms")

if __name__ == "__main__":
    asyncio.run(run_benchmark())
