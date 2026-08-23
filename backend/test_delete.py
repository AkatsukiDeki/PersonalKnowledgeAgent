import asyncio
import uuid
from app.db.session import async_session_factory
from app.db.models import Subject

async def main():
    async with async_session_factory() as db:
        # Create
        subj = Subject(title="Test Delete", description="test")
        db.add(subj)
        await db.commit()
        await db.refresh(subj)
        print(f"Created: {subj.id}")
        
        # Delete
        await db.delete(subj)
        await db.commit()
        print("Deleted successfully!")

if __name__ == "__main__":
    asyncio.run(main())
