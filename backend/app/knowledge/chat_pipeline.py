import logging
import json
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..db.models import Conversation, ConversationMessage, ConversationSegment, ConversationMemory, Decision, Claim
from ..core.llm import model_manager, TaskType

logger = logging.getLogger(__name__)

class DecisionItem(BaseModel):
    decision: str = Field(description="Формулировка принятого решения")
    rationale: str = Field(description="Почему было принято именно это решение")
    alternatives: List[str] = Field(default_factory=list, description="Какие варианты рассматривались, но были отвергнуты")

class FlatSummary(BaseModel):
    problem: str = Field(description="Основная проблема или задача, которая решалась в диалоге")
    context: str = Field(description="Ключевые технические или проектные ограничения")
    attempts: List[str] = Field(default_factory=list, description="Неудачные попытки или промежуточные тупиковые шаги")
    outcome: str = Field(description="Финальный овеществленный результат (код, конфиг, выбор)")

class DecisionsExtraction(BaseModel):
    decisions: List[DecisionItem] = Field(default_factory=list, description="Список ключевых решений, принятых в сессии")
    claims: List[str] = Field(default_factory=list, description="2-4 долгосрочных правила или факта, извлеченных ИСКЛЮЧИТЕЛЬНО из итогового решения")

STEP1_SUMMARY_PROMPT = """
Проанализируй диалог технической сессии и извлеки из него сухой практический ОПЫТ.
Сфокусируйся на:
1. Проблема: Какую реальную задачу решал пользователь?
2. Попытки: Какие гипотезы провалились и почему?
3. Результат: К какому итогу пришли?

Анализируемый текст:
{text}
"""

STEP2_DECISIONS_PROMPT = """
На основе описания решения задачи, извлеки конкретные архитектурные решения и долгосрочные факты.

Текст решения (Outcome):
{outcome}
"""

async def process_chat_pipeline(db: AsyncSession, chat_data: Dict[str, Any], title: str = "Imported Chat", platform: str = "chatgpt"):
    """
    Выполняет 2.5-этапную обработку чата.
    chat_data ожидается в формате словаря, содержащего 'mapping' или список сообщений.
    """
    logger.info(f"Starting chat pipeline for: {title}")
    
    # 1. Structural Parser
    conversation = Conversation(
        title=title,
        platform=platform,
        status="processing"
    )
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)

    messages = []
    # Извлечение сообщений в зависимости от формата (упрощенно)
    if isinstance(chat_data, list):
        for idx, msg in enumerate(chat_data):
            if isinstance(msg, dict) and "content" in msg and "role" in msg:
                content = msg["content"]
                if not content or len(content.strip()) < 2:
                    continue
                messages.append(ConversationMessage(
                    conversation_id=conversation.id,
                    role=msg["role"],
                    content=content,
                    sequence_num=idx
                ))
    elif isinstance(chat_data, dict) and "mapping" in chat_data:
        # ChatGPT export format
        seq = 0
        for node_id, node in chat_data["mapping"].items():
            if "message" in node and node["message"]:
                msg = node["message"]
                if msg.get("author", {}).get("role") in ["user", "assistant"]:
                    parts = msg.get("content", {}).get("parts", [])
                    content = "".join([str(p) for p in parts if isinstance(p, str)])
                    if content and len(content.strip()) > 2:
                        messages.append(ConversationMessage(
                            conversation_id=conversation.id,
                            role=msg["author"]["role"],
                            content=content,
                            sequence_num=seq
                        ))
                        seq += 1

    if not messages:
        logger.warning("No valid messages found in chat.")
        return None

    db.add_all(messages)
    await db.commit()

    # 2. Conversation Segmenter
    # Упрощенная логика: берем все сообщения как один сегмент (можно улучшить позже для больших чатов)
    segment_text = "\\n".join([f"{m.role}: {m.content}" for m in messages])
    segment = ConversationSegment(
        conversation_id=conversation.id,
        topic=title,
        start_seq=0,
        end_seq=len(messages) - 1,
        local_summary=""
    )
    db.add(segment)
    await db.commit()

    # 3. Step 1: Local Summarizer
    prompt1 = STEP1_SUMMARY_PROMPT.format(text=segment_text[:8000])
    try:
        summary = await model_manager.generate_structured(
            task_type=TaskType.EXTRACTION,
            schema=FlatSummary,
            prompt=prompt1,
            allow_cloud_fallback=True
        )
    except Exception as e:
        logger.error(f"Step 1 extraction failed: {e}")
        summary = None

    if summary:
        memory = ConversationMemory(
            conversation_id=conversation.id,
            problem=summary.problem,
            context=summary.context,
            attempts=summary.attempts,
            decision_summary=summary.outcome,
            outcome=summary.outcome
        )
        # 3.5 Optional ML Enrichment (Embedding)
        from ..knowledge.embeddings.factory import get_embedding_provider
        provider = get_embedding_provider()
        memory_text = f"Problem: {summary.problem}\nOutcome: {summary.outcome}"
        try:
            emb = await provider.embed_documents([memory_text])
            if emb and len(emb) > 0:
                memory.embedding = emb[0]
        except Exception as e:
            logger.warning(f"ML Enrichment (embedding) failed for ConversationMemory: {e}")
            memory.embedding = None
            
        db.add(memory)
        await db.flush()

        # 4. Step 2: Decision Extraction
        prompt2 = STEP2_DECISIONS_PROMPT.format(outcome=summary.outcome)
        try:
            decisions_extract = await model_manager.generate_structured(
                task_type=TaskType.EXTRACTION,
                schema=DecisionsExtraction,
                prompt=prompt2,
                allow_cloud_fallback=True
            )
        except Exception as e:
            logger.error(f"Step 2 extraction failed: {e}")
            decisions_extract = None
            
        if decisions_extract:
            for dec in decisions_extract.decisions:
                dec_text = f"Decision: {dec.decision}\nRationale: {dec.rationale}"
                dec_emb = None
                try:
                    emb_res = await provider.embed_documents([dec_text])
                    if emb_res and len(emb_res) > 0:
                        dec_emb = emb_res[0]
                except Exception as e:
                    logger.warning(f"ML Enrichment (embedding) failed for Decision: {e}")
                
                db.add(Decision(
                    memory_id=memory.id,
                    decision=dec.decision,
                    rationale=dec.rationale,
                    alternatives=dec.alternatives,
                    embedding=dec_emb
                ))
                
            if decisions_extract.claims:
                # Need a Source and Chunk to link the claims to
                # Create a generic Source for this conversation
                from ..db.models import Source, Chunk
                
                chat_source = Source(
                    title=f"Chat: {conversation.title}",
                    source_type="chat",
                    original_file_path=f"chat://{conversation.id}",
                    file_hash=str(conversation.id)[:32]
                )
                db.add(chat_source)
                await db.flush()
                
                chat_chunk = Chunk(
                    source_id=chat_source.id,
                    text_content=summary.outcome,
                    chunk_index=0
                )
                db.add(chat_chunk)
                await db.flush()

                for claim_text in decisions_extract.claims:
                    db.add(Claim(
                        content=claim_text,
                        claim_type="fact",
                        importance=1.0,
                        source_id=chat_source.id,
                        chunk_id=chat_chunk.id,
                        kind="fact",
                        scope="project"
                    ))

        conversation.status = "indexed"
        await db.commit()
        num_dec = len(decisions_extract.decisions) if decisions_extract else 0
        num_claims = len(decisions_extract.claims) if decisions_extract else 0
        logger.info(f"Successfully processed chat into {num_dec} decisions and {num_claims} claims.")
    else:
        conversation.status = "error"
        await db.commit()
        logger.warning("Failed to extract experience.")
        
    return conversation

