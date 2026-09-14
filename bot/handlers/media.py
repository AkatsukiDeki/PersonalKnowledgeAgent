import io
import uuid
import time
import json
import logging
import asyncio
from aiogram import Router, F
from aiogram.types import Message, CallbackQuery, ContentType
from aiogram.fsm.context import FSMContext
from aiogram.enums import ParseMode

from core.loader import bot, redis_client
from core.states import FolderCreation
from keyboards.inline import get_folders_selection_keyboard, get_voice_transcribed_keyboard
from services.backend_client import upload_file, poll_task_status, create_folder

logger = logging.getLogger(__name__)
media_router = Router()

async def track_task_progress(task_id: str, message: Message, final_text_template: str, upload_uuid: str):
    """Опрашивает статус задачи и обновляет сообщение."""
    last_text = ""
    while True:
        status_data = await poll_task_status(task_id, max_retries=1)
        status = status_data.get("status")
        
        if status == "failed":
            await message.edit_text(f"❌ Ошибка обработки: {status_data.get('error', 'Неизвестная ошибка')}")
            return None
            
        if status == "completed":
            break
            
        step = status_data.get("step", "В очереди")
        progress = status_data.get("progress", 0)
        
        text = f"⏳ Обработка файла... {progress}%\nТекущий этап: {step}"
        if text != last_text:
            try:
                await message.edit_text(text)
                last_text = text
            except Exception:
                pass
        await asyncio.sleep(2.5)

    try:
        # Успешное завершение
        source_id = status_data.get("source_id")
        await message.edit_text(final_text_template)
        return source_id
    except Exception as e:
        logger.error(f"Error finalizing task message: {e}")
        return None


@media_router.message(F.content_type == ContentType.VOICE)
async def handle_voice(message: Message):
    status_msg = await message.answer("Слушаю... Скачиваю аудио...")
    try:
        voice = message.voice
        file = await bot.get_file(voice.file_id)
        
        file_buffer = io.BytesIO()
        await bot.download_file(file.file_path, destination=file_buffer)
        file_buffer.seek(0)
        
        await status_msg.edit_text("Отправляю аудио на сервер...")
        task_id = await upload_file("voice.ogg", file_buffer.read(), "audio/ogg", "none", is_voice=True)
        
        if not task_id:
            return await status_msg.edit_text("Ошибка загрузки файла на сервер.")
            
        upload_uuid = uuid.uuid4().hex[:8]
        # Сохраняем во временный кэш
        meta = {
            "user_id": message.from_user.id,
            "type": "voice",
            "task_id": task_id
        }
        await redis_client.set(f"bot:pending_upload:{upload_uuid}", json.dumps(meta), ex=3600)
        
        # Запускаем поллинг прогресса
        final_text = "Голосовая заметка успешно транскрибирована и сохранена!"
        source_id = await track_task_progress(task_id, status_msg, final_text, upload_uuid)
        
        if source_id:
            # Успешно, можно дать опции
            markup = get_voice_transcribed_keyboard(upload_uuid)
            await status_msg.edit_reply_markup(reply_markup=markup)
            
    except Exception as e:
        logger.exception("Error handling voice message")
        await status_msg.edit_text(f"Произошла ошибка при загрузке аудио: {e}")


@media_router.message(F.content_type == ContentType.DOCUMENT)
async def handle_document_upload(message: Message):
    doc = message.document
    if doc.file_size > 20 * 1024 * 1024:
        return await message.answer("Файл превышает 20 МБ. Загрузите его через веб-панель PKA.")

    upload_uuid = uuid.uuid4().hex[:8]
    meta = {
        "user_id": message.from_user.id,
        "file_id": doc.file_id,
        "file_name": doc.file_name,
        "mime_type": doc.mime_type or "application/octet-stream",
        "type": "document"
    }
    await redis_client.set(f"bot:pending_upload:{upload_uuid}", json.dumps(meta), ex=3600)

    from services.backend_client import get_folders_tree
    from handlers.base import flatten_tree
    
    tree_data = await get_folders_tree()
    paths = flatten_tree(tree_data)
    
    meta["folders"] = paths
    await redis_client.set(f"bot:pending_upload:{upload_uuid}", json.dumps(meta), ex=3600)

    markup = get_folders_selection_keyboard(paths, upload_uuid)
    await message.answer(f"В какую папку сохранить документ `{doc.file_name}`?", reply_markup=markup)

@media_router.callback_query(F.data.startswith("new_folder:"))
async def callback_prompt_new_folder(callback: CallbackQuery, state: FSMContext):
    upload_uuid = callback.data.split(":")[1]
    
    await state.set_state(FolderCreation.waiting_for_folder_name)
    await state.update_data(active_upload_uuid=upload_uuid)
    
    await callback.message.edit_text(
        "Введите название новой папки для этого файла ответом на это сообщение:"
    )
    await callback.answer()

@media_router.message(FolderCreation.waiting_for_folder_name)
async def process_folder_name_and_save(message: Message, state: FSMContext):
    folder_name = message.text.strip()
    data = await state.get_data()
    upload_uuid = data.get("active_upload_uuid")
    await state.clear()
    
    await create_folder(folder_name)
    
    raw = await redis_client.get(f"bot:pending_upload:{upload_uuid}")
    if raw:
        upload_data = json.loads(raw)
        status_msg = await message.reply(f"Папка *«{folder_name}»* создана. Загружаю файл...", parse_mode=ParseMode.MARKDOWN)
        await start_document_upload(upload_data, folder_name, status_msg)
    else:
        await message.reply(f"Папка *«{folder_name}»* создана.")

@media_router.callback_query(F.data.startswith("folder:"))
async def callback_folder_selection(callback: CallbackQuery):
    _, upload_uuid, folder_idx = callback.data.split(":")
    
    raw = await redis_client.get(f"bot:pending_upload:{upload_uuid}")
    if not raw:
        return await callback.answer("Время ожидания истекло.", show_alert=True)
        
    upload_data = json.loads(raw)
    if upload_data["user_id"] != callback.from_user.id:
        return await callback.answer("Это не ваш файл.", show_alert=True)

    folder_name = "none"
    if folder_idx != "none":
        folders = upload_data.get("folders", [])
        idx = int(folder_idx)
        if 0 <= idx < len(folders):
            folder_name = folders[idx]
    
    file_name = upload_data["file_name"]
    await callback.message.edit_text(f"Скачиваю `{file_name}`...")
    
    await start_document_upload(upload_data, folder_name, callback.message)

async def start_document_upload(upload_data: dict, folder_name: str, message: Message):
    file_name = upload_data["file_name"]
    try:
        file_info = await bot.get_file(upload_data["file_id"])
        file_buffer = io.BytesIO()
        await bot.download_file(file_info.file_path, destination=file_buffer)
        file_buffer.seek(0)
        
        await message.edit_text(f"Отправляю `{file_name}` на сервер...")
        task_id = await upload_file(file_name, file_buffer.read(), upload_data["mime_type"], folder_name)
        
        if not task_id:
            return await message.edit_text("Ошибка отправки файла.")
            
        final_text = f"Файл `{file_name}` успешно проиндексирован и сохранен в базу!"
        await track_task_progress(task_id, message, final_text, "")
        
    except Exception as e:
        logger.exception("Error uploading pending file")
        await message.edit_text(f"Произошла ошибка при загрузке: {e}")
