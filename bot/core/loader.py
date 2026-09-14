from redis.asyncio import Redis
from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.redis import RedisStorage, DefaultKeyBuilder
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from .config import TG_BOT_TOKEN, REDIS_URL

redis_client = Redis.from_url(REDIS_URL, decode_responses=True)
storage = RedisStorage(redis=redis_client, key_builder=DefaultKeyBuilder(with_bot_id=True))

bot = Bot(token=TG_BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.MARKDOWN))
dp = Dispatcher(storage=storage)
