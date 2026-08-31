from abc import ABC, abstractmethod
from typing import List

from app.schemas.concept import ExtractedConcept

class BaseConceptExtractor(ABC):
    @abstractmethod
    async def extract(self, content: str, title: str, **kwargs) -> List[ExtractedConcept]:
        """Возвращает строго ограниченный список концептов без сохранения в БД."""
        pass
