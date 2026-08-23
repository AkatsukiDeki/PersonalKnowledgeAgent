import asyncio
import uuid
from app.db.session import async_session_factory
from app.db.models import Subject, SubjectTutorConversation

async def main():
    async with async_session_factory() as db:
        # Create
        subj = Subject(title="Test Delete with Tutor", description="test")
        db.add(subj)
        await db.commit()
        await db.refresh(subj)
        print(f"Created subject: {subj.id}")
        
        tutor_conv = SubjectTutorConversation(subject_id=subj.id)
        db.add(tutor_conv)
        await db.commit()
        print(f"Created tutor conv: {tutor_conv.id}")
        
        # Delete
        await db.delete(subj)
        try:
            await db.commit()
            print("Deleted successfully!")
        except Exception as e:
            print(f"Error deleting: {e}")

if __name__ == "__main__":
    asyncio.run(main())
