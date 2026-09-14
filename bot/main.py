import logging
import asyncio
from aiogram.types import MenuButtonWebApp, WebAppInfo

from core.loader import bot, dp, redis_client
from core.config import WEBAPP_URL
from middlewares.auth import AuthMiddleware

from handlers.base import base_router
from handlers.chat import chat_router
from handlers.media import media_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

async def on_startup():
    logger.info("Starting bot...")
    await bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(
            text="📱 Открыть PKA",
            web_app=WebAppInfo(url=WEBAPP_URL)
        )
    )

async def on_shutdown():
    logger.info("Shutting down bot...")
    await redis_client.aclose()

async def main():
    dp.startup.register(on_startup)
    dp.shutdown.register(on_shutdown)

    # Register Middlewares
    auth_middleware = AuthMiddleware()
    base_router.message.middleware(auth_middleware)
    base_router.callback_query.middleware(auth_middleware)
    
    chat_router.message.middleware(auth_middleware)
    chat_router.callback_query.middleware(auth_middleware)
    
    media_router.message.middleware(auth_middleware)
    media_router.callback_query.middleware(auth_middleware)

    # Register Routers
    dp.include_router(base_router)
    dp.include_router(media_router)
    dp.include_router(chat_router)

    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
