import asyncio
import json
import os
import uuid
from typing import List, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import async_session_factory, engine
from app.db.base import Base
from app.api.chat import _build_context_and_check_evidence
from app.schemas.chat import ChatRequest
from app.knowledge.intent_classifier import classify_intent
from app.knowledge.ingestion import create_source_db, process_source_chunks_bg
from app.knowledge.chat_pipeline import process_chat_pipeline

CORPUS_DIR = os.path.join(os.path.dirname(__file__), "corpus")
DATASET_PATH = os.path.join(os.path.dirname(__file__), "eval_dataset.json")

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
        
    # Execute pgvector extension creation
    async with engine.begin() as conn:
        from sqlalchemy import text
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))

async def ingest_corpus(db: AsyncSession):
    print("Ingesting test corpus...")
    files = os.listdir(CORPUS_DIR)
    for f in files:
        path = os.path.join(CORPUS_DIR, f)
        if f.endswith('.md'):
            with open(path, 'r', encoding='utf-8') as file:
                content = file.read()
            source = await create_source_db(db, title=f, content=content, source_type="markdown")
            await process_source_chunks_bg(source.id)
        elif f.endswith('.json'):
            with open(path, 'r', encoding='utf-8') as file:
                chat_data = json.load(file)
            await process_chat_pipeline(db, chat_data, title=f)
    print("Corpus ingested.")

async def evaluate():
    async with async_session_factory() as db:
        
        with open(DATASET_PATH, 'r', encoding='utf-8') as f:
            dataset = json.load(f)
            
        print("\n=== Running Evaluation ===")
        
        results = {
            "total": len(dataset),
            "hits": 0,
            "negatives_caught": 0,
            "misses": 0
        }
        
        for item in dataset:
            question = item["question"]
            must_reject = item["must_reject"]
            expected_keywords = item.get("expected_context_keywords", [])
            expected_decisions = item.get("expected_decisions", [])
            
            payload = ChatRequest(
                query=question,
                history=[],
                conversation_id=uuid.uuid4(),
                stream=False
            )
            
            print(f"\nQ: {question} [{item['category']}]")
            
            intent = await classify_intent(question)
            
            try:
                is_sufficient, context_results, sq, intent = await _build_context_and_check_evidence(db, payload, intent)
                
                if not is_sufficient:
                    if must_reject:
                        print("  ✅ PASS (Evidence Gate caught it)")
                        results["negatives_caught"] += 1
                    else:
                        print("  ❌ FAIL: Evidence Gate rejected valid question.")
                        results["misses"] += 1
                    continue
                
                if must_reject:
                    print("  ❌ FAIL: Evidence Gate should have rejected this but it passed.")
                    results["misses"] += 1
                    continue
                    
                context_text = " ".join([r["text_content"] for r in context_results])
                
                # Semantic Validation (Вариант 2)
                expected_semantics = item.get("expected_semantics")
                hit = True
                
                if expected_semantics:
                    from app.knowledge.embeddings.factory import get_embedding_provider
                    provider = get_embedding_provider()
                    
                    # 1. Embed the expected meaning
                    expected_emb = await provider.embed_query(expected_semantics)
                    # 2. Embed the extracted context
                    # If context is very long, BGE-M3 handles up to 8192 tokens. We can safely embed it.
                    # Or chunk it, but usually the context_text from top-k retrieved chunks is around 1000-2000 tokens.
                    context_emb = await provider.embed_query(context_text[:5000]) # Cap text to avoid extreme lengths
                    
                    # Calculate cosine similarity
                    import numpy as np
                    expected_arr = np.array(expected_emb)
                    context_arr = np.array(context_emb)
                    sim = np.dot(expected_arr, context_arr) / (np.linalg.norm(expected_arr) * np.linalg.norm(context_arr))
                    
                    if sim < 0.45:
                        print(f"  ❌ FAIL: Semantic similarity {sim:.3f} < 0.45")
                        hit = False
                    else:
                        print(f"  ✅ PASS: Semantic similarity {sim:.3f}")
                
                if hit:
                    if not expected_semantics:
                        print("  ✅ PASS")
                    results["hits"] += 1
                else:
                    results["misses"] += 1
                    
            except Exception as e:
                print(f"  ❌ FAIL with unexpected error: {e}")
                results["misses"] += 1
                    
        print("\n=== Final Results ===")
        print(f"Total Tests: {results['total']}")
        print(f"Hits: {results['hits']}")
        print(f"Negatives Caught: {results['negatives_caught']}")
        print(f"Misses: {results['misses']}")
        
        hit_rate = (results['hits'] + results['negatives_caught']) / results['total'] * 100
        print(f"Accuracy: {hit_rate:.1f}%")

if __name__ == "__main__":
    asyncio.run(evaluate())
