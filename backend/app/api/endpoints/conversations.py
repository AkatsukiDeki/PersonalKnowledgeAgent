from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.db.models import Conversation, Message, ConversationMemory

router = APIRouter()

class ConversationCreate(BaseModel):
    title: str = "Новый диалог"
    domain: str | None = None

class ConversationUpdate(BaseModel):
    title: str | None = None
    domain: str | None = None
    status: str | None = None # active, archived, pinned

class MessageOut(BaseModel):
    id: UUID
    role: str
    content: str
    model: str | None
    created_at: str

class ConversationDetailOut(BaseModel):
    id: UUID
    title: str
    domain: str | None
    status: str
    created_at: str
    updated_at: str
    summary: str | None
    active_decisions: list
    open_questions: list
    messages: list[MessageOut]

@router.post("", response_model=dict)
async def create_conversation(data: ConversationCreate, db: AsyncSession = Depends(get_db)):
    conv = Conversation(title=data.title, domain=data.domain)
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return {"id": conv.id, "title": conv.title, "domain": conv.domain, "status": conv.status}

@router.get("", response_model=list[dict])
async def list_conversations(
    status: str | None = None,
    limit: int = Query(default=30, le=100),
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Conversation).order_by(desc(Conversation.updated_at)).offset(offset).limit(limit)
    if status:
        stmt = stmt.where(Conversation.status == status)
    res = await db.execute(stmt)
    convs = res.scalars().all()
    return [
        {
            "id": c.id,
            "title": c.title,
            "domain": c.domain,
            "status": c.status,
            "created_at": c.created_at.isoformat(),
            "updated_at": c.updated_at.isoformat()
        }
        for c in convs
    ]

@router.get("/{conversation_id}")
async def get_conversation(conversation_id: UUID, db: AsyncSession = Depends(get_db)):
    conv = await db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Сообщения
    msg_stmt = select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at.asc())
    messages = (await db.execute(msg_stmt)).scalars().all()

    # Память ветки
    mem_stmt = select(ConversationMemory).where(ConversationMemory.conversation_id == conversation_id)
    mem = (await db.execute(mem_stmt)).scalar_one_or_none()

    return {
        "id": conv.id,
        "title": conv.title,
        "domain": conv.domain,
        "status": conv.status,
        "created_at": conv.created_at.isoformat(),
        "updated_at": conv.updated_at.isoformat(),
        "summary": mem.summary if mem else None,
        "active_decisions": mem.active_decisions if mem else [],
        "open_questions": mem.open_questions if mem else [],
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "model": m.model,
                "created_at": m.created_at.isoformat()
            }
            for m in messages
        ]
    }

@router.patch("/{conversation_id}")
async def update_conversation(conversation_id: UUID, data: ConversationUpdate, db: AsyncSession = Depends(get_db)):
    conv = await db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if data.title is not None:
        conv.title = data.title
    if data.domain is not None:
        conv.domain = data.domain
    if data.status is not None:
        conv.status = data.status
    await db.commit()
    return {"status": "ok"}

@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: UUID, db: AsyncSession = Depends(get_db)):
    conv = await db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.delete(conv)
    await db.commit()
    return {"status": "deleted"}
