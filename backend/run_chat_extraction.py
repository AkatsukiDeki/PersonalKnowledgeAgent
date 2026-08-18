import asyncio
import logging
from sqlalchemy import select, update
from app.db.session import async_session_factory
from app.db.models import Source, Chunk, Conversation, ConversationMemory, Decision, Claim
from app.core.llm import model_manager, TaskType
from app.knowledge.chat_pipeline import STEP1_SUMMARY_PROMPT, STEP2_DECISIONS_PROMPT, FlatSummary, DecisionsExtraction

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def run_chat_extraction():
    async with async_session_factory() as db:
        # Find all chat or chat_export sources that haven't been extracted yet
        stmt = select(Source).where(Source.source_type.in_(['chat', 'chat_export']))
        res = await db.execute(stmt)
        sources = res.scalars().all()
        
        for source in sources:
            meta = source.metadata_info or {}
            if meta.get("extraction_done"):
                continue
                
            logger.info(f"Processing Source {source.id}: {source.title}")
            
            # Fetch chunks
            chunk_res = await db.execute(select(Chunk).where(Chunk.source_id == source.id).order_by(Chunk.chunk_index))
            chunks = chunk_res.scalars().all()
            
            if not chunks:
                continue
                
            segment_text = "\n".join([c.text_content for c in chunks])
            
            # Create Conversation if it doesn't exist
            conv_id = None
            external_id = meta.get("external_id", "")
            
            # For simplicity, we just create a new Conversation
            conversation = Conversation(
                title=source.title,
                platform=meta.get("provider", "unknown"),
                status="processing"
            )
            db.add(conversation)
            await db.flush()
            conv_id = conversation.id
            
            # Step 1
            prompt1 = STEP1_SUMMARY_PROMPT.format(text=segment_text[:8000])
            try:
                summary = await model_manager.generate_structured(
                    task_type=TaskType.EXTRACTION,
                    schema=FlatSummary,
                    prompt=prompt1,
                    allow_cloud_fallback=True
                )
            except Exception as e:
                logger.error(f"Step 1 failed for {source.id}: {e}")
                continue
                
            if summary:
                memory = ConversationMemory(
                    conversation_id=conv_id,
                    problem=summary.problem,
                    context=summary.context,
                    attempts=summary.attempts,
                    decision_summary=summary.outcome,
                    outcome=summary.outcome
                )
                db.add(memory)
                await db.flush()
                
                # Step 2
                prompt2 = STEP2_DECISIONS_PROMPT.format(outcome=summary.outcome)
                try:
                    decisions_extract = await model_manager.generate_structured(
                        task_type=TaskType.EXTRACTION,
                        schema=DecisionsExtraction,
                        prompt=prompt2,
                        allow_cloud_fallback=True
                    )
                except Exception as e:
                    logger.error(f"Step 2 failed for {source.id}: {e}")
                    decisions_extract = None
                    
                if decisions_extract:
                    for dec in decisions_extract.decisions:
                        db.add(Decision(
                            memory_id=memory.id,
                            decision=dec.decision,
                            rationale=dec.rationale,
                            alternatives=dec.alternatives
                        ))
                        
                    for claim_text in decisions_extract.claims:
                        db.add(Claim(
                            content=claim_text,
                            claim_type="fact",
                            importance=1.0,
                            source_id=source.id,
                            chunk_id=chunks[0].id,
                            kind="fact",
                            scope="project",
                            memory_score=1.0
                        ))
                        
                conversation.status = "indexed"
                
                # Mark source as done
                meta["extraction_done"] = True
                source.metadata_info = meta
                db.add(source)
                
                await db.commit()
                logger.info(f"Successfully processed and committed {source.title}")

if __name__ == "__main__":
    asyncio.run(run_chat_extraction())
