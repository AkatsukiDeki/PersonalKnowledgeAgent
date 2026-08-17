from collections.abc import AsyncIterator
from typing import Protocol, runtime_checkable
from .models import UnifiedConversation


@runtime_checkable
class BaseChatParser(Protocol):
    provider: str

    async def parse(
        self, file_path: str
    ) -> AsyncIterator[UnifiedConversation]:
        """Потоковое чтение и трансформация платформенного экспорта в UnifiedConversation.

        Поддерживает version-tolerance и выбрасывает UnsupportedExportSchemaError
        при нераспознанной структуре.
        """
        ...
