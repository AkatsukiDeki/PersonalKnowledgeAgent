import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from app.db.session import async_session_factory
from app.db.models import PlannerDomain, Goal, DailyReadiness, UserProfile

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def seed_data():
    async with async_session_factory() as session:
        # Check if domains exist
        result = await session.execute(select(PlannerDomain))
        domains = result.scalars().all()
        
        if not domains:
            logger.info("No domains found. Seeding default domains...")
            default_domains = [
                PlannerDomain(name="Учеба в ВУЗе", color="#6366f1", icon="graduation-cap"),
                PlannerDomain(name="Курсы и Интенсивы", color="#8b5cf6", icon="book-open"),
                PlannerDomain(name="Проекты / Домашнее", color="#d946ef", icon="briefcase"),
                PlannerDomain(name="Спорт и Кинетика", color="#10b981", icon="activity"),
                PlannerDomain(name="Работа", color="#f59e0b", icon="briefcase"),
            ]
            session.add_all(default_domains)
            await session.commit()
            
            # Fetch them back to get their IDs
            result = await session.execute(select(PlannerDomain))
            domains = result.scalars().all()
            
            # Seed Goals for the domains
            if domains:
                logger.info("Seeding default goals...")
                goals = [
                    Goal(domain_id=domains[0].id, title="Закрыть сессию на отлично", status="in_progress"),
                    Goal(domain_id=domains[3].id, title="Набрать массу +3кг", status="in_progress")
                ]
                session.add_all(goals)
                await session.commit()
        else:
            logger.info("Domains already exist. Skipping domain seed.")

        # Get first user for seeding
        result = await session.execute(select(UserProfile))
        user = result.scalars().first()
        if not user:
            logger.info("No UserProfile found. Creating default user...")
            user = UserProfile(username="admin", full_name="Admin")
            session.add(user)
            await session.commit()
            
        today = datetime.now(timezone.utc).date()
        result = await session.execute(select(DailyReadiness).where(DailyReadiness.date == today))
        readiness = result.scalars().first()
        
        if not readiness:
            logger.info("No DailyReadiness for today. Seeding...")
            new_readiness = DailyReadiness(
                user_id=user.id,
                date=today,
                sleep_hours=7.5,
                sleep_quality=4,
                cns_score=8.4,
                tapping_count=45,
                mental_clarity=8,
            )
            session.add(new_readiness)
            await session.commit()
        else:
            logger.info("DailyReadiness for today already exists. Skipping readiness seed.")

        logger.info("Database seeding complete!")

if __name__ == "__main__":
    asyncio.run(seed_data())
