from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, WebAppInfo
from core.config import WEBAPP_URL

def get_main_app_keyboard(current_scope: str | None = None) -> ReplyKeyboardMarkup:
    scope_label = f"🎯 Фокус: {current_scope}" if current_scope else "🎯 Фокус"
    
    keyboard = [
        [KeyboardButton(text="📱 Открыть PKA", web_app=WebAppInfo(url=WEBAPP_URL))],
        [KeyboardButton(text=scope_label), KeyboardButton(text="🔄 Сброс")]
    ]
    return ReplyKeyboardMarkup(
        keyboard=keyboard,
        resize_keyboard=True,
        is_persistent=True
    )
