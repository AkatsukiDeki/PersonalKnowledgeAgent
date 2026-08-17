import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__))))

from sqlalchemy import select
from app.db.session import async_session_factory
from app.db.models import Conversation, Message, ConversationMemory
from app.knowledge.conversation_memory import maybe_trigger_memory_update, update_conversation_memory

async def test_conversations_full_cycle():
    print("Запуск теста Persistent Conversations...")

    async with async_session_factory() as db:
        # 1. Создаем ветку
        conv = Conversation(title="Тестовая ветка", domain="testing")
        db.add(conv)
        await db.commit()
        await db.refresh(conv)
        print(f"1. Создана ветка {conv.id}")

        # 2. Добавляем 4 сообщения
        messages = [
            Message(conversation_id=conv.id, role="user", content="Привет, давай обсудим архитектуру БД."),
            Message(conversation_id=conv.id, role="assistant", content="Конечно, какую СУБД выберем?"),
            Message(conversation_id=conv.id, role="user", content="Думаю, PostgreSQL подойдет лучше всего из-за JSONB."),
            Message(conversation_id=conv.id, role="assistant", content="Отличное решение. Зафиксируем PostgreSQL.")
        ]
        db.add_all(messages)
        await db.commit()
        print("2. Добавлено 4 сообщения.")

        # 3. Суммаризация ветки
        print("3. Запуск суммаризации памяти...")
        await maybe_trigger_memory_update(conv.id, threshold=4)

        # 4. Проверяем результаты
        mem = (await db.execute(select(ConversationMemory).where(ConversationMemory.conversation_id == conv.id))).scalar_one_or_none()
        
        if not mem:
            print("ОШИБКА: Память ветки не была создана!")
        else:
            print("\nУспешно создана память ветки:")
            print(f"Summary: {mem.summary}")
            print(f"Active Decisions: {mem.active_decisions}")
            print(f"Open Questions: {mem.open_questions}")
            print(f"Messages At Summary: {mem.message_count_at_summary}")
            
            assert mem.message_count_at_summary == 4

        # Очистка
        await db.delete(conv)
        await db.commit()
        print("Тест завершен.")

if __name__ == "__main__":
    asyncio.run(test_conversations_full_cycle())
