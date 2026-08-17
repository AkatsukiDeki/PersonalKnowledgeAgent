import os
import uuid
import pytest
import pytest_asyncio
from typing import AsyncGenerator
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool

# Переопределяем тестовый URL до импорта приложения, если не задан в окружении
os.environ["DATABASE_URL"] = os.getenv(
    "TEST_DATABASE_URL", 
    "postgresql+asyncpg://pka_user:pka_password@localhost:5434/personal_ai_test"
)

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.db.models import Source, Chunk, Claim, Entity

TEST_DB_URL = os.environ["DATABASE_URL"]

import asyncpg

@pytest_asyncio.fixture(scope="function")
async def test_engine():
    """Создает тестовый асинхронный движок и накатывает схему таблиц."""
    
    # Подключаемся к системной БД для создания тестовой
    sys_conn = await asyncpg.connect("postgresql://pka_user:pka_password@localhost:5434/pka_db")
    try:
        await sys_conn.execute("CREATE DATABASE personal_ai_test")
    except asyncpg.exceptions.DuplicateDatabaseError:
        pass
    finally:
        await sys_conn.close()

    # Устанавливаем расширение vector в тестовой БД
    test_conn = await asyncpg.connect("postgresql://pka_user:pka_password@localhost:5434/personal_ai_test")
    try:
        await test_conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    finally:
        await test_conn.close()
        
    engine = create_async_engine(TEST_DB_URL, poolclass=NullPool)
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    yield engine
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Предоставляет изолированную сессию БД с откатом/очисткой после каждого теста."""
    async_session = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session() as session:
        yield session
        # Очищаем состояние таблиц после каждого теста
        await session.rollback()
        for table in reversed(Base.metadata.sorted_tables):
            await session.execute(table.delete())
        await session.commit()


@pytest_asyncio.fixture(scope="function", autouse=True)
def override_db_globals(test_engine):
    from app.db import session as db_session_module
    original_engine = db_session_module.engine
    original_maker = db_session_module.async_session_factory
    
    db_session_module.engine = test_engine
    db_session_module.async_session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    
    yield
    
    db_session_module.engine = original_engine
    db_session_module.async_session_factory = original_maker

@pytest_asyncio.fixture(scope="function")
async def client(test_engine, db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Тестовый клиент FastAPI с подмененной зависимостью сессии БД."""
    async def override_get_db():
        from app.db.session import async_session_factory
        async with async_session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
        
    app.dependency_overrides.clear()


# ==========================================
# Базовые фикстуры данных для тестов
# ==========================================

@pytest_asyncio.fixture
async def sample_source(db_session: AsyncSession) -> Source:
    source = Source(
        id=uuid.uuid4(),
        title="Тестовый источник",
        source_type="note",
        status="completed",
        content="Тестовый контент для проверки базы данных."
    )
    db_session.add(source)
    await db_session.commit()
    await db_session.refresh(source)
    return source


@pytest_asyncio.fixture
async def sample_chunk(db_session: AsyncSession, sample_source: Source) -> Chunk:
    chunk = Chunk(
        id=uuid.uuid4(),
        source_id=sample_source.id,
        chunk_index=0,
        text_content="Тестовый чанк о контейнеризации и разработке.",
        embedding=[0.01] * 768,  # Заглушка эмбеддинга
    )
    db_session.add(chunk)
    await db_session.commit()
    await db_session.refresh(chunk)
    return chunk


@pytest_asyncio.fixture
async def sample_claim(db_session: AsyncSession, sample_chunk: Chunk) -> Claim:
    claim = Claim(
        id=uuid.uuid4(),
        source_id=sample_chunk.source_id,
        chunk_id=sample_chunk.id,
        content="Пользователь использует Docker Compose для изоляции окружения.",
        claim_type="fact",
        category="programming",
        confidence=0.95,
        meta_info={}
    )
    db_session.add(claim)
    await db_session.commit()
    await db_session.refresh(claim)
    return claim


@pytest_asyncio.fixture
async def sample_claim_a(db_session: AsyncSession, sample_chunk: Chunk) -> Claim:
    claim_a = Claim(
        id=uuid.uuid4(),
        source_id=sample_chunk.source_id,
        chunk_id=sample_chunk.id,
        content="Все backend-сервисы упакованы в Docker Compose.",
        claim_type="fact",
        category="programming",
        confidence=1.0,
        meta_info={}
    )
    db_session.add(claim_a)
    await db_session.commit()
    await db_session.refresh(claim_a)
    return claim_a


@pytest_asyncio.fixture
async def sample_entity(db_session: AsyncSession) -> Entity:
    from app.db.models import Entity
    entity = Entity(
        id=uuid.uuid4(),
        canonical_name="Docker Compose",
        entity_type="tool",
    )
    db_session.add(entity)
    await db_session.commit()
    await db_session.refresh(entity)
    return entity


@pytest_asyncio.fixture
async def sample_claim_b(db_session: AsyncSession, sample_chunk: Chunk) -> Claim:
    claim_b = Claim(
        id=uuid.uuid4(),
        source_id=sample_chunk.source_id,
        chunk_id=sample_chunk.id,
        content="Инференс-скрипты на PyTorch запускаются внутри контейнеров Docker.",
        claim_type="fact",
        category="programming",
        confidence=0.95,
        meta_info={}
    )
    db_session.add(claim_b)
    await db_session.commit()
    await db_session.refresh(claim_b)
    return claim_b
