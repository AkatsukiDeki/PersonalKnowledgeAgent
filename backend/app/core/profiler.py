import logging
import time
from contextlib import asynccontextmanager
from typing import Dict, Any

logger = logging.getLogger("pka.latency")


class LatencyProfiler:
    def __init__(self, operation_name: str = "request", trace_id: str = None):
        self.operation_name = operation_name
        self.trace_id = trace_id or operation_name
        self.timings: Dict[str, float] = {}
        self._start_total: float = time.perf_counter()

    def __enter__(self):
        self._start_total = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        total = time.perf_counter() - self._start_total
        self.timings["total_pipeline_sec"] = round(total, 3)
        logger.info(f"[{self.operation_name}] Latency breakdown: {self.timings}")

    @asynccontextmanager
    async def step(self, name: str):
        start = time.perf_counter()
        try:
            yield
        finally:
            elapsed = time.perf_counter() - start
            self.timings[name] = round(elapsed, 3)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "operation": self.operation_name,
            "timings_sec": self.timings
        }

    def start_stage(self, stage_name: str):
        now = time.perf_counter()
        if hasattr(self, '_current_stage_name') and self._current_stage_name:
            duration = (now - self._current_stage_start)
            self.timings[self._current_stage_name] = round(duration, 3)
        self._current_stage_name = stage_name
        self._current_stage_start = now

    def end(self) -> Dict[str, Any]:
        now = time.perf_counter()
        if hasattr(self, '_current_stage_name') and self._current_stage_name:
            duration = (now - self._current_stage_start)
            self.timings[self._current_stage_name] = round(duration, 3)
            self._current_stage_name = None
            
        total = time.perf_counter() - self._start_total
        self.timings["total_pipeline_sec"] = round(total, 3)
        logger.info(
            "Latency Profile: total=%sms | stages=%s",
            round(total * 1000.0, 2),
            self.timings,
            extra={
                "trace_id": self.trace_id,
                "total_ms": round(total * 1000.0, 2),
                "stages": self.timings,
            }
        )
        return self.to_dict()
