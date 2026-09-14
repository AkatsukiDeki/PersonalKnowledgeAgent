import os
import io
import json
import logging
import uuid
import time
from typing import Dict

import httpx
import json
from typing import Optional
from redis.asyncio import Redis
from aiogram.fsm.storage.redis import RedisStorage, DefaultKeyBuilder
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import CommandStart, Command, StateFilter
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery, ReplyKeyboardMarkup, KeyboardButton, PollAnswer, MenuButtonWebApp, WebAppInfo
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from dotenv import load_dotenv


class FolderCreation(StatesGroup):
    waiting_for_folder_name = State()

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TG_BOT_TOKEN = os.getenv("TG_BOT_TOKEN")
if not TG_BOT_TOKEN:
    raise ValueError("TG_BOT_TOKEN is not set")

ALLOWED_USERS_STR = os.getenv("TG_ALLOWED_USERS", "")
ALLOWED_USERS = set()
for uid in ALLOWED_USERS_STR.split(","):
    if uid.strip().isdigit():
        ALLOWED_USERS.add(int(uid.strip()))

BACKEND_API_URL = os.getenv("BACKEND_API_URL", "http://backend:8000/api/v1")
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://headed-construct-present-firm.trycloudflare.com")

REDIS_URL = os.getenv("BOT_REDIS_URL", "redis://redis:6379/1")

redis_client = Redis.from_url(REDIS_URL, decode_responses=True)
storage = RedisStorage(redis=redis_client, key_builder=DefaultKeyBuilder(with_bot_id=True))

bot = Bot(token=TG_BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.MARKDOWN))
dp = Dispatcher(storage=storage)

# --- Redis Data Layer Helpers ---

async def get_user_conversation(user_id: int) -> Optional[str]:
    return await redis_client.get(f"bot:user_conv:{user_id}")

async def set_user_conversation(user_id: int, conv_id: str, ttl_days: int = 7) -> None:
    await redis_client.set(f"bot:user_conv:{user_id}", conv_id, ex=ttl_days * 86400)

async def clear_user_conversation(user_id: int) -> None:
    await redis_client.delete(f"bot:user_conv:{user_id}")

async def set_cached_citation(citation_key: str, citation_text: str, ttl_sec: int = 86400) -> None:
    await redis_client.set(f"bot:citation:{citation_key}", citation_text, ex=ttl_sec)

async def get_cached_citation(citation_key: str) -> Optional[str]:
    return await redis_client.get(f"bot:citation:{citation_key}")

async def set_pending_upload(upload_uuid: str, data: dict, ttl_sec: int = 900) -> None:
    await redis_client.set(f"bot:pending_upload:{upload_uuid}", json.dumps(data), ex=ttl_sec)

async def get_pending_upload(upload_uuid: str) -> Optional[dict]:
    raw = await redis_client.get(f"bot:pending_upload:{upload_uuid}")
    return json.loads(raw) if raw else None

async def delete_pending_upload(upload_uuid: str) -> None:
    await redis_client.delete(f"bot:pending_upload:{upload_uuid}")

async def set_scope_options(user_id: int, options: list, ttl_sec: int = 600) -> None:
    await redis_client.set(f"bot:scope_options:{user_id}", json.dumps(options), ex=ttl_sec)

async def get_scope_options(user_id: int) -> list:
    raw = await redis_client.get(f"bot:scope_options:{user_id}")
    return json.loads(raw) if raw else []

async def clear_scope_options(user_id: int) -> None:
    await redis_client.delete(f"bot:scope_options:{user_id}")


async def get_user_scope(user_id: int) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{BACKEND_API_URL}/auth/bot/scope/{user_id}")
            if resp.status_code == 200:
                return resp.json().get("folder_name")
    except Exception as e:
        logger.error(f"Failed to fetch user scope: {e}")
    return None

async def set_user_scope(user_id: int, folder_name: str | None):
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(f"{BACKEND_API_URL}/auth/bot/scope", json={"user_id": user_id, "folder_name": folder_name})
    except Exception as e:
        logger.error(f"Failed to set user scope: {e}")

def is_user_allowed(user_id: int) -> bool:
    if not ALLOWED_USERS:
        return True  # If empty, allow anyone (or you can restrict to False)
    return user_id in ALLOWED_USERS


def escape_md(text: str) -> str:
    # Telegram MarkdownV2 requires escaping these characters
    escape_chars = r"_*[]()~`>#+-=|{}.!"
    for c in escape_chars:
        text = text.replace(c, f"\\{c}")
    return text


async def send_chunked_message(message: Message, text: str, parse_mode: ParseMode | None = ParseMode.MARKDOWN, reply_markup=None):
    # Telegram max length is 4096
    MAX_LEN = 4000
    for i in range(0, len(text), MAX_LEN):
        chunk = text[i : i + MAX_LEN]
        is_last = (i + MAX_LEN >= len(text))
        markup = reply_markup if is_last else None
        try:
            await message.answer(chunk, parse_mode=parse_mode, reply_markup=markup)
        except Exception as e:
            logger.error(f"Failed to send chunk with parse_mode={parse_mode}: {e}")
            if parse_mode is not None:
                # Fallback to clear text
                await message.answer(chunk, parse_mode=None, reply_markup=markup)


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


@dp.message(CommandStart())
async def cmd_start(message: Message):
    if not is_user_allowed(message.from_user.id):
        return
    await set_user_conversation(message.from_user.id, str(uuid.uuid4()))
    current = await get_user_scope(message.from_user.id)
    
    # Жестко перезаписываем кнопку меню для текущего чата
    await bot.set_chat_menu_button(
        chat_id=message.chat.id,
        menu_button=MenuButtonWebApp(
            text="📱 Открыть PKA",
            web_app=WebAppInfo(url=WEBAPP_URL)
        )
    )
    
    inline_kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🚀 Запустить прямо сейчас", web_app=WebAppInfo(url=WEBAPP_URL))]
    ])
    
    await message.reply(
        "Привет! Я твой персональный AI-ассистент базы знаний.\n\n"
        f"✅ Кнопка меню обновлена на:\n`{WEBAPP_URL}`\n\n"
        "Ты можешь отправлять мне текст, голосовые сообщения или загружать файлы (pdf, txt, md) "
        "для пополнения базы.\n\n"
        "Открыть Mini App напрямую (без кэша):",
        reply_markup=inline_kb,
        parse_mode="Markdown"
    )
    
    # Также обновляем основную клавиатуру
    await message.answer(
        "Или используй меню ниже:",
        reply_markup=get_main_app_keyboard(current)
    )

@dp.message(Command("scope"))
@dp.message(F.text.startswith("🎯 Фокус"), StateFilter(None))
async def cmd_scope(message: Message):
    if not is_user_allowed(message.from_user.id):
        return

    user_id = message.from_user.id
    current_scope = await get_user_scope(user_id)
    
    keyboard = []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{BACKEND_API_URL}/sources/folders/tree")
            if resp.status_code == 200:
                tree_data = resp.json().get("children", {})
                paths = flatten_tree(tree_data)
                
                await set_scope_options(user_id, paths)
                
                for i, p in enumerate(paths[:20]):
                    prefix = "✅ " if p == current_scope else "📁 "
                    cb_data = f"scope_set:{i}"
                    keyboard.append([InlineKeyboardButton(text=f"{prefix}{p}", callback_data=cb_data)])
    except Exception as e:
        logger.error(f"Failed to fetch folders for scope: {e}")
        
    keyboard.append([InlineKeyboardButton(text="❌ Без ограничений (вся база)", callback_data="scope_set:none")])
    markup = InlineKeyboardMarkup(inline_keyboard=keyboard)
    
    await message.reply(f"Выберите папку для поиска (Текущая: *{current_scope or 'Вся база'}*):", reply_markup=markup, parse_mode=ParseMode.MARKDOWN)

@dp.callback_query(F.data.startswith("scope_set:"))
async def callback_scope_set(callback: CallbackQuery):
    if not is_user_allowed(callback.from_user.id):
        return await callback.answer("У вас нет доступа.", show_alert=True)
        
    user_id = callback.from_user.id
    folder_idx = callback.data.split(":")[1]
    
    if folder_idx == "none":
        await set_user_scope(user_id, None)
        await callback.message.answer("🔍 Режим поиска: **Вся база знаний**", parse_mode=ParseMode.MARKDOWN, reply_markup=get_main_app_keyboard(None))
    else:
        paths = await get_scope_options(user_id)
        idx = int(folder_idx)
        if 0 <= idx < len(paths):
            folder_name = paths[idx]
            await set_user_scope(user_id, folder_name)
            await callback.message.answer(f"🔍 Режим поиска ограничен папкой: **{folder_name}**", parse_mode=ParseMode.MARKDOWN, reply_markup=get_main_app_keyboard(folder_name))
        else:
            await callback.answer("Ошибка выбора папки", show_alert=True)
            
@dp.message(F.text == "🔄 Сброс", StateFilter(None))
async def handle_reset_scope_button(message: Message):
    await set_user_scope(message.from_user.id, None)
    await message.reply(
        "Фокус сброшен. Поиск снова идет по всей базе знаний.",
        reply_markup=get_main_app_keyboard(None)
    )

@dp.message(F.text == "📂 Папки", StateFilter(None))
async def handle_folders_button(message: Message):
    await cmd_scope(message)

@dp.message(Command("new", "reset"))
async def cmd_new(message: Message):
    if not is_user_allowed(message.from_user.id):
        return
    await set_user_conversation(message.from_user.id, str(uuid.uuid4()))
    await message.answer("Контекст беседы сброшен. Начинаем новую тему.")

@dp.message(Command("newfolder"))
async def cmd_create_folder(message: Message):
    if not is_user_allowed(message.from_user.id):
        return
    parts = message.text.strip().split(maxsplit=1)
    if len(parts) < 2:
        await message.reply("Использование: `/newfolder <название папки>`\nПример: `/newfolder Эконометрика`", parse_mode=ParseMode.MARKDOWN)
        return

    folder_name = parts[1].strip()
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{BACKEND_API_URL}/subjects", 
            json={"title": folder_name, "description": ""}
        )

    if resp.status_code in (200, 201):
        await message.reply(f"Папка *«{folder_name}»* успешно создана и готова к использованию!", parse_mode=ParseMode.MARKDOWN)
    else:
        await message.reply(f"Ошибка создания папки ({resp.status_code}): {resp.text[:200]}")


def flatten_tree(tree, parent=""):
    paths = []
    for k, v in tree.items():
        current = f"{parent}/{k}" if parent else k
        paths.append(current)
        paths.extend(flatten_tree(v.get("children", {}), current))
    return paths

async def get_folders_keyboard(upload_uuid: str):
    keyboard = []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{BACKEND_API_URL}/sources/folders/tree")
            if resp.status_code == 200:
                tree_data = resp.json().get("children", {})
                paths = flatten_tree(tree_data)
                
                if await get_pending_upload(upload_uuid):
                    upload_data = await get_pending_upload(upload_uuid)
                if upload_data:
                    upload_data["folders"] = paths
                    await set_pending_upload(upload_uuid, upload_data)
                
                for i, p in enumerate(paths[:10]):
                    cb_data = f"folder:{upload_uuid}:{i}"
                    keyboard.append([InlineKeyboardButton(text=f"📁 {p}", callback_data=cb_data)])
    except Exception as e:
        logger.error(f"Failed to fetch folders: {e}")
    
    keyboard.append([InlineKeyboardButton(text="➕ Создать папку", callback_data=f"new_folder:{upload_uuid}")])
    keyboard.append([InlineKeyboardButton(text="Без папки", callback_data=f"folder:{upload_uuid}:none")])
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


@dp.message(F.content_type == types.ContentType.VOICE)
async def handle_voice(message: Message):
    if not is_user_allowed(message.from_user.id):
        return

    # Clean up old pending uploads (older than 1 hour)
    # Pending uploads TTL handled by Redis automatically

    await bot.send_chat_action(message.chat.id, action="typing")
    status_msg = await message.answer("Слушаю...")
    
    try:
        voice = message.voice
        file = await bot.get_file(voice.file_id)
        
        file_buffer = io.BytesIO()
        await bot.download_file(file.file_path, destination=file_buffer)
        file_buffer.seek(0)
        
        await status_msg.edit_text("Транскрибирую...")
        
        async with httpx.AsyncClient(timeout=130.0) as client:
            files = {"file": ("voice.ogg", file_buffer, "audio/ogg")}
            resp = await client.post(f"{BACKEND_API_URL}/media/transcribe-quick", files=files)
            resp.raise_for_status()
            text = resp.json().get("text", "").strip()
            
            if not text:
                return await status_msg.edit_text("Не удалось распознать речь.")

            is_question = text.endswith("?") or text.lower().startswith(("как", "что", "где", "почему", "зачем", "кто", "когда", "расскажи", "о чем", "какие"))
            
            # Save to pending_uploads for both cases
            upload_uuid = uuid.uuid4().hex[:8]
            await set_pending_upload(upload_uuid, {
                "user_id": message.from_user.id,
                "file_id": voice.file_id,
                "file_name": "voice.ogg",
                "mime_type": "audio/ogg",
                "type": "voice",
                "created_at": time.time(),
                "text": text
            })
            
            if is_question:
                await status_msg.edit_text(f"🗣 **Вопрос:** _{text}_\n\nИщу ответ...", parse_mode=ParseMode.MARKDOWN)
                
                user_id = message.from_user.id
                if not await get_user_conversation(user_id):
                    await set_user_conversation(user_id, str(uuid.uuid4()))
                conv_id = await get_user_conversation(user_id)
                
                payload = {
                    "query": text,
                    "conversation_id": conv_id,
                    "chat_mode": "vault",
                    "use_reasoning": False
                }
                chat_resp = await client.post(f"{BACKEND_API_URL}/chat/message", json=payload, timeout=60.0)
                chat_resp.raise_for_status()
                data = chat_resp.json()
                answer = data.get("answer", "")
                citations = data.get("citations", [])
                
                # Combine citations markup
                keyboard = []
                if citations:
                    citations_text = "📚 **Источники:**\n\n"
                    for i, c in enumerate(citations, 1):
                        title = c.get("source_title") or "Неизвестный источник"
                        snippet = c.get("text_snippet", "").replace("\n", " ")[:150]
                        citations_text += f"{i}. *{title}*\n_{snippet}..._\n\n"
                    
                    cite_id = str(uuid.uuid4())[:8]
                    await set_cached_citation(cite_id, citations_text)
                    keyboard.append([InlineKeyboardButton(text="📚 Источники", callback_data=f"cite_{cite_id}")])
                
                keyboard.append([InlineKeyboardButton(text="📥 Сохранить войс в заметки", callback_data=f"save_voice:{upload_uuid}")])
                
                markup = InlineKeyboardMarkup(inline_keyboard=keyboard)
                await status_msg.delete()
                await send_chunked_message(message, answer, parse_mode=ParseMode.MARKDOWN, reply_markup=markup)

            else:
                # This is a note
                keyboard = [
                    [InlineKeyboardButton(text="🔍 Спросить базу", callback_data=f"ask_db:{upload_uuid}")],
                    [InlineKeyboardButton(text="📁 Выбрать папку для сохранения", callback_data=f"save_voice:{upload_uuid}")]
                ]
                markup = InlineKeyboardMarkup(inline_keyboard=keyboard)
                await status_msg.edit_text(f"🗣 **Транскрипция:**\n_{text}_", parse_mode=ParseMode.MARKDOWN, reply_markup=markup)

    except Exception as e:
        logger.exception("Error handling voice message")
        await status_msg.edit_text(f"Произошла ошибка при загрузке аудио: {e}")



@dp.message(F.content_type == types.ContentType.DOCUMENT)
async def handle_document_upload(message: Message):
    if not is_user_allowed(message.from_user.id):
        return

    doc = message.document
    
    # Защита от превышения лимита Bot API (20 MB)
    if doc.file_size > 20 * 1024 * 1024:
        await message.answer("Файл превышает 20 МБ. Загрузите его через веб-панель PKA.")
        return

    # Clean up old pending uploads (older than 1 hour)
    # Pending uploads TTL handled by Redis automatically

    upload_uuid = uuid.uuid4().hex[:8]
    await set_pending_upload(upload_uuid, {
        "user_id": message.from_user.id,
        "file_id": doc.file_id,
        "file_name": doc.file_name,
        "mime_type": doc.mime_type or "application/octet-stream",
        "type": "document",
        "created_at": time.time()
    })

    markup = await get_folders_keyboard(upload_uuid)
    await message.answer(f"В какую папку сохранить документ `{doc.file_name}`?", reply_markup=markup)


@dp.callback_query(F.data.startswith("new_folder:"))
async def callback_prompt_new_folder(callback: CallbackQuery, state: FSMContext):
    if not is_user_allowed(callback.from_user.id):
        return await callback.answer("У вас нет доступа.", show_alert=True)
        
    upload_uuid = callback.data.split(":")[1]
    
    await state.set_state(FolderCreation.waiting_for_folder_name)
    await state.update_data(active_upload_uuid=upload_uuid)
    
    await callback.message.edit_text(
        "Введите название новой папки для этого файла ответом на это сообщение:"
    )
    await callback.answer()

@dp.message(FolderCreation.waiting_for_folder_name)
async def process_folder_name_and_save(message: Message, state: FSMContext):
    folder_name = message.text.strip()
    data = await state.get_data()
    upload_uuid = data.get("active_upload_uuid")
    await state.clear()

    if upload_uuid and await get_pending_upload(upload_uuid):
        file_meta = await get_pending_upload(upload_uuid)
        await delete_pending_upload(upload_uuid)
        status_msg = await message.reply(f"Создана виртуальная папка *«{folder_name}»*. Загружаю файл...", parse_mode=ParseMode.MARKDOWN)
        await process_upload_with_folder(file_meta, folder_name, status_msg, bot)
    else:
        await message.reply(f"Виртуальная папка *«{folder_name}»* будет создана при первой загрузке файла.")


@dp.message(F.content_type == types.ContentType.TEXT, StateFilter(None))
async def handle_text(message: Message):
    if not is_user_allowed(message.from_user.id):
        return

    user_id = message.from_user.id
    if not await get_user_conversation(user_id):
        await set_user_conversation(user_id, str(uuid.uuid4()))
    conv_id = await get_user_conversation(user_id)

    await bot.send_chat_action(message.chat.id, action="typing")
    
    try:
        payload = {
            "query": message.text,
            "conversation_id": conv_id,
            "chat_mode": "vault",
            "use_reasoning": False
        }
        
        scope = await get_user_scope(user_id)
        if scope:
            payload["scope_folder"] = scope
            
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{BACKEND_API_URL}/chat", json=payload)
            resp.raise_for_status()
            data = resp.json()
            
            answer = data.get("answer", "")
            if not answer:
                answer = "Пустой ответ от сервера."
                
            citations = data.get("citations", [])
            reply_markup = None
            if citations:
                citations_text = "📚 **Источники:**\n\n"
                for i, c in enumerate(citations, 1):
                    title = c.get("source_title") or "Неизвестный источник"
                    snippet = c.get("text_snippet", "").replace("\n", " ")[:150]
                    # Escape special characters for snippet if needed, but we'll rely on parse_mode=MARKDOWN fallback
                    citations_text += f"{i}. *{escape_md(title)}*\n_{escape_md(snippet)}..._\n\n"
                
                cite_id = str(uuid.uuid4())[:8]
                await set_cached_citation(cite_id, citations_text)
                
                btn = InlineKeyboardButton(text="📚 Источники", callback_data=f"cite_{cite_id}")
                reply_markup = InlineKeyboardMarkup(inline_keyboard=[[btn]])
                
            # Attempt to send markdown, fallback inside the function
            await send_chunked_message(message, answer, parse_mode=ParseMode.MARKDOWN, reply_markup=reply_markup)
            
    except Exception as e:
        logger.exception("Error handling text message")
        await message.answer(f"Произошла ошибка при общении с базой знаний: {e}")


@dp.callback_query(F.data.startswith("cite_"))
async def callback_cite(callback: CallbackQuery):
    if not is_user_allowed(callback.from_user.id):
        return await callback.answer("У вас нет доступа.", show_alert=True)
        
    cite_id = callback.data.split("_", 1)[1]
    text = await get_cached_citation(cite_id)
    if text:
        # Use a normal send message to the chat
        await send_chunked_message(callback.message, text, parse_mode=ParseMode.MARKDOWN)
        await callback.answer()
    else:
        await callback.answer("Источники устарели или не найдены", show_alert=True)

async def process_upload_with_folder(upload_data: dict, folder_name: str, message: Message, bot_instance: Bot):
    file_name = upload_data["file_name"]
    file_type = upload_data["type"]
    
    try:
        file_info = await bot_instance.get_file(upload_data["file_id"])
        file_buffer = io.BytesIO()
        await bot_instance.download_file(file_info.file_path, destination=file_buffer)
        file_buffer.seek(0)
        
        await message.edit_text(f"Отправляю `{file_name}` в конвейер обработки...")
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            files = {
                "file": (file_name, file_buffer, upload_data["mime_type"])
            }
            data = {}
            if folder_name != "none":
                data["folder"] = folder_name
                
            if file_type == "voice":
                data["fast_mode"] = "true"
                resp = await client.post(f"{BACKEND_API_URL}/media/upload", files=files, data=data)
            else:
                resp = await client.post(f"{BACKEND_API_URL}/sources/upload", files=files, data=data)
                
            resp.raise_for_status()
            
            folder_text = f" (в папку `{folder_name}`)" if folder_name != "none" else ""
            await message.edit_text(f"Файл `{file_name}` успешно принят и отправлен на индексацию!{folder_text}")
            
    except Exception as e:
        logger.exception("Error uploading pending file")
        await message.edit_text(f"Произошла ошибка при загрузке: {e}")



@dp.callback_query(F.data.startswith("folder:"))
async def callback_folder_selection(callback: CallbackQuery):
    if not is_user_allowed(callback.from_user.id):
        return await callback.answer("У вас нет доступа.", show_alert=True)
    
    _, upload_uuid, folder_idx = callback.data.split(":")
    
    upload_data = await get_pending_upload(upload_uuid)
    if not upload_data:
        return await callback.answer("Время ожидания истекло или файл уже загружен.", show_alert=True)
        
    if upload_data["user_id"] != callback.from_user.id:
        return await callback.answer("Это не ваш файл.", show_alert=True)

    await delete_pending_upload(upload_uuid)
    
    folder_name = "none"
    if folder_idx != "none":
        folders = upload_data.get("folders", [])
        idx = int(folder_idx)
        if 0 <= idx < len(folders):
            folder_name = folders[idx]
    
    file_name = upload_data["file_name"]
    await callback.message.edit_text(f"Скачиваю `{file_name}`...")
    
    await process_upload_with_folder(upload_data, folder_name, callback.message, bot)

@dp.callback_query(F.data.startswith("ask_db:"))
async def callback_ask_db(callback: CallbackQuery):
    if not is_user_allowed(callback.from_user.id):
        return await callback.answer("У вас нет доступа.", show_alert=True)
    
    upload_uuid = callback.data.split(":")[1]
    upload_data = await get_pending_upload(upload_uuid)
    if not upload_data or "text" not in upload_data:
        return await callback.answer("Время ожидания истекло.", show_alert=True)
        
    text = upload_data["text"]
    await callback.message.edit_reply_markup(reply_markup=None)
    
    user_id = callback.from_user.id
    if not await get_user_conversation(user_id):
        await set_user_conversation(user_id, str(uuid.uuid4()))
    conv_id = await get_user_conversation(user_id)
    
    await callback.message.reply(f"Ищу ответ на: _{text}_...", parse_mode=ParseMode.MARKDOWN)
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            payload = {
                "query": text,
                "conversation_id": conv_id,
                "chat_mode": "vault",
                "use_reasoning": False
            }
            
            scope = user_scopes.get(user_id)
            if scope:
                payload["scope_folder"] = scope
                
            chat_resp = await client.post(f"{BACKEND_API_URL}/chat/message", json=payload)
            chat_resp.raise_for_status()
            data = chat_resp.json()
            answer = data.get("answer", "")
            citations = data.get("citations", [])
            
            keyboard = []
            if citations:
                citations_text = "📚 **Источники:**\n\n"
                for i, c in enumerate(citations, 1):
                    title = c.get("source_title") or "Неизвестный источник"
                    snippet = c.get("text_snippet", "").replace("\n", " ")[:150]
                    citations_text += f"{i}. *{title}*\n_{snippet}..._\n\n"
                
                cite_id = str(uuid.uuid4())[:8]
                await set_cached_citation(cite_id, citations_text)
                keyboard.append([InlineKeyboardButton(text="📚 Источники", callback_data=f"cite_{cite_id}")])
            
            keyboard.append([InlineKeyboardButton(text="📥 Сохранить войс в заметки", callback_data=f"save_voice:{upload_uuid}")])
            markup = InlineKeyboardMarkup(inline_keyboard=keyboard)
            
            await send_chunked_message(callback.message, answer, parse_mode=ParseMode.MARKDOWN, reply_markup=markup)
    except Exception as e:
        await callback.message.reply(f"Ошибка: {e}")

@dp.callback_query(F.data.startswith("save_voice:"))
async def callback_save_voice(callback: CallbackQuery):
    if not is_user_allowed(callback.from_user.id):
        return await callback.answer("У вас нет доступа.", show_alert=True)
    
    upload_uuid = callback.data.split(":")[1]
    if not await get_pending_upload(upload_uuid):
        return await callback.answer("Время ожидания истекло.", show_alert=True)
        
    markup = await get_folders_keyboard(upload_uuid)
    await callback.message.edit_reply_markup(reply_markup=None)
    await callback.message.reply("В какую папку сохранить голосовую заметку?", reply_markup=markup)

async def main():
    logger.info("Starting bot...")
    await bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(
            text="📱 Открыть PKA",
            web_app=WebAppInfo(url=WEBAPP_URL)
        )
    )
    await dp.start_polling(bot)



async def on_shutdown():
    await redis_client.aclose()
    
dp.shutdown.register(on_shutdown)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
