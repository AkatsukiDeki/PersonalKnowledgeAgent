from typing import Optional
from pydantic import BaseModel, Field


class RetranscribeRequest(BaseModel):
    language: Optional[str] = Field(
        default=None,
        description="Код языка (ru, en) или None для автоматического определения Whisper"
    )
    initial_prompt: Optional[str] = Field(
        default=None,
        description="Пользовательский словарь терминов или контекстная подсказка"
    )
    profile: Optional[str] = Field(
        default="speech",
        description="Профиль обработки: 'speech' (по умолчанию) или 'music' (включает разделение вокала Demucs)"
    )
    fast_mode: bool = Field(
        default=True,
        description="Если True, отключает пост-редактуру LLM и извлечение инсайтов, ускоряя процесс в 5-10 раз"
    )