from typing import List, Tuple
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import Source, Claim, Chunk
from app.learning.schemas import LearningScope

class LearningContextResolver:
    def __init__(self, db_session):
        self.db = db_session

    async def resolve(self, scope: LearningScope):
        query = select(Source).where(Source.is_deleted.is_(False))

        # 1. Если переданы конкретные ID файлов
        if scope.source_ids:
            query = query.where(Source.id.in_(scope.source_ids))

        # 2. Если выбрана папка
        elif scope.folder:
            from sqlalchemy import or_, func
            # Нормализуем слэши: заменяем обратные на прямые и убираем края
            norm_target = scope.folder.replace("\\", "/").strip("/").lower()
            
            # Нормализация folder в БД
            clean_folder = func.lower(func.replace(func.coalesce(Source.folder, ''), '\\', '/'))
            
            # Дополнительная проверка по file_path / virtual_path, если поле folder пустое
            clean_path = func.lower(func.replace(func.coalesce(getattr(Source, 'file_path', Source.folder), ''), '\\', '/'))

            query = query.where(
                or_(
                    clean_folder == norm_target,
                    clean_folder == f"/{norm_target}",
                    clean_folder.like(f"{norm_target}/%"),
                    clean_folder.like(f"/{norm_target}/%"),
                    clean_folder.like(f"%{norm_target}%"),
                    clean_path.like(f"%{norm_target}%")
                )
            )

        # 3. Если выбраны домены
        elif scope.domains:
            domain_strs = [d.value if hasattr(d, "value") else str(d) for d in scope.domains]
            query = query.where(Source.domain.in_(domain_strs))

        result = await self.db.execute(query)
        sources = result.scalars().all()

        if not sources:
            return [], [], []

        source_ids = [s.id for s in sources]

        # Подтягиваем чанки
        chunks_res = await self.db.execute(
            select(Chunk).where(Chunk.source_id.in_(source_ids)).limit(60)
        )
        chunks = list(chunks_res.scalars().all())

        # Подтягиваем клеймы
        claims_res = await self.db.execute(
            select(Claim).where(Claim.source_id.in_(source_ids)).limit(60)
        )
        claims = list(claims_res.scalars().all())

        return sources, claims, chunks

