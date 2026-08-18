import asyncio
import uuid
from app.db.session import async_session_factory
from app.db.models import Decision, Conversation, ConversationMemory
from sqlalchemy import select
from app.knowledge.embeddings.factory import get_embedding_provider

async def seed_decisions():
    provider = get_embedding_provider()
    
    async with async_session_factory() as db:
        memory = (await db.execute(select(ConversationMemory))).scalars().first()
        mem_id = memory.id if memory else None
        
        # FastAPI Active
        emb_fastapi = await provider.embed_query("FastAPI")
        d1 = Decision(
            id=uuid.uuid4(),
            memory_id=mem_id,
            decision="FastAPI",
            rationale="Асинхронность и скорость. Django тяжеловат.",
            status="active",
            embedding=emb_fastapi
        )
        # Django Superseded
        emb_django = await provider.embed_query("Django")
        d2 = Decision(
            id=uuid.uuid4(),
            memory_id=mem_id,
            decision="Django",
            rationale="Изначально рассматривался, но признан слишком тяжелым.",
            status="superseded",
            embedding=emb_django
        )
        
        # Ollama + Qwen2.5 Active (for Cross-Domain and Analytical)
        emb_ollama = await provider.embed_query("Ollama Qwen2.5 JSON timeout")
        d3 = Decision(
            id=uuid.uuid4(),
            memory_id=mem_id,
            decision="Ollama + Qwen2.5",
            rationale="Оригинальная модель не справлялась с генерацией JSON и падала по timeout. Переход на Ollama + Qwen2.5 решил проблему структурированной генерации.",
            status="active",
            embedding=emb_ollama
        )

        db.add_all([d1, d2, d3])
        await db.commit()
        print("Seeded missing decisions!")

if __name__ == "__main__":
    asyncio.run(seed_decisions())
