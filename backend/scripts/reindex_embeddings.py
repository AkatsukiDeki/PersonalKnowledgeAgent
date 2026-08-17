import asyncio
import logging
from sqlalchemy import select, update, text
from app.db.session import async_session_factory
from app.db.models import Chunk
from app.knowledge.embeddings.factory import get_embedding_provider
from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def reindex_embeddings():
    provider = get_embedding_provider()
    logger.info(f"Starting reindex using provider: {provider.model_name} with dimension {provider.dimension}")
    
    async with async_session_factory() as db:
        # Check current dimension in DB, maybe update DDL if we need to
        # But this script focuses on the chunk data updates
        
        # We need to fetch chunks in batches
        batch_size = 100
        offset = 0
        
        while True:
            stmt = select(Chunk).order_by(Chunk.id).offset(offset).limit(batch_size)
            result = await db.execute(stmt)
            chunks = result.scalars().all()
            
            if not chunks:
                break
                
            logger.info(f"Processing batch of {len(chunks)} chunks (offset {offset})")
            
            texts = [chunk.text_content for chunk in chunks]
            embeddings = await provider.embed_documents(texts)
            
            # Update chunks
            for chunk, emb in zip(chunks, embeddings):
                chunk.embedding = emb
                # Optional: chunk.version = provider.version_tag
                
            await db.commit()
            offset += batch_size

    logger.info("Reindex complete.")

if __name__ == "__main__":
    asyncio.run(reindex_embeddings())
