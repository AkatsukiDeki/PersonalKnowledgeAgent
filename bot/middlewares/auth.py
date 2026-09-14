from typing import Callable, Dict, Any, Awaitable
from aiogram import BaseMiddleware
from aiogram.types import TelegramObject, Message, CallbackQuery

from core.config import ALLOWED_USERS

class AuthMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, Dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: Dict[str, Any]
    ) -> Any:
        user_id = None
        if isinstance(event, Message):
            user_id = event.from_user.id
        elif isinstance(event, CallbackQuery):
            user_id = event.from_user.id
            
        if user_id is not None and ALLOWED_USERS and user_id not in ALLOWED_USERS:
            if isinstance(event, CallbackQuery):
                await event.answer("У вас нет доступа.", show_alert=True)
            return None
            
        return await handler(event, data)
