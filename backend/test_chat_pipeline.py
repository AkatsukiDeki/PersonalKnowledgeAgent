import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.db.session import async_session_factory
from app.knowledge.chat_pipeline import process_chat_pipeline
from sqlalchemy import select
from app.db.models import Conversation, ConversationMemory, Decision, Claim

async def test_pipeline():
    # Создаем фиктивный диалог для тестирования
    test_chat = [
        {"role": "user", "content": "У меня проблема с архитектурой приложения. Мои LLM вызовы засоряют базу 2000 мелкими клеймами, которые ничего не значат, например 'Привет, я ИИ', 'Пользователь сказал ок'. Как это исправить?"},
        {"role": "assistant", "content": "Вы можете использовать 2.5-этапный пайплайн с направленной суммаризацией. Сначала группируете сообщения, затем извлекаете `SessionExperienceExtraction` с полями Problem, Attempts, Outcome и Decisions."},
        {"role": "user", "content": "Отлично, мне нравится. Рассматривал вариант фильтровать регулярками, но это ломалось бы постоянно. Давай реализуем `ConversationMemory` и `Decision` как новые сущности."},
        {"role": "assistant", "content": "Хорошо. Мы внедрим `ConversationMemory` как единицу опыта и `Decision` как архитектурные решения. Это очистит RAG-базу и сохранит Provenance."},
        {"role": "user", "content": "Супер. Код согласован, приступаем к миграции."}
    ]

    async with async_session_factory() as db:
        print("Starting chat pipeline test...")
        conversation = await process_chat_pipeline(db, test_chat, title="Архитектура PKA", platform="chatgpt")
        
        if not conversation:
            print("[ERROR] Pipeline failed to process conversation.")
            return

        if conversation.status == "error":
            print("[ERROR] Pipeline completed with error status.")
            return

        print(f"[SUCCESS] Conversation processed successfully! ID: {conversation.id}")
        
        # Проверяем базу
        result = await db.execute(select(ConversationMemory).where(ConversationMemory.conversation_id == conversation.id))
        memory = result.scalar_one_or_none()
        
        if memory:
            print(f"\n--- Conversation Memory ---")
            print(f"Problem: {memory.problem}")
            print(f"Attempts: {memory.attempts}")
            print(f"Outcome: {memory.decision_summary}")
            
            # Проверяем Decisions
            decisions_result = await db.execute(select(Decision).where(Decision.memory_id == memory.id))
            decisions = decisions_result.scalars().all()
            print(f"\n--- Decisions ({len(decisions)}) ---")
            for d in decisions:
                print(f" - {d.decision} (Alternatives: {d.alternatives})")
        else:
            print("[ERROR] No ConversationMemory found!")
            
        # Проверяем Claims (Они не привязаны к source_id, просто ищем последние)
        claims_result = await db.execute(select(Claim).order_by(Claim.created_at.desc()).limit(3))
        claims = claims_result.scalars().all()
        print(f"\n--- Recent Claims ({len(claims)}) ---")
        for c in claims:
            print(f" - {c.content} (Importance: {c.importance})")

if __name__ == "__main__":
    if sys.platform.startswith("win"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(test_pipeline())
