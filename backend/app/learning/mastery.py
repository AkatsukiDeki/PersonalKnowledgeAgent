import math
from datetime import datetime, timedelta, timezone

class MasteryCalculator:
    """
    Calculates Mastery Level and updates SM-2 intervals.
    """
    
    @staticmethod
    def calculate_mastery_level(total: int, successful: int, ease_factor: float) -> float:
        if total == 0 or successful == 0:
            return 0.0
            
        base_ratio = successful / total
        log_multiplier = math.log2(1 + successful)
        ef_modifier = ease_factor / 2.5
        
        mastery = base_ratio * log_multiplier * ef_modifier
        return min(1.0, max(0.0, mastery))
        
    @staticmethod
    def calculate_next_review(
        is_correct: bool,
        current_interval: int,
        current_ef: float,
        repetitions: int,
        quality: int = None
    ) -> tuple[int, float, int]:
        """
        Standard SM-2 algorithm implementation.
        Returns: (new_interval_days, new_ease_factor, new_repetitions)
        
        Quality is 0-5. If not provided, maps from is_correct: True -> 4, False -> 0
        """
        if quality is None:
            quality = 4 if is_correct else 0
            
        if quality >= 3:
            if repetitions == 0:
                interval = 1
            elif repetitions == 1:
                interval = 6
            else:
                interval = round(current_interval * current_ef)
            new_repetitions = repetitions + 1
        else:
            new_repetitions = 0
            interval = 1
            
        # EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
        new_ef = current_ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        new_ef = max(1.3, new_ef)
        
        return interval, new_ef, new_repetitions

import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..db.models import ConceptMastery, LearningAttempt, Task, TaskStatus, TaskPriority

class MasteryService:
    @staticmethod
    async def _update_mastery(db: AsyncSession, subject_id: uuid.UUID, topic_name: str, is_correct: bool, node_id: Optional[str] = None) -> ConceptMastery:
        stmt = select(ConceptMastery).where(
            ConceptMastery.subject_id == subject_id,
            ConceptMastery.topic_name == topic_name
        )
        result = await db.execute(stmt)
        mastery = result.scalar_one_or_none()
        
        if not mastery:
            mastery = ConceptMastery(
                subject_id=subject_id,
                topic_name=topic_name,
                node_id=node_id,
                ease_factor=2.5,
                interval_days=0,
                total_attempts=0,
                successful_attempts=0
            )
            db.add(mastery)
        
        mastery.total_attempts += 1
        if is_correct:
            mastery.successful_attempts += 1
            mastery.current_streak += 1
        else:
            mastery.current_streak = 0
            
        # SM-2
        interval, new_ef, _ = MasteryCalculator.calculate_next_review(
            is_correct=is_correct,
            current_interval=mastery.interval_days,
            current_ef=mastery.ease_factor,
            repetitions=mastery.current_streak - 1 if is_correct else 0
        )
        
        mastery.interval_days = interval
        mastery.ease_factor = new_ef
        mastery.last_reviewed_at = datetime.now(timezone.utc)
        mastery.next_review_due = mastery.last_reviewed_at + timedelta(days=interval)
        
        mastery.mastery_level = MasteryCalculator.calculate_mastery_level(
            mastery.total_attempts, mastery.successful_attempts, mastery.ease_factor
        )
        
        await db.commit()
        await db.refresh(mastery)
        return mastery

    @staticmethod
    async def record_attempt(
        db: AsyncSession,
        user_id: uuid.UUID,
        subject_id: uuid.UUID,
        topic_name: str,
        is_correct: bool,
        node_id: Optional[str] = None,
        response_time_ms: Optional[int] = None,
        item_type: str = "quiz"
    ):
        mastery = await MasteryService._update_mastery(db, subject_id, topic_name, is_correct, node_id)
        
        attempt = LearningAttempt(
            user_id=user_id,
            concept_id=mastery.id,
            success=is_correct,
            score=1.0 if is_correct else 0.0,
            response_time_ms=response_time_ms,
            item_type=item_type
        )
        db.add(attempt)
        await db.commit()
        
        if not is_correct and mastery.mastery_level < 0.35:
            existing_task = await db.scalar(
                select(Task).where(
                    Task.subject_id == subject_id,
                    Task.topic_name == topic_name,
                    Task.status.in_([TaskStatus.TODO, TaskStatus.IN_PROGRESS]),
                    Task.created_by == "adaptive_engine"
                )
            )
            if not existing_task:
                new_task = Task(
                    title=f"Повторить концепт: {topic_name}",
                    description=f"Автоматически создано адаптивным тренажером. Текущий уровень мастерства: {round(mastery.mastery_level * 100)}%.",
                    priority=TaskPriority.HIGH,
                    status=TaskStatus.TODO,
                    subject_id=subject_id,
                    topic_name=topic_name,
                    created_by="adaptive_engine"
                )
                db.add(new_task)
                await db.commit()
