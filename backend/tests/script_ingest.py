"""Integration test: ingest a document into L1 memory."""

import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from app.db.session import async_session_factory
from app.knowledge.ingestion import ingest_source


async def run_test():
    sample_text = """
    Проект SecAutomation Core объединяет скрипты автоматизации ИБ и предиктивные модели классификации сетевых инцидентов.
    Стек: Python, FastAPI, PostgreSQL, Gemini API.
    Автоматизация парсинга аномалий в логах с помощью локальных LLM помогает находить неочевидные векторы атак.
    Параллельно важно поддерживать физическую активность. Ежедневный бег по 3-4 км и калистеника отлично помогают разгрузить голову после сложного дебаггинга.
    """

    print("Подключение к базе данных...")
    async with async_session_factory() as db:
        print("Обращение к Gemini API для векторизации и запись в PostgreSQL...")

        source = await ingest_source(
            db=db,
            title="Заметка: SecAutomation и тренировки",
            content=sample_text,
            source_type="note",
            meta_info={"domain": "mixed"},
        )

        print(f"Успех! Документ сохранен в L1 Memory.")
        print(f"ID источника: {source.id}")


if __name__ == "__main__":
    asyncio.run(run_test())
