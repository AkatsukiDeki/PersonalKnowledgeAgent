import asyncio
from sqlalchemy import text
from app.db.session import engine

async def apply_migration():
    print("Применение миграции Persistent Conversations (PHASE 2)...")
    
    async with engine.begin() as conn:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS conversations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                title VARCHAR(255) NOT NULL DEFAULT 'Новый диалог',
                domain VARCHAR(100),
                status VARCHAR(20) NOT NULL DEFAULT 'active',
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
                updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
            );
        """))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_conversations_domain ON conversations(domain);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_conversations_status ON conversations(status);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_conversations_updated_at ON conversations(updated_at);"))

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                role VARCHAR(20) NOT NULL,
                content TEXT NOT NULL,
                model VARCHAR(100),
                context_used JSONB,
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
            );
        """))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_conversation_id ON messages(conversation_id);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_created_at ON messages(created_at);"))

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS conversation_memories (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                conversation_id UUID NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
                summary TEXT,
                active_decisions JSONB DEFAULT '[]'::jsonb,
                open_questions JSONB DEFAULT '[]'::jsonb,
                key_claim_ids JSONB DEFAULT '[]'::jsonb,
                message_count_at_summary INTEGER DEFAULT 0,
                updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
            );
        """))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_conversation_memories_conversation_id ON conversation_memories(conversation_id);"))

    print("Таблицы conversations, messages, conversation_memories успешно созданы.")

if __name__ == "__main__":
    asyncio.run(apply_migration())
