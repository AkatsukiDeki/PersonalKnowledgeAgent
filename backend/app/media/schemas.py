from pydantic import BaseModel, Field
from typing import List, Optional

class VoiceActionItem(BaseModel):
    text: str = Field(description="Суть действия или задачи")
    context: Optional[str] = Field(default=None, description="Дополнительный контекст или условие выполнения")

class VoiceStructuredNote(BaseModel):
    summary: str = Field(description="Краткое связное резюме заметки")
    key_points: List[str] = Field(default_factory=list, description="Ключевые тезисы и факты")
    action_items: List[VoiceActionItem] = Field(default_factory=list, description="Задачи и запланированные действия")
    ideas: List[str] = Field(default_factory=list, description="Гипотезы, инсайты, предложения")
    open_questions: List[str] = Field(default_factory=list, description="Неразрешенные вопросы, требующие проверки")
