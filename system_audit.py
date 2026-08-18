import asyncio
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from backend.app.db.session import async_session_factory as get_session_context
from backend.app.db.models import (
    Source,
    FileRevision,
    Chunk,
    Claim,
    ClaimRelation,
    Pattern,
    TimelineEvent,
    Conversation,
    Message,
)


async def run_system_audit():
    print("=" * 60)
    print("🔍 ЗАПУСК ПОЛНОГО АУДИТА СИСТЕМЫ PKA v2.1")
    print("=" * 60)

    async with get_session_context() as db:
        # 1. Слой L1: Источники, ревизии и чанки
        sources_cnt = (await db.execute(select(func.count(Source.id)))).scalar() or 0
        revisions_cnt = (await db.execute(select(func.count(FileRevision.id)))).scalar() or 0
        chunks_cnt = (await db.execute(select(func.count(Chunk.id)))).scalar() or 0

        print(f"\n📁 [СЛОЙ L1: ФИЗИЧЕСКОЕ ХРАНИЛИЩЕ]")
        print(f"  • Источники (Sources):    {sources_cnt}")
        print(f"  • Ревизии (Revisions):    {revisions_cnt}")
        print(f"  • Чанки (Chunks):         {chunks_cnt}")

        # 2. Слой L2: Атомарные утверждения (Claims) и скоринг
        claims_cnt = (await db.execute(select(func.count(Claim.id)))).scalar() or 0
        durable_cnt = (
            await db.execute(
                select(func.count(Claim.id)).where(Claim.memory_score >= 0.60)
            )
        ).scalar() or 0
        ephemeral_cnt = (
            await db.execute(
                select(func.count(Claim.id)).where(Claim.memory_score < 0.60)
            )
        ).scalar() or 0

        print(f"\n🧠 [СЛОЙ L2: АТОМАРНЫЕ ЗНАНИЯ (CLAIMS)]")
        print(f"  • Всего утверждений:      {claims_cnt}")
        print(f"  • Durable (Score >= 0.6): {durable_cnt}")
        print(f"  • Ephemeral (Score < 0.6):{ephemeral_cnt}")

        # 3. Слой L3: Граф связей
        relations_cnt = (
            await db.execute(select(func.count(ClaimRelation.id)))
        ).scalar() or 0
        rel_types = (
            await db.execute(
                select(ClaimRelation.relation_type, func.count(ClaimRelation.id)).group_by(
                    ClaimRelation.relation_type
                )
            )
        ).all()

        print(f"\n🕸️ [СЛОЙ L3: ГРАФ ЗНАНИЙ (RELATIONS)]")
        print(f"  • Всего ребер графа:      {relations_cnt}")
        for r_type, count in rel_types:
            print(f"    - {r_type}: {count}")

        # 4. Слой L3: Проактивные инсайты и паттерны
        patterns_cnt = (await db.execute(select(func.count(Pattern.id)))).scalar() or 0
        accepted_cnt = (
            await db.execute(
                select(func.count(Pattern.id)).where(Pattern.status == "accepted")
            )
        ).scalar() or 0
        pending_cnt = (
            await db.execute(
                select(func.count(Pattern.id)).where(Pattern.status == "pending_review")
            )
        ).scalar() or 0
        dismissed_cnt = (
            await db.execute(
                select(func.count(Pattern.id)).where(Pattern.status == "dismissed")
            )
        ).scalar() or 0

        print(f"\n💡 [СЛОЙ L3: ПАТТЕРНЫ И ИНСАЙТЫ]")
        print(f"  • Всего паттернов:        {patterns_cnt}")
        print(f"  • Принято (Accepted):     {accepted_cnt}")
        print(f"  • На ревью (Pending):     {pending_cnt}")
        print(f"  • Отклонено (Dismissed):  {dismissed_cnt}")

        # 5. Слой L4: Эволюция решений (Timeline)
        timeline_cnt = (
            await db.execute(select(func.count(TimelineEvent.id)))
        ).scalar() or 0
        event_types = (
            await db.execute(
                select(TimelineEvent.event_type, func.count(TimelineEvent.id)).group_by(
                    TimelineEvent.event_type
                )
            )
        ).all()

        print(f"\n⏳ [СЛОЙ L4: TIMELINE EVOLUTION]")
        print(f"  • Событий эволюции:       {timeline_cnt}")
        for e_type, count in event_types:
            print(f"    - {e_type}: {count}")

        # 6. Диалоги и история сообщений
        convs_cnt = (
            await db.execute(select(func.count(Conversation.id)))
        ).scalar() or 0
        msgs_cnt = (await db.execute(select(func.count(Message.id)))).scalar() or 0

        print(f"\n💬 [ДИАЛОГИ И СЕССИИ (CHATS)]")
        print(f"  • Сессий общения:         {convs_cnt}")
        print(f"  • Сообщений сохранено:    {msgs_cnt}")

        print("\n" + "=" * 60)
        print("✅ АУДИТ ЗАВЕРШЕН")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_system_audit())
