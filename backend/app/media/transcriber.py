from faster_whisper import WhisperModel
from pathlib import Path
from typing import List, Dict, Any
import os
import logging

logger = logging.getLogger(__name__)


class WhisperSTTService:
    def __init__(
        self,
        model_size: str = os.getenv("PKA_WHISPER_MODEL", "small"), 
        device: str = os.getenv("PKA_WHISPER_DEVICE", "cpu"), 
        compute_type: str = os.getenv("PKA_WHISPER_COMPUTE_TYPE", "int8"),
        cpu_threads: int = 4
    ):
        logger.info(f"Initializing WhisperSTTService with model={model_size}, device={device}, compute_type={compute_type}")
        
        self.model = WhisperModel(
            model_size, 
            device=device, 
            compute_type=compute_type, 
            cpu_threads=cpu_threads
        )

    def transcribe(self, audio_path: Path) -> List[Dict[str, Any]]:
        logger.info(f"Starting transcription for {audio_path}")
        # Мягкий VAD + начальный контекстный промпт для русского языка
        segments, info = self.model.transcribe(
            str(audio_path),
            language="ru",
            initial_prompt="Разговорная русская речь, технический сленг, мат, ненормативная лексика, программирование.",
            beam_size=5,
            best_of=5,
            temperature=0.0,
            condition_on_previous_text=False,  # Предотвращает зацикливание фраз
            no_speech_threshold=0.6,
            vad_filter=True,
            vad_parameters=dict(
                threshold=0.25,
                min_silence_duration_ms=1200,
                speech_pad_ms=400
            )
        )
        
        result = [{"start": seg.start, "end": seg.end, "text": seg.text.strip()} for seg in segments]
            
        logger.info(f"Transcription completed, extracted {len(result)} segments.")
        return result
