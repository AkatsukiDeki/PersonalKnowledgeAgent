import re


def create_chunks(text: str, chunk_size: int = 600, overlap: int = 100) -> list[str]:
    """Разбивает текст на куски примерно по chunk_size символов с учетом границ слов."""
    # Убираем лишние пробелы и переносы
    text = re.sub(r'\n{3,}', '\n\n', text).strip()

    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size

        # Если мы не в конце текста, попытаемся обрезать кусок по ближайшему пробелу
        # или концу предложения, чтобы не рвать слово посередине
        if end < len(text):
            # Ищем ближайший пробел перед лимитом
            nearest_space = text.rfind(' ', start, end)
            if nearest_space != -1 and nearest_space > start + (chunk_size // 2):
                end = nearest_space

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        start = end - overlap  # Сдвигаемся назад на overlap

    return chunks