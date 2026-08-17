import asyncio
import sys
import uuid
from pathlib import Path
from sqlalchemy.exc import IntegrityError

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.session import async_session_factory
from app.db.models import Claim, ClaimRelation, Entity, Source, Chunk

async def run_tests():
    async with async_session_factory() as db:
        # Create dummy source and chunk
        source_id = uuid.uuid4()
        chunk_id = uuid.uuid4()
        
        source = Source(id=source_id, title="Test", content="Test", status="completed")
        chunk = Chunk(id=chunk_id, source_id=source_id, chunk_index=0, text_content="Test chunk")
        
        db.add_all([source, chunk])
        await db.commit()
        
        claim1 = Claim(id=uuid.uuid4(), source_id=source_id, chunk_id=chunk_id, content="Claim 1", claim_type="fact", category="Gen", confidence=1.0)
        claim2 = Claim(id=uuid.uuid4(), source_id=source_id, chunk_id=chunk_id, content="Claim 2", claim_type="fact", category="Gen", confidence=1.0)
        
        db.add_all([claim1, claim2])
        await db.flush()
        
        c1_id = claim1.id
        c2_id = claim2.id
        
        await db.commit()
        
        # Test 1: self relation rejected
        print("Testing self-relation rejection...")
        rel_self = ClaimRelation(source_claim_id=c1_id, target_claim_id=c1_id, relation_type="supports", confidence=0.8)
        db.add(rel_self)
        try:
            await db.commit()
            print("❌ FAIL: Self relation was accepted.")
        except IntegrityError as e:
            await db.rollback()
            if "check_no_self_relation" in str(e):
                print("✅ PASS: Self relation rejected by check_no_self_relation.")
            else:
                print("❌ FAIL: Wrong integrity error:", e)

        # Test 2: confidence range (< 0)
        print("Testing confidence < 0 rejection...")
        rel_conf_low = ClaimRelation(source_claim_id=c1_id, target_claim_id=c2_id, relation_type="supports", confidence=-0.1)
        db.add(rel_conf_low)
        try:
            await db.commit()
            print("❌ FAIL: Negative confidence was accepted.")
        except IntegrityError as e:
            await db.rollback()
            if "check_confidence_range" in str(e):
                print("✅ PASS: Negative confidence rejected.")
            else:
                print("❌ FAIL: Wrong integrity error:", e)

        # Test 3: duplicate relation rejected
        print("Testing duplicate relation rejection...")
        rel1 = ClaimRelation(source_claim_id=c1_id, target_claim_id=c2_id, relation_type="supports", confidence=0.8)
        db.add(rel1)
        await db.commit()
        
        rel2 = ClaimRelation(source_claim_id=c1_id, target_claim_id=c2_id, relation_type="supports", confidence=0.9)
        db.add(rel2)
        try:
            await db.commit()
            print("❌ FAIL: Duplicate relation was accepted.")
        except IntegrityError as e:
            await db.rollback()
            if "ix_unique_relation" in str(e):
                print("✅ PASS: Duplicate relation rejected.")
            else:
                print("❌ FAIL: Wrong integrity error:", e)

if __name__ == "__main__":
    if sys.platform.startswith("win"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(run_tests())
