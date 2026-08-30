import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pgvector.sqlalchemy import Vector
from ..core.config import settings
from sqlalchemy import ForeignKey, Index, Integer, String, Text, Float, Table, Column, CheckConstraint, DateTime
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID as PG_UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Boolean

from .base import Base, TimestampedUUIDMixin


class UserProfile(Base, TimestampedUUIDMixin):
    __tablename__ = "user_profiles"

    role: Mapped[str] = mapped_column(String, nullable=False)
    stack: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    invariants: Mapped[str] = mapped_column(Text, nullable=False)
    learning_style: Mapped[str] = mapped_column(Text, nullable=False)
    projects: Mapped[str] = mapped_column(Text, nullable=False)
    is_seeded: Mapped[bool] = mapped_column(default=True, nullable=False, index=True)


class Source(Base, TimestampedUUIDMixin):
    __tablename__ = "sources"

    title: Mapped[str] = mapped_column(String, nullable=False)
    source_type: Mapped[str] = mapped_column(String, default="note", nullable=False)
    importance: Mapped[str] = mapped_column(String(20), default="normal",
                                            index=True)  # temporary, normal, important, critical
    domain: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    folder: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False, index=True)
    meta_info: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    metadata_info: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    
    subject_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("subjects.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    # Legacy / deprecated fields (to be cleaned up or used for transition)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    file_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    file_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    raw_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    original_file_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(default=False, nullable=False, index=True)

    status: Mapped[str] = mapped_column(String, default="pending", nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    chunks: Mapped[List["Chunk"]] = relationship(
        "Chunk",
        back_populates="source",
        cascade="all, delete-orphan",
        lazy="selectin"
    )
    revisions: Mapped[List["FileRevision"]] = relationship(
        "FileRevision",
        back_populates="source",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="FileRevision.version.desc()"
    )


class FileRevision(Base, TimestampedUUIDMixin):
    __tablename__ = "file_revisions"

    source_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("sources.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), default="text/plain", nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    source: Mapped["Source"] = relationship("Source", back_populates="revisions")
    chunks: Mapped[List["Chunk"]] = relationship("Chunk", back_populates="revision", cascade="all, delete-orphan")


class Chunk(Base, TimestampedUUIDMixin):
    __tablename__ = "chunks"

    source_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("sources.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    revision_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("file_revisions.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text_content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[Optional[List[float]]] = mapped_column(Vector(settings.EMBEDDING_DIMENSION), nullable=True)
    tsv: Mapped[Optional[Any]] = mapped_column(TSVECTOR, nullable=True)

    # Chunk versioning (mirrors Claim pattern)
    is_active: Mapped[bool] = mapped_column(default=True, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    superseded_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("chunks.id", ondelete="SET NULL"),
        nullable=True
    )
    metadata_info: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)

    source: Mapped["Source"] = relationship("Source", back_populates="chunks")
    revision: Mapped[Optional["FileRevision"]] = relationship("FileRevision", back_populates="chunks")

    __table_args__ = (
        Index(
            "ix_chunks_embedding",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
        Index("ix_chunks_tsv", "tsv", postgresql_using="gin"),
    )


claim_entities = Table(
    "claim_entities",
    Base.metadata,
    Column("claim_id", PG_UUID(as_uuid=True), ForeignKey("claims.id", ondelete="CASCADE"), primary_key=True),
    Column("entity_id", PG_UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), primary_key=True),
)


class Entity(Base, TimestampedUUIDMixin):
    __tablename__ = "entities"

    canonical_name: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    entity_type: Mapped[str] = mapped_column(String, index=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    aliases: Mapped[List[str]] = mapped_column(ARRAY(String), default=list, nullable=False)
    meta_info: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)

    claims: Mapped[List["Claim"]] = relationship(
        "Claim", secondary=claim_entities, back_populates="entities"
    )


class Claim(Base, TimestampedUUIDMixin):
    __tablename__ = "claims"

    __table_args__ = (
        CheckConstraint("superseded_by IS NULL OR superseded_by != id", name="ck_claim_no_self_supersede"),
    )

    source_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("sources.id", ondelete="CASCADE"),
        nullable=False
    )
    chunk_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("chunks.id", ondelete="CASCADE"),
        nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[Optional[List[float]]] = mapped_column(Vector(settings.EMBEDDING_DIMENSION), nullable=True)
    claim_type: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, index=True, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    meta_info: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)

    # Phase 3D fields
    is_active: Mapped[bool] = mapped_column(default=True, index=True)
    superseded_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("claims.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    # Семантическая классификация
    kind: Mapped[str] = mapped_column(String(50), default="fact",
                                      index=True)  # fact, decision, habit, preference, observation, plan
    scope: Mapped[str] = mapped_column(String(50), default="global")  # global, project, personal

    # Метрики Knowledge Scoring
    stability: Mapped[float] = mapped_column(Float, default=0.5)  # 0.1 (эпизод) .. 1.0 (долгосрочный принцип)
    importance: Mapped[float] = mapped_column(Float, default=1.0)  # наследуется от Source
    recurrence: Mapped[int] = mapped_column(Integer, default=1)  # счетчик повторений
    memory_score: Mapped[float] = mapped_column(Float, default=0.5, index=True)  # вычисляемый ранг (Durable >= 0.60)

    # Жизненный цикл и Temporal State
    lifecycle_status: Mapped[str] = mapped_column(String(20), default="active",
                                                  index=True)  # active, superseded, deprecated
    valid_from: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    valid_to: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    source: Mapped["Source"] = relationship("Source")
    chunk: Mapped["Chunk"] = relationship("Chunk")
    entities: Mapped[List["Entity"]] = relationship(
        "Entity", secondary=claim_entities, back_populates="claims"
    )

    superseded_by_claim: Mapped[Optional["Claim"]] = relationship(
        "Claim", remote_side="Claim.id", foreign_keys=[superseded_by]
    )


class ClaimConflict(Base, TimestampedUUIDMixin):
    __tablename__ = "claim_conflicts"

    claim_a_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("claims.id", ondelete="CASCADE"), nullable=False, index=True
    )
    claim_b_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("claims.id", ondelete="CASCADE"), nullable=False, index=True
    )

    status: Mapped[str] = mapped_column(String, default="unresolved", index=True)
    resolution_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    claim_a: Mapped["Claim"] = relationship("Claim", foreign_keys=[claim_a_id])
    claim_b: Mapped["Claim"] = relationship("Claim", foreign_keys=[claim_b_id])


class TimelineEvent(Base):
    __tablename__ = "timeline_events"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False,
                                            index=True)  # decision_change, tool_replacement, strategy_shift
    old_claim_id: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True),
                                                              ForeignKey("claims.id", ondelete="SET NULL"),
                                                              nullable=True,
                                                              index=True)
    new_claim_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("claims.id", ondelete="CASCADE"),
                                                    index=True)
    source_id: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True),
                                                           ForeignKey("sources.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    domain: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    old_claim: Mapped[Optional["Claim"]] = relationship("Claim", foreign_keys=[old_claim_id])
    new_claim: Mapped["Claim"] = relationship("Claim", foreign_keys=[new_claim_id])
    source: Mapped[Optional["Source"]] = relationship("Source", foreign_keys=[source_id])


class ClaimRelation(Base, TimestampedUUIDMixin):
    __tablename__ = "claim_relations"

    __table_args__ = (
        Index("ix_unique_relation", "source_claim_id", "target_claim_id", "relation_type", unique=True),
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="check_confidence_range"),
        CheckConstraint("source_claim_id != target_claim_id", name="check_no_self_relation"),
    )

    source_claim_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("claims.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_claim_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("claims.id", ondelete="CASCADE"), nullable=False, index=True
    )

    relation_type: Mapped[str] = mapped_column(String, nullable=False, index=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)

    evidence_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    evidence_claim_ids: Mapped[List[uuid.UUID]] = mapped_column(ARRAY(PG_UUID(as_uuid=True)), default=list,
                                                                nullable=False)
    evidence_chunk_ids: Mapped[List[uuid.UUID]] = mapped_column(ARRAY(PG_UUID(as_uuid=True)), default=list,
                                                                nullable=False)

    source_claim: Mapped["Claim"] = relationship("Claim", foreign_keys=[source_claim_id])
    target_claim: Mapped["Claim"] = relationship("Claim", foreign_keys=[target_claim_id])


class Pattern(Base, TimestampedUUIDMixin):
    __tablename__ = "patterns"

    __table_args__ = (
        Index("ix_patterns_domains", "domains", postgresql_using="gin"),
        Index("ix_patterns_type", "pattern_type"),
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_pattern_confidence_range"),
        CheckConstraint("array_length(domains, 1) >= 2", name="ck_pattern_min_domains"),
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    pattern_type: Mapped[str] = mapped_column(String(50), nullable=False)
    domains: Mapped[List[str]] = mapped_column(ARRAY(String), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    importance: Mapped[float] = mapped_column(Float, default=0.75, index=True)
    evidence_summary: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_claim_ids: Mapped[List[uuid.UUID]] = mapped_column(ARRAY(PG_UUID(as_uuid=True)), default=list,
                                                                nullable=False)
    meta_info: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending_review", index=True)


class ImportJob(Base, TimestampedUUIDMixin):
    __tablename__ = "import_jobs"

    provider: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(50), default="pending", index=True)
    file_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    preview_data_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    stats: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)


class SystemError(Base):
    __tablename__ = "system_errors"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    # Корреляционные идентификаторы
    job_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    source_id: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    chunk_id: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)

    # Классификация
    stage: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    error_type: Mapped[str] = mapped_column(String(100), nullable=False)
    exception_class: Mapped[str] = mapped_column(String(100), nullable=False)
    location: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Очищенное тело ошибки
    message: Mapped[str] = mapped_column(Text, nullable=False)
    traceback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    context: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)

    # Жизненный цикл
    occurrences: Mapped[int] = mapped_column(Integer, default=1)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)

    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class Conversation(Base):
    """Первичная сессия диалога (ChatGPT, Claude, Gemini)."""
    __tablename__ = "conversations"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(500), nullable=False, default="Новый диалог")
    platform = Column(String(50), nullable=False, default="chatgpt")  # chatgpt | claude | gemini
    external_id = Column(String(255), nullable=True, index=True)
    folder = Column(String(100), nullable=True, index=True)
    started_at = Column(DateTime(timezone=True), nullable=True, default=datetime.utcnow)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    message_count = Column(Integer, default=0)
    source_hash = Column(String(64), nullable=True, index=True)
    status = Column(String(50), default="imported")  # imported | processing | indexed | error
    is_pinned = Column(Boolean, default=False, index=True)
    subject_id = Column(PG_UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True,
                        index=True)

    # Связи
    messages = relationship("ConversationMessage", back_populates="conversation", cascade="all, delete-orphan",
                            order_by="ConversationMessage.sequence_num")
    segments = relationship("ConversationSegment", back_populates="conversation", cascade="all, delete-orphan")
    memory = relationship("ConversationMemory", back_populates="conversation", uselist=False,
                          cascade="all, delete-orphan")
    subject = relationship("Subject", back_populates="conversations")


class ConversationMessage(Base):
    """Сырые реплики диалога для доказательной базы (Provenance)."""
    __tablename__ = "conversation_messages"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(PG_UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False,
                             index=True)
    role = Column(String(50), nullable=False)  # user | assistant | system
    content = Column(Text, nullable=False)
    sequence_num = Column(Integer, nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=True, default=datetime.utcnow)
    meta_info = Column(JSONB, default=dict)

    conversation = relationship("Conversation", back_populates="messages")


class ConversationSegment(Base):
    """Тематические блоки внутри длинного диалога (2.5-phase segmentation)."""
    __tablename__ = "conversation_segments"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(PG_UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False,
                             index=True)
    topic = Column(String(255), nullable=True)
    start_seq = Column(Integer, nullable=False)
    end_seq = Column(Integer, nullable=False)
    local_summary = Column(Text, nullable=True)

    conversation = relationship("Conversation", back_populates="segments")


class ConversationMemory(Base):
    """Консолидированный опыт сессии (Первоклассный гражданин памяти)."""
    __tablename__ = "conversation_memories"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(PG_UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False,
                             unique=True)

    problem = Column(Text, nullable=False)  # Какая проблема решалась
    context = Column(Text, nullable=True)  # Вводные и ограничения
    attempts = Column(JSONB, default=list)  # Что пробовали и почему не подошло
    decision_summary = Column(Text, nullable=False)  # Итоговая суть принятого решения
    outcome = Column(Text, nullable=True)  # Результат / артефакт
    embedding = mapped_column(Vector(1024), nullable=True)  # ML Enrichment (Optional)

    importance = Column(Float, default=0.7)
    memory_score = Column(Float, default=0.7)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    conversation = relationship("Conversation", back_populates="memory")
    decisions = relationship("Decision", back_populates="memory", cascade="all, delete-orphan")


class Decision(Base):
    """Атомарное зафиксированное архитектурное/инженерное решение."""
    __tablename__ = "decisions"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    memory_id = Column(PG_UUID(as_uuid=True), ForeignKey("conversation_memories.id", ondelete="CASCADE"),
                       nullable=False, index=True)

    decision = Column(Text, nullable=False)  # Формулировка: "Выбран FastAPI для бэкенда"
    rationale = Column(Text, nullable=True)  # Обоснование: "Лучше подходит под асинхронный пайплайн"
    alternatives = Column(JSONB, default=list)  # ["Django рассматривался, но отвергнут"]
    domain = Column(String(100), default="engineering")
    status = Column(String(50), default="active")  # active | superseded | deprecated
    embedding = mapped_column(Vector(1024), nullable=True)  # ML Enrichment (Optional)

    superseded_by_id = Column(PG_UUID(as_uuid=True), ForeignKey("decisions.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    memory = relationship("ConversationMemory", back_populates="decisions")


class Insight(Base):
    """Проактивный вывод (STEP 6), синтезированный из семантических коллизий и графа."""
    __tablename__ = "insights"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    insight_type = Column(String(50), nullable=False)  # 'cross_domain_link', 'contradiction', 'trend', 'attempt_loop'
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    evidence_links = Column(JSONB, default=list)  # Ссылки на Decisions, Memories, Claims
    domains_involved = Column(JSONB, default=list)  # ['engineering', 'design']
    importance_score = Column(Float, default=0.5)  # 0.0 - 1.0
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


subject_sources = Table(
    "subject_sources",
    Base.metadata,
    Column("subject_id", PG_UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True),
    Column("source_id", PG_UUID(as_uuid=True), ForeignKey("sources.id", ondelete="CASCADE"), primary_key=True),
)


class Subject(Base, TimestampedUUIDMixin):
    __tablename__ = "subjects"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    icon: Mapped[str] = mapped_column(String(50), default="book")
    color_theme: Mapped[str] = mapped_column(String(50), default="indigo")
    mastery_score: Mapped[float] = mapped_column(Float, default=0.0)
    is_mastered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    roadmaps: Mapped[List["SubjectRoadmap"]] = relationship("SubjectRoadmap", back_populates="subject",
                                                            cascade="all, delete-orphan", lazy="selectin")
    stats: Mapped[List["LearningStat"]] = relationship("LearningStat", back_populates="subject",
                                                       cascade="all, delete-orphan", lazy="selectin")
    sessions: Mapped[List["LearningSession"]] = relationship("LearningSession", back_populates="subject",
                                                             cascade="all, delete-orphan", lazy="selectin")
    tutor_conversation: Mapped[Optional["SubjectTutorConversation"]] = relationship("SubjectTutorConversation", back_populates="subject",
                                                                                    cascade="all, delete-orphan", lazy="selectin")
    conversations = relationship("Conversation", back_populates="subject")
    sources: Mapped[List["Source"]] = relationship("Source", secondary=subject_sources)
    flashcards: Mapped[List["SubjectFlashcard"]] = relationship("SubjectFlashcard", back_populates="subject",
                                                                cascade="all, delete-orphan", lazy="selectin")


class SubjectRoadmap(Base, TimestampedUUIDMixin):
    __tablename__ = "subject_roadmaps"

    subject_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"),
                                                  nullable=False, unique=True)
    content: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    subject: Mapped["Subject"] = relationship("Subject", back_populates="roadmaps")


class LearningStat(Base, TimestampedUUIDMixin):
    __tablename__ = "learning_stats"

    subject_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"),
                                                  nullable=False, unique=True)
    streak_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_activity_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    accuracy: Mapped[float] = mapped_column(Float, default=0.0)
    retention_index: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)

    subject: Mapped["Subject"] = relationship("Subject", back_populates="stats")


class LearningSession(Base, TimestampedUUIDMixin):
    __tablename__ = "learning_sessions"

    subject_id: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True),
                                                            ForeignKey("subjects.id", ondelete="CASCADE"),
                                                            nullable=True, index=True)
    session_type: Mapped[str] = mapped_column(String(50), nullable=False)  # 'flashcard', 'quiz', 'exam'
    topic_name: Mapped[str] = mapped_column(String(255), nullable=False)
    score: Mapped[float] = mapped_column(Float, default=0.0)
    failed_concepts: Mapped[List[str]] = mapped_column(ARRAY(String), default=list, nullable=False)

    subject: Mapped[Optional["Subject"]] = relationship("Subject", back_populates="sessions")


class SubjectTutorConversation(Base, TimestampedUUIDMixin):
    __tablename__ = "subject_tutor_conversations"

    subject_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    subject: Mapped["Subject"] = relationship("Subject", back_populates="tutor_conversation")
    messages: Mapped[List["SubjectTutorMessage"]] = relationship("SubjectTutorMessage", back_populates="conversation", cascade="all, delete-orphan", lazy="selectin", order_by="SubjectTutorMessage.sequence_num")


class SubjectTutorMessage(Base, TimestampedUUIDMixin):
    __tablename__ = "subject_tutor_messages"

    conversation_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("subject_tutor_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False)  # 'user', 'assistant', 'system'
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sequence_num: Mapped[int] = mapped_column(Integer, nullable=False)
    
    conversation: Mapped["SubjectTutorConversation"] = relationship("SubjectTutorConversation", back_populates="messages")


class SubjectFlashcard(Base):
    __tablename__ = "subject_flashcards"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subject_id = Column(PG_UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    node_id = Column(String, nullable=True)  # Привязка к теме из Roadmap
    front = Column(Text, nullable=False)
    back = Column(Text, nullable=False)
    hint = Column(Text, nullable=True)
    
    # SM-2 параметры
    ease_factor = Column(Float, default=2.5, nullable=False)
    interval = Column(Integer, default=0, nullable=False)  # В днях
    repetitions = Column(Integer, default=0, nullable=False)
    due_date = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    last_reviewed_at = Column(DateTime(timezone=True), nullable=True)

    subject = relationship("Subject", back_populates="flashcards")