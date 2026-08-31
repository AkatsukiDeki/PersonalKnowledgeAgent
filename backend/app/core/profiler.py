import logging
import time
from contextlib import asynccontextmanager
from typing import Dict, Any

logger = logging.getLogger("pka.latency")


class LatencyProfiler:
    def __init__(self, operation_name: str = "request", trace_id: str = None):
        self.operation_name = operation_name
        self.trace_id = trace_id or operation_name
        self._start_total: float = time.perf_counter()
        self._step_start: float = self._start_total
        self.timings: Dict[str, int] = {}
        self._first_token_time = None
        self._current_stage_name = None

    def __enter__(self):
        self._start_total = time.perf_counter()
        self._step_start = self._start_total
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.end()

    @asynccontextmanager
    async def step(self, name: str):
        start = time.perf_counter()
        try:
            yield
        finally:
            elapsed = time.perf_counter() - start
            self.timings[name] = int(elapsed * 1000)

    def start_stage(self, stage_name: str):
        now = time.perf_counter()
        if self._current_stage_name:
            duration = int((now - self._current_stage_start) * 1000)
            self.timings[self._current_stage_name] = duration
        self._current_stage_name = stage_name
        self._current_stage_start = now

    def mark_first_token(self) -> None:
        if self._first_token_time is None:
            self._first_token_time = time.perf_counter()
            self.timings["ttft_ms"] = int((self._first_token_time - self._start_total) * 1000)

    def end(self) -> Dict[str, int]:
        now = time.perf_counter()
        if self._current_stage_name:
            duration = int((now - self._current_stage_start) * 1000)
            self.timings[self._current_stage_name] = duration
            self._current_stage_name = None
            
        total = int((time.perf_counter() - self._start_total) * 1000)
        self.timings["total_ms"] = total
        logger.info(
            f"Latency Profile: total={total}ms | stages={self.timings}",
            extra={
                "trace_id": self.trace_id,
                "total_ms": total,
                "stages": self.timings,
            }
        )
        return self.timings
