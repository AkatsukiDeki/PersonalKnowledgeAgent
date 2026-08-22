import asyncio
import logging
from typing import Callable
from concurrent.futures import ProcessPoolExecutor

logger = logging.getLogger(__name__)

class TaskQueue:
    def __init__(self):
        self.queue = asyncio.Queue()
        self.workers = []
        self._pool = ProcessPoolExecutor(max_workers=2)

    async def start(self, num_workers: int = 2):
        for i in range(num_workers):
            task = asyncio.create_task(self._worker(i))
            self.workers.append(task)
        logger.info(f"TaskQueue started with {num_workers} workers.")

    async def stop(self):
        for _ in self.workers:
            await self.queue.put(None)
        await asyncio.gather(*self.workers, return_exceptions=True)
        self._pool.shutdown(wait=True)
        logger.info("TaskQueue stopped.")

    async def _worker(self, worker_id: int):
        logger.info(f"Worker {worker_id} ready.")
        while True:
            job = await self.queue.get()
            if job is None:
                self.queue.task_done()
                break
            
            func, args, kwargs = job
            try:
                if asyncio.iscoroutinefunction(func):
                    await func(*args, **kwargs)
                else:
                    await asyncio.to_thread(func, *args, **kwargs)
            except Exception as e:
                logger.error(f"Worker {worker_id} failed on task {func.__name__}: {e}", exc_info=True)
            finally:
                self.queue.task_done()

    def enqueue(self, func: Callable, *args, **kwargs):
        """Non-blocking enqueue to allow calling from sync code or endpoints."""
        self.queue.put_nowait((func, args, kwargs))

    async def run_cpu_bound(self, func: Callable, *args):
        """Run a CPU-bound sync function in the process pool."""
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._pool, func, *args)

task_queue = TaskQueue()
