import re
from typing import List

def _split_with_overlap(text: str, max_chunk_size: int, overlap: int) -> List[str]:
    """Sliding window splitting for text that is too long and cannot be split logically."""
    if len(text) <= max_chunk_size:
        return [text]
        
    chunks = []
    start = 0
    while start < len(text):
        end = start + max_chunk_size
        if end < len(text):
            # Try to snap to the nearest space
            nearest_space = text.rfind(' ', start, end)
            if nearest_space > start + (max_chunk_size // 2):
                end = nearest_space
        
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
            
        if end >= len(text):
            break
            
        start = end - overlap
        
    return chunks

def _recursive_split(text: str, max_chunk_size: int, overlap: int) -> List[str]:
    """Recursively split text by paragraphs, then sentences, then sliding window."""
    if len(text) <= max_chunk_size:
        return [text.strip()] if text.strip() else []

    # Try to split by double newline (paragraphs/code block boundaries)
    # We use a regex that safely matches double newlines.
    paragraphs = re.split(r'\n{2,}', text)
    
    if len(paragraphs) > 1:
        chunks = []
        current_chunk = ""
        
        for p in paragraphs:
            if len(current_chunk) + len(p) + 2 <= max_chunk_size:
                current_chunk = current_chunk + "\n\n" + p if current_chunk else p
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                # If paragraph itself is larger than max_chunk_size, recursively split it
                if len(p) > max_chunk_size:
                    chunks.extend(_recursive_split(p, max_chunk_size, overlap))
                    current_chunk = ""
                else:
                    current_chunk = p
        
        if current_chunk:
            chunks.append(current_chunk.strip())
            
        return chunks
    
    # If no double newlines, try single newlines
    lines = text.split('\n')
    if len(lines) > 1:
        chunks = []
        current_chunk = ""
        for line in lines:
            if len(current_chunk) + len(line) + 1 <= max_chunk_size:
                current_chunk = current_chunk + "\n" + line if current_chunk else line
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                if len(line) > max_chunk_size:
                    chunks.extend(_split_with_overlap(line, max_chunk_size, overlap))
                    current_chunk = ""
                else:
                    current_chunk = line
        if current_chunk:
            chunks.append(current_chunk.strip())
            
        return chunks
        
    # Fallback to naive sliding window
    return _split_with_overlap(text, max_chunk_size, overlap)


def create_chunks(text: str, chunk_size: int = 1200, overlap: int = 200) -> list[str]:
    """
    Разбивает Markdown текст на куски (чанки) с учетом структурных границ.
    Сначала разделяем по заголовкам (##), затем склеиваем/разбиваем секции 
    по параграфам, избегая разрыва блоков кода и таблиц.
    """
    text = text.strip()
    if not text:
        return []
        
    # 1. Сплит по заголовкам Markdown (от # до ####)
    # Используем positive lookahead, чтобы сохранить заголовок в секции
    sections = re.split(r'(?=\n#{1,4}\s)', text)
    
    final_chunks = []
    
    for section in sections:
        section = section.strip()
        if not section:
            continue
            
        if len(section) <= chunk_size:
            final_chunks.append(section)
        else:
            final_chunks.extend(_recursive_split(section, chunk_size, overlap))
            
    return final_chunks