import io
import json
import zipfile
from typing import Generator

def parse_chatgpt_json(raw_json: list | dict) -> Generator[dict, None, None]:
    """Извлекает отдельные сессии из ChatGPT conversations.json."""
    if isinstance(raw_json, dict):
        raw_json = [raw_json]
        
    for conv in raw_json:
        title = conv.get("title") or "Untitled Conversation"
        create_time = conv.get("create_time")
        mapping = conv.get("mapping", {})
        if mapping:
            conv["title"] = f"Chat: {title}"
            yield conv

def safe_decode(content_bytes: bytes) -> str:
    """Безопасное декодирование байтов в текст с перебором распространенных кодировок."""
    for encoding in ("utf-8-sig", "utf-8", "cp1251", "latin-1"):
        try:
            return content_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content_bytes.decode("utf-8", errors="replace")

def parse_chat_archive(file_bytes: bytes) -> Generator[dict, None, None]:
    """
    Распаковывает ZIP-архив из памяти, находя JSON-файлы переписок
    (conversations.json от ChatGPT, Claude json-выгрузки и т.д.).
    """
    try:
        buffer = io.BytesIO(file_bytes)
        buffer.seek(0)
        
        with zipfile.ZipFile(buffer, "r") as z:
            for filename in z.namelist():
                # Ищем файлы переписок
                if filename.endswith(".json") and not filename.startswith("__MACOSX"):
                    raw_data = z.read(filename)
                    text = safe_decode(raw_data)
                    try:
                        parsed_json = json.loads(text)
                        yield from parse_chatgpt_json(parsed_json)
                    except json.JSONDecodeError:
                        continue
    except zipfile.BadZipFile as e:
        raise ValueError(f"Поврежденный или невалидный ZIP архив: {e}")
