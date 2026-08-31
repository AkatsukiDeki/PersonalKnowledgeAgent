from faster_whisper import WhisperModel
from pathlib import Path
from typing import List, Dict, Any
import os
import logging
import re

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

    def transcribe(self, audio_path: Path, language: str = "ru", initial_prompt: str = None) -> List[Dict[str, Any]]:
        logger.info(f"Starting transcription for {audio_path} (lang={language})")
        
        default_prompt = "Это подкаст, лекция или голосовая заметка. Речь человека без пения и музыки. Разговорная речь."
        prompt_to_use = initial_prompt if initial_prompt else default_prompt

        segments, info = self.model.transcribe(
            str(audio_path),
            language=language,
            initial_prompt=prompt_to_use,
            beam_size=5,
            best_of=5,
            temperature=(0.0, 0.2, 0.4),
            condition_on_previous_text=False,
            no_speech_threshold=0.6,
            log_prob_threshold=-1.0,
            compression_ratio_threshold=2.4,
            vad_filter=True,
            vad_parameters=dict(
                threshold=0.35,
                min_silence_duration_ms=500,
                speech_pad_ms=200
            )
        )
        
        result = []
        for seg in segments:
            # Whisper hallucination cleaner: remove musical tags like [Музыка], [Куплет 1], (смеется), and ♪
            clean_text = re.sub(r'\[.*?\]|\(.*?\)|♪', '', seg.text)
            clean_text = clean_text.strip()
            if clean_text:
                result.append({"start": seg.start, "end": seg.end, "text": clean_text})
            
        logger.info(f"Transcription completed, extracted {len(result)} segments.")
        return result
