import logging
import time
from typing import Any, Dict

logger = logging.getLogger("pka.latency")

class LatencyProfiler:
    def __init__(self, trace_id: str = "request"):
        self.trace_id = trace_id
        self.stages: Dict[str, float] = {}
        self.start_time = time.perf_counter()
        self._current_stage_start = None
        self._current_stage_name = None

    def start_stage(self, stage_name: str):
        now = time.perf_counter()
        if self._current_stage_name:
            duration_ms = (now - self._current_stage_start) * 1000.0
            self.stages[self._current_stage_name] = round(duration_ms, 2)
        self._current_stage_name = stage_name
        self._current_stage_start = now

    def end(self) -> Dict[str, Any]:
        now = time.perf_counter()
        if self._current_stage_name:
            duration_ms = (now - self._current_stage_start) * 1000.0
            self.stages[self._current_stage_name] = round(duration_ms, 2)
            self._current_stage_name = None
        total_duration_ms = round((now - self.start_time) * 1000.0, 2)
        
        # Логируем сводку одним структурированным событием
        logger.info(
            "Latency Profile: total=%sms | stages=%s",
            total_duration_ms,
            self.stages,
            extra={
                "trace_id": self.trace_id,
                "total_ms": total_duration_ms,
                "stages": self.stages,
            }
        )
        return {
            "total_ms": total_duration_ms,
            "stages": self.stages
        }
