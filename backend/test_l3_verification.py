import asyncio
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from uuid import UUID
from sqlalchemy import select
from app.db.session import async_session_factory
from app.db.models import Pattern, Claim
from app.knowledge.intent_classifier import classify_intent
from app.knowledge.query_condenser import rewrite_query
from app.api.chat import _build_context_and_check_evidence
from app.agent.gemini import generate_rag_response
from app.schemas.chat import ChatRequest

async def verify_l3_lifecycle():
    async with async_session_factory() as db:
        # 1. Поиск паттерна и аудит Provenance
        stmt = select(Pattern).where(Pattern.confidence >= 0.85).order_by(Pattern.confidence.desc())
        patterns = (await db.execute(stmt)).scalars().all()
        
        if not patterns:
            print("❌ Паттерны для валидации не найдены.")
            return

        target_pattern = patterns[0]
        print("=" * 60)
        print("1. АУДИТ ПАТТЕРНА ПЕРЕД ACCEPT")
        print(f"ID:          {target_pattern.id}")
        print(f"Title:       {target_pattern.title}")
        print(f"Confidence:  {target_pattern.confidence}")
        print(f"Domains:     {target_pattern.domains}")
        print(f"Description: {target_pattern.description}")
        print("=" * 60)

        # 2. Перевод в статус ACCEPTED
        target_pattern.status = "accepted"
        await db.commit()
        print(f"✅ Паттерн {target_pattern.id} переведен в статус 'accepted'.\n")

    # 3. Тестовые запросы
    test_queries = [
        ("Q4 (Analytical / Relevant)", "Что общего между принципом Lean в CALMS и нашими практиками в программировании?"),
        ("Q8 (Analytical / Synthesis)", "Что ты заметил обо мне, моих привычках или подходах к работе на основе всех загруженных данных, чего я сам явно не формулировал?"),
        ("Negative Test (Factual / Irrelevant)", "Какой у меня backend стек используется в проекте?")
    ]

    for label, query in test_queries:
        print("=" * 60)
        print(f"ТЕСТ: {label}")
        print(f"Query: {query}")
        print("-" * 60)

        intent = await classify_intent(query)
        _, condensed = await rewrite_query(query, [])
        
        payload = ChatRequest(query=query, history=[])
        
        async with async_session_factory() as db:
            is_sufficient, retrieved, search_query, intent_res = await _build_context_and_check_evidence(db, payload)
            
            # Context builder returns a list of dictionaries. We need to check text_content
            context_text = "\n".join([r.get("text_content", "") for r in retrieved])
            l3_present = "[L3 ПАТТЕРН]" in context_text
            
            l1_count = len([r for r in retrieved if r.get("text_content", "").startswith("[L1")])
            l2_count = len([r for r in retrieved if r.get("text_content", "").startswith("[L2")])
            l3_count = len([r for r in retrieved if r.get("text_content", "").startswith("[L3")])
            
            print(f"Intent:            {intent_res}")
            print(f"L3 Pattern Injected: {l3_present}")
            print(f"L1 Chunks Count:   {l1_count}")
            print(f"L2 Claims Count:   {l2_count}")
            print(f"L3 Patterns Count: {l3_count}")
            
            # Генерация ответа через LLM
            if not is_sufficient:
                print("\nСГЕНЕРИРОВАННЫЙ ОТВЕТ: INSUFFICIENT_DATA")
            else:
                response = await generate_rag_response(query=condensed, retrieved_chunks=retrieved)
                print("\nСГЕНЕРИРОВАННЫЙ ОТВЕТ:")
                print(response)
            print("=" * 60 + "\n")

if __name__ == "__main__":
    asyncio.run(verify_l3_lifecycle())
