from fastapi import Request
from arq import ArqRedis, create_pool
from arq.connections import RedisSettings
from .config import settings

_redis_pool: ArqRedis | None = None


async def init_redis_pool() -> ArqRedis:
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = await create_pool(
            RedisSettings.from_dsn(settings.REDIS_URL),
            default_queue_name=settings.ARQ_QUEUE_NAME
        )
    return _redis_pool


async def close_redis_pool() -> None:
    global _redis_pool
    if _redis_pool is not None:
        await _redis_pool.close()
        _redis_pool = None


async def get_redis_pool(request: Request = None) -> ArqRedis:
    if request and hasattr(request.app.state, "redis") and request.app.state.redis:
        return request.app.state.redis
    if _redis_pool is not None:
        return _redis_pool
    return await init_redis_pool()
