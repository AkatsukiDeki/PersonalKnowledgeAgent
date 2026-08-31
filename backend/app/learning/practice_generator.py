import uuid
import re
from typing import Optional
from app.core.llm import model_manager, TaskType
from app.schemas.learning import FlashcardResponse, QuizResponse


def clean_cjk_prefix(text: str) -> str:
    if not isinstance(text, str):
        return text
    # Удаляем случайные мета-фразы
    return re.sub(r'^(这是一份|以下是|任务完成).*?[\n:]', '', text).strip()


class PracticeGenerator:
    """
    Stateless service for generating structured practice materials (Quizzes, Flashcards).
    Uses model_manager with Pydantic schemas to guarantee output structures.
    """

    @staticmethod
    def _get_system_prompt(language: str, instructions: str) -> str:
        return f"""You are a precise educational assistant.
IMPORTANT RULES:
1. OUTPUT LANGUAGE: Always respond strictly in {language} (unless the user explicitly asked in English). Never use Chinese or any other language.
2. {instructions}
"""

    @staticmethod
    async def generate_flashcards(
        context_text: str,
        count: int = 5,
        language: str = "🇷🇺 Русский",
        difficulty: str = "medium"
    ) -> FlashcardResponse:
        prompt = f"Сгенерируй {count} флешкарточек (вопрос-ответ) на основе следующего материала:\n\n{context_text[:20000]}"
        
        difficulty_hint = ""
        if difficulty == "easy":
            difficulty_hint = "Делай упор на базовые термины и определения."
        elif difficulty == "hard":
            difficulty_hint = "Делай упор на сложные архитектурные концепции и неочевидные взаимосвязи."

        system_instruction = PracticeGenerator._get_system_prompt(
            language,
            f"Ты — опытный методист. Создавай лаконичные, понятные карточки для запоминания. Ответ должен быть точным и коротким. {difficulty_hint}"
        )

        result = await model_manager.generate_structured(
            task_type=TaskType.EXTRACTION,
            schema=FlashcardResponse,
            prompt=prompt,
            system_instruction=system_instruction
        )

        if not result:
            raise ValueError("Model returned empty result")

        for card in result.cards:
            if not card.id:
                card.id = str(uuid.uuid4())
            card.question = clean_cjk_prefix(card.question)
            card.answer = clean_cjk_prefix(card.answer)

        return result

    @staticmethod
    async def generate_quiz(
        context_text: str,
        count: int = 5,
        language: str = "🇷🇺 Русский",
        difficulty: str = "medium"
    ) -> QuizResponse:
        prompt = f"Сгенерируй тест из {count} вопросов на основе следующего материала:\n\n{context_text[:20000]}"
        
        difficulty_instructions = {
            "easy": "Простые термины и базовый синтаксис.",
            "medium": "Практические сценарии, поиск ошибок, базовая конфигурация.",
            "hard": "Архитектурные вопросы, граничные условия и troubleshooting.",
            "exam": "Сертификационные вопросы высокого уровня сложности с ловушками.",
        }.get(difficulty, "Средняя сложность.")

        system_instruction = PracticeGenerator._get_system_prompt(
            language,
            f"Ты — строгий экзаменатор. Создавай вопросы с 4 вариантами ответов (один правильный). "
            f"Обязательно дай развернутое объяснение `explanation` для правильного ответа. "
            f"Уровень сложности: {difficulty_instructions}"
        )

        result = await model_manager.generate_structured(
            task_type=TaskType.EXTRACTION,
            schema=QuizResponse,
            prompt=prompt,
            system_instruction=system_instruction
        )

        if not result:
            raise ValueError("Model returned empty result")

        for q in result.questions:
            if not q.id:
                q.id = str(uuid.uuid4())
            q.question = clean_cjk_prefix(q.question)
            q.explanation = clean_cjk_prefix(q.explanation)

        return result
