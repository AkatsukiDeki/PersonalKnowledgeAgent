from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from core.config import WEBAPP_URL

def get_start_inline_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🚀 Запустить прямо сейчас", web_app=WebAppInfo(url=WEBAPP_URL))]
    ])

def get_scope_selection_keyboard(paths: list, current_scope: str | None) -> InlineKeyboardMarkup:
    keyboard = []
    for i, p in enumerate(paths[:20]):
        prefix = "✅ " if p == current_scope else "📁 "
        cb_data = f"scope_set:{i}"
        keyboard.append([InlineKeyboardButton(text=f"{prefix}{p}", callback_data=cb_data)])
        
    keyboard.append([InlineKeyboardButton(text="❌ Без ограничений (вся база)", callback_data="scope_set:none")])
    return InlineKeyboardMarkup(inline_keyboard=keyboard)

def get_folders_selection_keyboard(paths: list, upload_uuid: str) -> InlineKeyboardMarkup:
    keyboard = []
    for i, p in enumerate(paths[:10]):
        cb_data = f"folder:{upload_uuid}:{i}"
        keyboard.append([InlineKeyboardButton(text=f"📁 {p}", callback_data=cb_data)])
        
    keyboard.append([InlineKeyboardButton(text="➕ Создать папку", callback_data=f"new_folder:{upload_uuid}")])
    keyboard.append([InlineKeyboardButton(text="Без папки", callback_data=f"folder:{upload_uuid}:none")])
    return InlineKeyboardMarkup(inline_keyboard=keyboard)

def get_voice_transcribed_keyboard(upload_uuid: str) -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(text="🔍 Спросить базу", callback_data=f"ask_db:{upload_uuid}")],
        [InlineKeyboardButton(text="📁 Выбрать папку для сохранения", callback_data=f"save_voice:{upload_uuid}")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)

def get_citations_keyboard(cite_id: str, upload_uuid: str | None = None) -> InlineKeyboardMarkup:
    keyboard = []
    keyboard.append([InlineKeyboardButton(text="📚 Источники", callback_data=f"cite_{cite_id}")])
    if upload_uuid:
        keyboard.append([InlineKeyboardButton(text="📥 Сохранить войс в заметки", callback_data=f"save_voice:{upload_uuid}")])
    return InlineKeyboardMarkup(inline_keyboard=keyboard)
