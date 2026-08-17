import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pgvector.sqlalchemy import Vector
from ..core.config import settings
from sqlalchemy import ForeignKey, Index, Integer, String, Text, Float, Table, Column, CheckConstraint, DateTime
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID as PG_UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampedUUIDMixin


class Source(Base, TimestampedUUIDMixin):
    __tablename__ = "sources"

    title: Mapped[str] = mapped_column(String, nullable=False)
    source_type: Mapped[str] = mapped_column(String, default="note", nullable=False)
    importance: Mapped[str] = mapped_column(String(20), default="normal", index=True) # temporary, normal, important, critical
    domain: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False, index=True)
    meta_info: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)

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
        nullable=False
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
    kind: Mapped[str] = mapped_column(String(50), default="fact", index=True) # fact, decision, habit, preference, observation, plan
    scope: Mapped[str] = mapped_column(String(50), default="global") # global, project, personal
    
    # Метрики Knowledge Scoring
    stability: Mapped[float] = mapped_column(Float, default=0.5)      # 0.1 (эпизод) .. 1.0 (долгосрочный принцип)
    importance: Mapped[float] = mapped_column(Float, default=1.0)     # наследуется от Source
    recurrence: Mapped[int] = mapped_column(Integer, default=1)       # счетчик повторений
    memory_score: Mapped[float] = mapped_column(Float, default=0.5, index=True) # вычисляемый ранг (Durable >= 0.60)
    
    # Жизненный цикл и Temporal State
    lifecycle_status: Mapped[str] = mapped_column(String(20), default="active", index=True) # active, superseded, deprecated
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
    evidence_claim_ids: Mapped[List[uuid.UUID]] = mapped_column(ARRAY(PG_UUID(as_uuid=True)), default=list, nullable=False)
    evidence_chunk_ids: Mapped[List[uuid.UUID]] = mapped_column(ARRAY(PG_UUID(as_uuid=True)), default=list, nullable=False)

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
    evidence_summary: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_claim_ids: Mapped[List[uuid.UUID]] = mapped_column(ARRAY(PG_UUID(as_uuid=True)), default=list, nullable=False)
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
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), default="Новый диалог")
    domain: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True) # devops, architecture, security, general
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)      # active, archived, pinned
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)

    # Relationships
    messages: Mapped[list["Message"]] = relationship(
        "Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at"
    )
    memory: Mapped["ConversationMemory"] = relationship(
        "ConversationMemory", back_populates="conversation", uselist=False, cascade="all, delete-orphan"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False) # user, assistant, system
    content: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True) # e.g. qwen2.5-coder:14b
    context_used: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True) # метрики RAG (l1_count, l2_count, l3_count)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="messages")


class ConversationMemory(Base):
    __tablename__ = "conversation_memories"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), unique=True, index=True
    )
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    active_decisions: Mapped[Optional[list]] = mapped_column(JSONB, default=list) # ["Используем FastAPI", "Hotfix через cherry-pick"]
    open_questions: Mapped[Optional[list]] = mapped_column(JSONB, default=list)   # ["Как настроить retention?"]
    key_claim_ids: Mapped[Optional[list]] = mapped_column(JSONB, default=list)    # [UUID, UUID] - ссылки на связанные Durable Claims
    message_count_at_summary: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="memory")