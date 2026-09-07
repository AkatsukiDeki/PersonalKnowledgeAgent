"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from pathlib import Path
import logging
import asyncio
import httpx

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import _rate_limit_exceeded_handler, SlowAPIMiddleware

from .api.router import api_router
from .core.config import settings
from .core.security import limiter
from .db.init_db import init_database
from .core.scheduler import scheduler
from .core.redis import init_redis_pool, close_redis_pool

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)

logger = logging.getLogger(__name__)

async def warmup_models():
    """Прогрев моделей в Ollama и фиксация в RAM."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        # 1. Прогрев эмбеддингов (bge-m3)
        try:
            logger.info("Warming up Ollama embedding model...")
            resp_emb = await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/embeddings",
                json={
                    "model": settings.OLLAMA_EMBEDDING_MODEL,
                    "prompt": "warmup test",
                    "keep_alive": "24h"
                }
            )
            resp_emb.raise_for_status()
            logger.info("Ollama embedding model ready.")
        except Exception as e:
            logger.warning(f"Failed to warmup embedding model: {e}")

        # 2. Прогрев генеративной QA-модели (qwen2.5:3b)
        try:
            logger.info(f"Warming up Ollama QA model ({settings.OLLAMA_QA_MODEL})...")
            resp_qa = await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": settings.OLLAMA_QA_MODEL,
                    "prompt": "ping",
                    "stream": False,
                    "keep_alive": "24h",
                    "options": {
                        "num_predict": 1,
                        "num_ctx": 2048
                    }
                }
            )
            resp_qa.raise_for_status()
            logger.info("Ollama QA model successfully pinned in RAM.")
        except Exception as e:
            logger.warning(f"Failed to warmup QA model: {e}")


async def warmup_loop():
    """Периодический пинг раз в 15 минут для предотвращения выгрузки ОС."""
    while True:
        await asyncio.sleep(900)
        await warmup_models()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Жизненный цикл сервиса."""
    await init_database()

    # Асинхронный прогрев без блокировки старта HTTP-сервера
    asyncio.create_task(warmup_models())
    warmup_task = asyncio.create_task(warmup_loop())

    await scheduler.start()
    app.state.redis = await init_redis_pool()

    yield

    warmup_task.cancel()
    await scheduler.stop()
    await close_redis_pool()


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url="/api/v1/openapi.json",
    docs_url="/docs",
    lifespan=lifespan,
)

uploads_dir = Path("/app/uploads")
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory="/app/uploads"), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://localhost:8090",
        "http://127.0.0.1:8090"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "app": settings.PROJECT_NAME}
