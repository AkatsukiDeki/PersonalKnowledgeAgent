import asyncio
import logging
from sqlalchemy import select, delete
from app.db.session import async_session_factory
from app.db.models import Source, Chunk
from app.knowledge.chunking import create_chunks
from app.knowledge.embeddings.factory import get_embedding_provider

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def reindex_all_sources():
    provider = get_embedding_provider()
    logger.info(f"Starting reindex with provider: {provider.model_name} (dim: {provider.dimension})")

    async with async_session_factory() as db:
        stmt = select(Source).order_by(Source.created_at.asc())
        result = await db.execute(stmt)
        sources = result.scalars().all()

        logger.info(f"Found {len(sources)} sources to process.")

        for src in sources:
            text_data = src.content or src.raw_content
            if not text_data or not text_data.strip():
                logger.info(f"Skipping empty source: {src.title} (ID: {src.id})")
                continue

            logger.info(f"Re-chunking source: '{src.title}' (ID: {src.id})")

            await db.execute(delete(Chunk).where(Chunk.source_id == src.id))

            chunk_texts = create_chunks(text_data)
            if not chunk_texts:
                await db.commit()
                continue

            logger.info(f"Generated {len(chunk_texts)} chunks for source {src.id}. Computing embeddings...")

            embeddings = await provider.embed_documents(chunk_texts)

            for idx, (text_part, emb) in enumerate(zip(chunk_texts, embeddings)):
                new_chunk = Chunk(
                    source_id=src.id,
                    chunk_index=idx,
                    text_content=text_part,
                    embedding=emb,
                )
                db.add(new_chunk)

            await db.commit()
            logger.info(f"Source {src.id} successfully updated.")

    logger.info("Full re-indexing completed successfully.")

if __name__ == "__main__":
    asyncio.run(reindex_all_sources())
