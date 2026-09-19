import uuid
import enum
import sqlalchemy
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pgvector.sqlalchemy import Vector
from ..core.config import settings
from sqlalchemy import ForeignKey, Index, Integer, String, Text, Float, Table, Column, CheckConstraint, DateTime, Date, text, UniqueConstraint, Enum as SQLEnum
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID as PG_UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym
from sqlalchemy import Computed
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
    folder: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, index=True)
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

    processing_status: Mapped[str] = mapped_column(String(32), default="completed", nullable=False)
    processing_stage: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    processing_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    processing_started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    processing_completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    status = synonym("processing_status")
    error_message = synonym("processing_error")
    started_at = synonym("processing_started_at")
    completed_at = synonym("processing_completed_at")

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

    meta_info: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    metadata_info: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)

    # Chunk versioning (mirrors Claim pattern)
    is_active: Mapped[bool] = mapped_column(default=True, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    superseded_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("chunks.id", ondelete="SET NULL"),
        nullable=True
    )

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
        Index("ix_chunks_tsv", text("tsv"), postgresql_using="gin"),
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
    chunk_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("chunks.id", ondelete="CASCADE"),
        nullable=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[Optional[List[float]]] = mapped_column(Vector(settings.EMBEDDING_DIMENSION), nullable=True)
    claim_type: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, index=True, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    quote: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
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
    tutor_conversations: Mapped[List["SubjectTutorConversation"]] = relationship("SubjectTutorConversation", back_populates="subject",
                                                                                    cascade="all, delete-orphan", lazy="selectin")
    conversations = relationship("Conversation", back_populates="subject", lazy="selectin")
    sources: Mapped[List["Source"]] = relationship("Source", secondary=subject_sources, lazy="selectin")
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

    subject_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    topic_id: Mapped[str] = mapped_column(String(255), nullable=False, default="general")
    chat_mode: Mapped[str] = mapped_column(String(50), nullable=False, default="mentor")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (
        UniqueConstraint('subject_id', 'topic_id', 'chat_mode', name='uix_subject_topic_mode'),
    )

    subject: Mapped["Subject"] = relationship("Subject", back_populates="tutor_conversations")
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


class FocusSession(Base, TimestampedUUIDMixin):
    __tablename__ = "focus_sessions"

    session_type = Column(String(32), nullable=False, default="focus")  # "focus", "short_break", "long_break"
    target_duration_min = Column(Integer, nullable=False, default=25)
    actual_duration_sec = Column(Integer, nullable=False, default=0)
    
    subject_id = Column(PG_UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True, index=True)
    task_id = Column(PG_UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True)
    task_name = Column(String(255), nullable=True)
    session_notes = Column(Text, nullable=True)
    
    completed = Column(Boolean, nullable=False, default=False)
    interrupted = Column(Boolean, nullable=False, default=False)


class TaskStatus(str, enum.Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    ARCHIVED = "archived"


class TaskPriority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Task(Base, TimestampedUUIDMixin):
    __tablename__ = "tasks"

    title = Column(String(512), nullable=False)
    description = Column(Text, nullable=True)

    status = Column(
        SQLEnum(TaskStatus, name="task_status_enum", native_enum=False),
        default=TaskStatus.TODO,
        nullable=False,
        index=True,
    )
    priority = Column(
        SQLEnum(TaskPriority, name="task_priority_enum", native_enum=False),
        default=TaskPriority.MEDIUM,
        nullable=False,
    )

    source_id = Column(
        PG_UUID(as_uuid=True),
        ForeignKey("sources.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    subject_id = Column(
        PG_UUID(as_uuid=True),
        ForeignKey("subjects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    topic_name = Column(String(256), nullable=True, index=True)

    due_date = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(
        String(64), default="user", nullable=False
    )  # 'user', 'ai_agent', 'adaptive_engine'


class ConceptMastery(Base):
    __tablename__ = "concept_mastery"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subject_id = Column(
        PG_UUID(as_uuid=True),
        ForeignKey("subjects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    node_id = Column(String, nullable=True, index=True)
    topic_name = Column(String, nullable=False, index=True)

    # Метрики мастерства
    mastery_level = Column(Float, default=0.0, nullable=False)  # 0.0 - 1.0
    total_attempts = Column(Integer, default=0, nullable=False)
    successful_attempts = Column(Integer, default=0, nullable=False)

    # SM-2 параметры для концепта
    ease_factor = Column(Float, default=2.5, nullable=False)
    interval_days = Column(Integer, default=0, nullable=False)
    last_reviewed_at = Column(
        DateTime(timezone=True), server_default=func.now()
    )
    next_review_due = Column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    __table_args__ = (
        UniqueConstraint(
            "subject_id", "topic_name", name="uq_subject_topic_mastery"
        ),
    )
class LearningAttempt(Base, TimestampedUUIDMixin):
    __tablename__ = 'learning_attempts'

    user_id = Column(PG_UUID(as_uuid=True), ForeignKey('user_profiles.id', ondelete='CASCADE'), nullable=True)
    concept_id = Column(PG_UUID(as_uuid=True), ForeignKey('concepts.id', ondelete='SET NULL'), nullable=True)
    success = Column(Boolean, default=False)
    score = Column(Float, default=0.0)
    item_type = Column(String(50), default="quiz")  # 'quiz', 'flashcard', 'sandbox_code'

class Playlist(Base, TimestampedUUIDMixin):
    __tablename__ = 'playlists'

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    last_played_item_id = Column(PG_UUID(as_uuid=True), ForeignKey('playlist_items.id', ondelete='SET NULL'), nullable=True)

    items = relationship("PlaylistItem", back_populates="playlist", cascade="all, delete-orphan", foreign_keys="PlaylistItem.playlist_id")


class PlaylistItem(Base, TimestampedUUIDMixin):
    __tablename__ = 'playlist_items'

    playlist_id = Column(PG_UUID(as_uuid=True), ForeignKey('playlists.id', ondelete='CASCADE'), nullable=False)
    source_id = Column(PG_UUID(as_uuid=True), ForeignKey('sources.id', ondelete='CASCADE'), nullable=False)
    order_index = Column(Integer, default=0, nullable=False)

    playlist = relationship("Playlist", back_populates="items", foreign_keys=[playlist_id])
    source = relationship("Source")


# --- МОДУЛЬ КИНЕТИКИ ---

class BiometricsLog(Base, TimestampedUUIDMixin):
    __tablename__ = 'biometrics_logs'

    user_id = Column(PG_UUID(as_uuid=True), ForeignKey('user_profiles.id', ondelete='CASCADE'), nullable=False)
    timestamp = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=True)
    
    # Вес и состав
    weight = Column(Float, nullable=True)
    weight_kg = Column(Float, nullable=True)
    body_fat_percentage = Column(Float, nullable=True)
    body_fat_pct = Column(Float, nullable=True)
    fat_mass_kg = Column(Float, nullable=True)
    skeletal_muscle_kg = Column(Float, nullable=True)
    muscle_kg = Column(Float, nullable=True)
    water_l = Column(Float, nullable=True)
    protein_kg = Column(Float, nullable=True)
    protein_g = Column(Integer, nullable=True)
    minerals_kg = Column(Float, nullable=True)
    visceral_fat_level = Column(Integer, nullable=True)
    visceral_fat = Column(Integer, nullable=True)
    bmr_kcal = Column(Integer, nullable=True)
    bmr = Column(Integer, nullable=True)
    bmi = Column(Float, nullable=True)

    # Энергобаланс и восстановление
    calories_in = Column(Integer, default=0, nullable=True)
    tdee = Column(Integer, default=0, nullable=True)
    sleep_hours = Column(Float, default=8.0, nullable=True)
    fatigue_score = Column(Integer, default=0, nullable=True)
    notes = Column(Text, nullable=True)

    # InBody сегменты
    segment_data = Column(JSONB, default=dict, nullable=True)
    segment_fat_pct = Column(JSONB, default=dict, nullable=True)


class WorkoutPlan(Base, TimestampedUUIDMixin):
    __tablename__ = 'workout_plans'

    user_id = Column(PG_UUID(as_uuid=True), ForeignKey('user_profiles.id', ondelete='CASCADE'), nullable=False)
    target_split = Column(String(150), nullable=True)
    location = Column(String(50), default='Дом', nullable=True)
    split_day = Column(String(150), nullable=True)
    ai_rationale = Column(Text, nullable=True)
    status = Column(String(50), default='planned', nullable=True)

    exercises = relationship("WorkoutExercise", back_populates="plan", cascade="all, delete-orphan", lazy="selectin")


class WorkoutExercise(Base, TimestampedUUIDMixin):
    __tablename__ = 'workout_exercises'

    plan_id = Column(PG_UUID(as_uuid=True), ForeignKey('workout_plans.id', ondelete='CASCADE'), nullable=True)
    workout_id = Column(PG_UUID(as_uuid=True), nullable=True)
    exercise_name = Column(String(255), nullable=False)
    exercise_type = Column(String(50), default='bodyweight', nullable=True)
    sets = Column(Integer, default=3, nullable=True)
    reps_or_duration = Column(String(100), default='10-12', nullable=True)
    rpe = Column(Integer, nullable=True)
    rpe_target = Column(Integer, nullable=True)
    workout_sets = relationship("WorkoutSet", back_populates="exercise", cascade="all, delete-orphan", lazy="selectin")
    target_muscle_groups = Column(ARRAY(Text), default=list, nullable=True)
    is_completed = Column(Boolean, default=False, nullable=True)
    order_index = Column(Integer, default=0, nullable=True)

    plan = relationship("WorkoutPlan", back_populates="exercises")

class AthleteProfile(Base, TimestampedUUIDMixin):
    __tablename__ = 'athlete_profiles'

    user_id = Column(PG_UUID(as_uuid=True), ForeignKey('user_profiles.id', ondelete='CASCADE'), unique=True, nullable=False)
    age = Column(Integer, default=22)
    gender = Column(String(20), default="Мужской")
    height_cm = Column(Float, default=181.0)
    target_fat_pct = Column(Float, default=15.0)
    target_weight_kg = Column(Float, default=85.0)

    goals = Column(ARRAY(Text), default=lambda: ["Похудение"])
    lagging_muscles = Column(ARRAY(Text), default=lambda: ["Грудь", "Спина", "Ноги"])
    training_experience = Column(String(50), default="Средний")
    last_break = Column(String(50), default="Более года")

    workout_frequency = Column(Integer, default=6)
    duration_min = Column(Integer, default=90)
    preferred_time = Column(String(20), default="16:30")
    schedule_days = Column(ARRAY(Text), default=lambda: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"])
    restrictions = Column(Text, default="Исключить беговое кардио, акцент на fullbody, делить: дом (калистеника) вт/чт, зал пн/ср/пт/сб")

    strength_bench = Column(Float, default=100.0)
    strength_squat = Column(Float, default=120.0)
    strength_deadlift = Column(Float, default=120.0)
    pullups_reps = Column(Integer, default=10)

    mobility_squat = Column(Integer, default=5)
    mobility_shoulder = Column(Integer, default=5)
    mobility_bend = Column(Integer, default=5)


class TrainingLog(Base, TimestampedUUIDMixin):
    __tablename__ = 'training_logs'

    user_id = Column(PG_UUID(as_uuid=True), ForeignKey('user_profiles.id', ondelete='CASCADE'), nullable=False)
    log_date = Column(Date, default=func.current_date())
    rpe_overall = Column(Integer, default=7)
    energy_level = Column(Integer, default=7)
    notes = Column(Text, nullable=True)
    lessons_learned = Column(Text, nullable=True)


class TrainingResearch(Base, TimestampedUUIDMixin):
    __tablename__ = 'training_researches'

    user_id = Column(PG_UUID(as_uuid=True), ForeignKey('user_profiles.id', ondelete='CASCADE'), nullable=False)
    source_url = Column(String(1000), nullable=True)

class KineticsChatLog(Base, TimestampedUUIDMixin):
    __tablename__ = 'kinetics_chat_logs'

    user_id = Column(PG_UUID(as_uuid=True), ForeignKey('user_profiles.id', ondelete='CASCADE'), nullable=False)
    module = Column(String(50), nullable=False) # 'coach' or 'nutrition'
    role = Column(String(50), nullable=False) # 'user' or 'assistant'
    message = Column(Text, nullable=False)
    log_date = Column(Date, default=func.current_date(), index=True)

class KineticsInsight(Base, TimestampedUUIDMixin):
    __tablename__ = 'kinetics_insights'

    user_id = Column(PG_UUID(as_uuid=True), ForeignKey('user_profiles.id', ondelete='CASCADE'), nullable=False)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    insight_text = Column(Text, nullable=False)
    module = Column(String(50), nullable=False)

    pmid = Column(String(50), nullable=True, index=True)
    abstract = Column(Text, nullable=True)
    key_takeaways = Column(Text, nullable=False)
    tags = Column(ARRAY(String), default=list)
    applied_to_protocol = Column(Boolean, default=False)

    embedding = mapped_column(Vector(settings.EMBEDDING_DIMENSION), nullable=True)

    __table_args__ = (
        Index(
            "ix_training_researches_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"}
        ),
    )


class KineticsNutritionMeal(Base):
    __tablename__ = "kinetics_nutrition_meals"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False)
    meal_date = Column(Date, nullable=False)  # YYYY-MM-DD
    time_str = Column(String(10), default="12:00")
    name = Column(String(255), nullable=False)
    weight_g = Column(Float, default=200.0)
    calories = Column(Float, nullable=False)
    protein = Column(Float, default=0.0)
    fat = Column(Float, default=0.0)
    carbs = Column(Float, default=0.0)
    ingredients = Column(JSONB, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_nutrition_user_date", "user_id", "meal_date"),
    )

import enum
class SetType(str, enum.Enum):
    WARMUP = "W"
    NORMAL = "N"
    DROPSET = "D"
    FAILURE = "F"

class WorkoutSet(Base):
    __tablename__ = "kinetics_workout_sets"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exercise_id = Column(
        PG_UUID(as_uuid=True), 
        ForeignKey("workout_exercises.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    set_number = Column(Integer, nullable=False)
    set_type = Column(sqlalchemy.Enum(SetType), default=SetType.NORMAL)
    weight_kg = Column(Float, default=0.0)
    reps = Column(Integer, default=0)
    rpe = Column(Float, nullable=True)
    is_completed = Column(Boolean, default=False)
    previous_weight_kg = Column(Float, nullable=True)
    previous_reps = Column(Integer, nullable=True)

    exercise = relationship("WorkoutExercise", back_populates="workout_sets")

    __table_args__ = (
        Index("ix_sets_exercise_order", "exercise_id", "set_number"),
    )
