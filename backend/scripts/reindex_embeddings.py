import sys
from pathlib import Path

# Корень проекта PKA
PROJECT_ROOT = Path(__file__).resolve().parents[2] if "backend" in str(Path(__file__).resolve()) else Path(__file__).resolve().parents[1]
BACKEND_DIR = PROJECT_ROOT / "backend"

for p in [str(PROJECT_ROOT), str(BACKEND_DIR), "/app"]:
    if p not in sys.path:
        sys.path.insert(0, p)

import asyncio
import logging
from sqlalchemy import select, delete

# Прямой импорт через backend.app
try:
    from backend.app.db.session import async_session_factory
    from backend.app.db.models import Source, Chunk
    from backend.app.knowledge.chunking import create_chunks
    from backend.app.knowledge.embeddings.factory import get_embedding_provider
except ModuleNotFoundError:
    from app.db.session import async_session_factory
    from app.db.models import Source, Chunk
    from app.knowledge.chunking import create_chunks
    from app.knowledge.embeddings.factory import get_embedding_provider