import os
import time
import hashlib
import logging
import asyncio
from pathlib import Path
from typing import Dict, Set
from datetime import datetime, timedelta

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileModifiedEvent, FileCreatedEvent

# Загрузка окружения и настроек ядра
from dotenv import load_dotenv
load_dotenv()

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (Watcher) %(message)s"
)
logger = logging.getLogger("VaultWatcher")

# Конфигурация
from app.core.config import settings
VAULT_PATH = os.getenv("OBSIDIAN_VAULT_PATH", "./data/vault")
DEBOUNCE_SECONDS = 5.0
INSIGHTS_THRESHOLD = 5
INSIGHTS_TIMER_HOURS = 12

IGNORE_DIRS = {".obsidian", ".trash", ".git", ".idea", ".vscode"}


def compute_sha256(file_path: Path) -> str:
    """Вычисляет SHA-256 хэш файла для проверки реальных изменений контента."""
    sha256 = hashlib.sha256()
    try:
        with open(file_path, "rb") as f:
            while chunk := f.read(8192):
                sha256.update(chunk)
        return sha256.hexdigest()
    except Exception as e:
        logger.warning(f"Не удалось прочитать файл {file_path} для хэша: {e}")
        return ""


class VaultDebounceHandler(FileSystemEventHandler):
    """
    Обработчик событий ФС:
    - фильтрует шум и системные папки;
    - накапливает пути в debounce-очередь с таймстемпом последнего изменения.
    """
    def __init__(self, loop, queue: asyncio.Queue):
        super().__init__()
        self.loop = loop
        self.queue = queue

    def _should_ignore(self, path_str: str) -> bool:
        path = Path(path_str)
        if path.suffix.lower() != ".md":
            return True
        for part in path.parts:
            if part in IGNORE_DIRS or part.startswith("."):
                return True
        return False

    def on_modified(self, event):
        if not event.is_directory and not self._should_ignore(event.src_path):
            self.loop.call_soon_threadsafe(self.queue.put_nowait, event.src_path)

    def on_created(self, event):
        if not event.is_directory and not self._should_ignore(event.src_path):
            self.loop.call_soon_threadsafe(self.queue.put_nowait, event.src_path)


class VaultWatcherDaemon:
    """
    Основной сервис синхронизации:
    - разгребает debounce-очередь;
    - сверяет хэши с предыдущим состоянием;
    - вызывает ядро ingestion;
    - управляет гибридным триггером Insights.
    """
    def __init__(self, vault_path: str):
        self.vault_path = Path(vault_path).resolve()
        self.pending_files: Dict[str, float] = {}
        self.file_hashes: Dict[str, str] = {}
        self.processed_count = 0
        self.last_insights_run = datetime.now()

    async def _trigger_insights_if_needed(self, force: bool = False):
        now = datetime.now()
        time_elapsed = now - self.last_insights_run >= timedelta(hours=INSIGHTS_TIMER_HOURS)
        threshold_reached = self.processed_count >= INSIGHTS_THRESHOLD

        if force or threshold_reached or time_elapsed:
            if self.processed_count == 0 and not force:
                return # skip if no changes
            logger.info(
                f"Запуск Insights Engine (Обработано заметок: {self.processed_count}, "
                f"Прошло времени: {now - self.last_insights_run})..."
            )
            try:
                from app.knowledge.insights_engine import InsightsEngine
                from app.db.session import async_session_factory

                async with async_session_factory() as db:
                    engine = InsightsEngine(db)
                    await engine.run_all_heuristics()
                
                logger.info("Insights Engine успешно завершил синтез.")
                self.processed_count = 0
                self.last_insights_run = datetime.now()
            except Exception as e:
                logger.error(f"Ошибка при фоновом запуске Insights Engine: {e}", exc_info=True)

    async def _process_file(self, file_path_str: str):
        file_path = Path(file_path_str)
        if not file_path.exists():
            return

        current_hash = compute_sha256(file_path)
        if not current_hash:
            return

        # Пропускаем, если контент не изменился (например, перезапись без изменений)
        if self.file_hashes.get(file_path_str) == current_hash:
            logger.info(f"Файл {file_path.name} пропущен (хэш совпал, изменения отсутствуют).")
            return

        logger.info(f"Обнаружено изменение: {file_path.name}. Запуск Ingestion...")
        try:
            from app.knowledge.file_ingestion import ingest_file_revision
            from app.knowledge.ingestion import process_source_chunks_bg
            from app.db.session import async_session_factory
            
            with open(file_path, "rb") as f:
                file_bytes = f.read()

            async with async_session_factory() as db:
                source, status = await ingest_file_revision(
                    db=db,
                    filename=file_path.name,
                    file_bytes=file_bytes,
                    original_path=str(file_path)
                )
                if status != "unchanged":
                    await process_source_chunks_bg(source.id)

            self.file_hashes[file_path_str] = current_hash
            self.processed_count += 1
            logger.info(f"Файл {file_path.name} успешно проиндексирован (Всего в батче: {self.processed_count}).")

            # Проверяем триггер инсайтов
            await self._trigger_insights_if_needed()

        except Exception as e:
            logger.error(f"Сбой при обработке файла {file_path.name}: {e}", exc_info=True)

    async def run_async(self):
        if not self.vault_path.exists():
            logger.warning(f"Директория хранилища {self.vault_path} не найдена. Создаем...")
            self.vault_path.mkdir(parents=True, exist_ok=True)

        queue = asyncio.Queue()
        loop = asyncio.get_running_loop()
        event_handler = VaultDebounceHandler(loop, queue)
        
        observer = Observer()
        observer.schedule(event_handler, str(self.vault_path), recursive=True)
        observer.start()

        logger.info(f"Vault Watcher запущен. Мониторинг: {self.vault_path}")
        logger.info(f"Параметры: Debounce={DEBOUNCE_SECONDS}s, Threshold={INSIGHTS_THRESHOLD} файлов, Timer={INSIGHTS_TIMER_HOURS}h")

        try:
            while True:
                # Read everything from queue to pending dict
                while not queue.empty():
                    file_path = await queue.get()
                    self.pending_files[file_path] = time.time()
                    queue.task_done()
                    
                now = time.time()
                
                # Обработка файлов, для которых истек debounce-таймаут
                ready_files = [
                    f for f, last_time in list(self.pending_files.items())
                    if now - last_time >= DEBOUNCE_SECONDS
                ]

                for file_path in ready_files:
                    del self.pending_files[file_path]
                    await self._process_file(file_path)

                # Проверка периодического таймера инсайтов
                await self._trigger_insights_if_needed()
                
                await asyncio.sleep(1.0)

        except asyncio.CancelledError:
            logger.info("Остановка Vault Watcher...")
        finally:
            observer.stop()
            observer.join()

def main():
    watcher = VaultWatcherDaemon(VAULT_PATH)
    try:
        asyncio.run(watcher.run_async())
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
