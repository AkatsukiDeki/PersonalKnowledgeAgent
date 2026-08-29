"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.router import api_router
from .core.config import settings
from .core.security import limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import _rate_limit_exceeded_handler
from slowapi.middleware import SlowAPIMiddleware
from .db.init_db import init_database
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)


from .core.scheduler import scheduler
from .core.queue import task_queue
import httpx
import asyncio

async def warmup_models():
    """Warmup models in Ollama."""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            logging.getLogger(__name__).info("Warming up Ollama embedding model...")
            await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/embeddings", 
                json={
                    "model": settings.OLLAMA_EMBEDDING_MODEL, 
                    "prompt": "warmup", 
                    "keep_alive": -1,
                    "options": {"num_gpu": 0}
                }
            )
            logging.getLogger(__name__).info("Warming up Ollama QA model...")
            await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/generate", 
                json={"model": settings.OLLAMA_QA_MODEL, "prompt": "", "keep_alive": -1}
            )
            logging.getLogger(__name__).info("Ollama warmup completed successfully.")
    except Exception as e:
        logging.getLogger(__name__).warning(f"Failed to warmup models: {e}")

async def lifespan(app: FastAPI):
    """Run DB initialisation and background tasks on startup."""
    await init_database()
    
    # Execute warmup asynchronously without blocking DB startup
    asyncio.create_task(warmup_models())
    
    await scheduler.start()
    await task_queue.start(num_workers=2)
    yield
    await task_queue.stop()
    await scheduler.stop()


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url="/api/v1/openapi.json",
    docs_url="/docs",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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
