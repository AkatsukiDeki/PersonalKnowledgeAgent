from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.db.models import Conversation, ConversationMessage, ConversationMemory, Decision

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
    conv = Conversation(title=data.title)
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return {"id": conv.id, "title": conv.title, "domain": None, "status": conv.status}

@router.get("", response_model=list[dict])
async def list_conversations(
    status: str | None = None,
    limit: int = Query(default=30, le=100),
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Conversation).order_by(desc(Conversation.started_at)).offset(offset).limit(limit)
    if status:
        stmt = stmt.where(Conversation.status == status)
    res = await db.execute(stmt)
    convs = res.scalars().all()
    return [
        {
            "id": c.id,
            "title": c.title,
            "domain": None,
            "status": c.status,
            "created_at": c.started_at.isoformat() if c.started_at else "",
            "updated_at": c.ended_at.isoformat() if c.ended_at else ""
        }
        for c in convs
    ]

@router.get("/{conversation_id}")
async def get_conversation(conversation_id: UUID, db: AsyncSession = Depends(get_db)):
    conv = await db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Сообщения
    msg_stmt = select(ConversationMessage).where(ConversationMessage.conversation_id == conversation_id).order_by(ConversationMessage.sequence_num.asc())
    messages = (await db.execute(msg_stmt)).scalars().all()

    # Память ветки
    mem_stmt = select(ConversationMemory).where(ConversationMemory.conversation_id == conversation_id)
    mem = (await db.execute(mem_stmt)).scalar_one_or_none()
    
    decisions_list = []
    memory_dict = None
    if mem:
        dec_stmt = select(Decision).where(Decision.memory_id == mem.id).order_by(Decision.created_at.asc())
        decisions = (await db.execute(dec_stmt)).scalars().all()
        decisions_list = [
            {
                "id": str(d.id),
                "decision": d.decision,
                "rationale": d.rationale,
                "alternatives": d.alternatives,
                "status": d.status,
                "created_at": d.created_at.isoformat() if d.created_at else ""
            } for d in decisions
        ]
        
        memory_dict = {
            "id": str(mem.id),
            "problem": mem.problem,
            "context": mem.context,
            "attempts": mem.attempts,
            "decision_summary": mem.decision_summary,
            "outcome": mem.outcome,
            "importance": mem.importance
        }

    return {
        "id": conv.id,
        "title": conv.title,
        "domain": None,
        "status": conv.status,
        "created_at": conv.started_at.isoformat() if conv.started_at else "",
        "updated_at": conv.ended_at.isoformat() if conv.ended_at else "",
        "memory": memory_dict,
        "decisions": decisions_list,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "model": getattr(m, "model", None),
                "created_at": m.timestamp.isoformat() if m.timestamp else ""
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
