"""Auto-prompting vocabulary builder for Whisper STT based on knowledge base metadata."""

import logging
from typing import List, Optional
from sqlalchemy import select, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Source

logger = logging.getLogger(__name__)

DEFAULT_SYSTEM_VOCABULARY = ["PKA", "FastAPI", "PostgreSQL", "pgvector", "Docker", "Python", "React"]


async def build_user_vocabulary(db: AsyncSession, max_terms: int = 40) -> str:
    """
    Scans active sources for distinct domains and virtual folder segments,
    compiling an initial prompt to bias Whisper STT toward domain-specific terms.
    """
    vocab_set = set(DEFAULT_SYSTEM_VOCABULARY)

    try:
        # 1. Extract distinct domains
        domain_stmt = (
            select(distinct(Source.domain))
            .where(Source.is_deleted.is_(False), Source.domain.is_not(None))
        )
        domain_rows = (await db.execute(domain_stmt)).scalars().all()
        for domain in domain_rows:
            if domain and domain.strip():
                vocab_set.add(domain.strip())

        # 2. Extract distinct folder segments (if any exist)
        if hasattr(Source, 'folder_path'):
            folder_stmt = (
                select(distinct(Source.folder_path))
                .where(Source.is_deleted.is_(False), Source.folder_path.is_not(None))
            )
            folder_rows = (await db.execute(folder_stmt)).scalars().all()
            for folder in folder_rows:
                if folder:
                    segments = [seg.strip() for seg in folder.split("/") if seg.strip()]
                    vocab_set.update(segments)

    except Exception as e:
        logger.warning(f"[VocabularyBuilder] Failed to load vocabulary from DB: {e}. Falling back to default.")

    # Limit total vocabulary size to avoid Whisper context overflow
    limited_terms: List[str] = sorted(list(vocab_set))[:max_terms]
    initial_prompt = ", ".join(limited_terms) + "."

    logger.debug(f"[VocabularyBuilder] Compiled initial_prompt: {initial_prompt}")
    return initial_prompt
