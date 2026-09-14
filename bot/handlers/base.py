import uuid
from aiogram import Router, F
from aiogram.filters import CommandStart, Command, StateFilter
from aiogram.types import Message, CallbackQuery, MenuButtonWebApp, WebAppInfo
from aiogram.enums import ParseMode

from core.config import WEBAPP_URL
from core.loader import bot, redis_client
from keyboards.reply import get_main_app_keyboard
from keyboards.inline import get_start_inline_keyboard, get_scope_selection_keyboard
from services.backend_client import get_user_scope, set_user_scope, get_folders_tree
import json

base_router = Router()

def flatten_tree(tree, parent=""):
    paths = []
    for k, v in tree.items():
        current = f"{parent}/{k}" if parent else k
        paths.append(current)
        paths.extend(flatten_tree(v.get("children", {}), current))
    return paths

@base_router.message(CommandStart())
async def cmd_start(message: Message):
    user_id = message.from_user.id
    await redis_client.set(f"bot:user_conv:{user_id}", str(uuid.uuid4()), ex=7 * 86400)
    current = await get_user_scope(user_id)
    
    await bot.set_chat_menu_button(
        chat_id=message.chat.id,
        menu_button=MenuButtonWebApp(
            text="📱 Открыть PKA",
            web_app=WebAppInfo(url=WEBAPP_URL)
        )
    )
    
    await message.reply(
        "Привет! Я твой персональный AI-ассистент базы знаний.\n\n"
        f"✅ Кнопка меню обновлена на:\n`{WEBAPP_URL}`\n\n"
        "Ты можешь отправлять мне текст, голосовые сообщения или загружать файлы (pdf, txt, md) "
        "для пополнения базы.\n\n"
        "Открыть Mini App напрямую (без кэша):",
        reply_markup=get_start_inline_keyboard(),
        parse_mode="Markdown"
    )
    
    await message.answer(
        "Или используй меню ниже:",
        reply_markup=get_main_app_keyboard(current)
    )

@base_router.message(Command("scope"))
@base_router.message(F.text.startswith("🎯 Фокус"), StateFilter(None))
@base_router.message(F.text == "📂 Папки", StateFilter(None))
async def cmd_scope(message: Message):
    user_id = message.from_user.id
    current_scope = await get_user_scope(user_id)
    
    tree_data = await get_folders_tree()
    paths = flatten_tree(tree_data)
    
    await redis_client.set(f"bot:scope_options:{user_id}", json.dumps(paths), ex=600)
    
    markup = get_scope_selection_keyboard(paths, current_scope)
    await message.reply(f"Выберите папку для поиска (Текущая: *{current_scope or 'Вся база'}*):", reply_markup=markup, parse_mode=ParseMode.MARKDOWN)

@base_router.callback_query(F.data.startswith("scope_set:"))
async def callback_scope_set(callback: CallbackQuery):
    user_id = callback.from_user.id
    folder_idx = callback.data.split(":")[1]
    
    if folder_idx == "none":
        await set_user_scope(user_id, None)
        await callback.message.answer("🔍 Режим поиска: **Вся база знаний**", parse_mode=ParseMode.MARKDOWN, reply_markup=get_main_app_keyboard(None))
    else:
        raw = await redis_client.get(f"bot:scope_options:{user_id}")
        paths = json.loads(raw) if raw else []
        idx = int(folder_idx)
        if 0 <= idx < len(paths):
            folder_name = paths[idx]
            await set_user_scope(user_id, folder_name)
            await callback.message.answer(f"🔍 Режим поиска ограничен папкой: **{folder_name}**", parse_mode=ParseMode.MARKDOWN, reply_markup=get_main_app_keyboard(folder_name))
        else:
            await callback.answer("Ошибка выбора папки", show_alert=True)

@base_router.message(F.text == "🔄 Сброс", StateFilter(None))
async def handle_reset_scope_button(message: Message):
    await set_user_scope(message.from_user.id, None)
    await message.reply(
        "Фокус сброшен. Поиск снова идет по всей базе знаний.",
        reply_markup=get_main_app_keyboard(None)
    )

@base_router.message(Command("new", "reset"))
async def cmd_new(message: Message):
    await redis_client.set(f"bot:user_conv:{message.from_user.id}", str(uuid.uuid4()), ex=7 * 86400)
    await message.answer("Контекст беседы сброшен. Начинаем новую тему.")
