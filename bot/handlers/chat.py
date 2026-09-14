import uuid
import logging
from aiogram import Router, F
from aiogram.types import Message, CallbackQuery
from aiogram.filters import StateFilter
from aiogram.enums import ParseMode

from core.loader import redis_client
from keyboards.inline import get_citations_keyboard
from services.backend_client import send_chat_message, get_user_scope

logger = logging.getLogger(__name__)
chat_router = Router()

def escape_md(text: str) -> str:
    escape_chars = r"_*[]()~`>#+-=|{}.!"
    for c in escape_chars:
        text = text.replace(c, f"\\{c}")
    return text

async def send_chunked_message(message: Message, text: str, parse_mode: ParseMode | None = ParseMode.MARKDOWN, reply_markup=None):
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
                await message.answer(chunk, parse_mode=None, reply_markup=markup)

@chat_router.message(F.content_type == "text", StateFilter(None))
async def handle_text(message: Message):
    user_id = message.from_user.id
    if not await redis_client.get(f"bot:user_conv:{user_id}"):
        await redis_client.set(f"bot:user_conv:{user_id}", str(uuid.uuid4()), ex=7 * 86400)
    conv_id = await redis_client.get(f"bot:user_conv:{user_id}")

    await message.bot.send_chat_action(message.chat.id, action="typing")
    
    try:
        scope = await get_user_scope(user_id)
        data = await send_chat_message(message.text, conv_id, scope)
            
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
                citations_text += f"{i}. *{escape_md(title)}*\n_{escape_md(snippet)}..._\n\n"
            
            cite_id = str(uuid.uuid4())[:8]
            await redis_client.set(f"bot:citation:{cite_id}", citations_text, ex=86400)
            reply_markup = get_citations_keyboard(cite_id)
            
        await send_chunked_message(message, answer, parse_mode=ParseMode.MARKDOWN, reply_markup=reply_markup)
        
    except Exception as e:
        logger.exception("Error handling text message")
        await message.answer(f"Произошла ошибка при общении с базой знаний: {e}")

@chat_router.callback_query(F.data.startswith("cite_"))
async def callback_cite(callback: CallbackQuery):
    cite_id = callback.data.split("_", 1)[1]
    text = await redis_client.get(f"bot:citation:{cite_id}")
    if text:
        await send_chunked_message(callback.message, text, parse_mode=ParseMode.MARKDOWN)
        await callback.answer()
    else:
        await callback.answer("Источники устарели или не найдены", show_alert=True)
