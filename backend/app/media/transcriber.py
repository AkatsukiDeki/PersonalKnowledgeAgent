from faster_whisper import WhisperModel
from pathlib import Path
from typing import List, Dict, Any, Optional
import os
import logging
import re

logger = logging.getLogger(__name__)

HALLUCINATION_REGEX = re.compile(
    r"(редактор субтитров|перевод субтитров|субтитры создал|диктор|продолжение следует|"
    r"подписывайтесь на канал|ставьте лайк|thanks for watching|subtitles by|translated by|"
    r"transcribed by|all rights reserved|copyright)",
    re.IGNORECASE,
)


class WhisperSTTService:
    def __init__(
            self,
            model_size: str = os.getenv("PKA_WHISPER_MODEL", "large-v3-turbo"),
            device: str = os.getenv("PKA_WHISPER_DEVICE", "cuda"),
            compute_type: str = os.getenv("PKA_WHISPER_COMPUTE_TYPE", "float16"),
            cpu_threads: int = 4,
    ):
        logger.info(
            f"Initializing WhisperSTTService with model={model_size}, device={device}, compute_type={compute_type}"
        )
        self.model = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
            cpu_threads=cpu_threads,
        )

    def transcribe(
            self,
            audio_path: Path,
            language: Optional[str] = None,
            initial_prompt: Optional[str] = None,
            disable_vad: bool = False,
    ) -> List[Dict[str, Any]]:
        if language is None or not language.strip() or language.strip().lower() == "auto":
            effective_language = "ru"
        else:
            effective_language = language.strip().lower()

        logger.info(f"Starting optimized transcription for {audio_path} (lang={effective_language})")

        prompt_to_use = initial_prompt
        if prompt_to_use is None and effective_language == "ru":
            prompt_to_use = "Русская разговорная речь, лекция, IT-термины, базы данных, SQL, лабораторные работы."

        segments, info = self.model.transcribe(
            str(audio_path),
            task="transcribe",
            language=effective_language,
            initial_prompt=prompt_to_use,
            beam_size=1,            # 3x ускорение
            best_of=1,
            temperature=0.0,
            condition_on_previous_text=False,
            no_speech_threshold=0.6,
            log_prob_threshold=-1.0,
            compression_ratio_threshold=2.4,
            vad_filter=not disable_vad,
            vad_parameters=dict(
                threshold=0.35,
                min_speech_duration_ms=200,
                min_silence_duration_ms=400,
                speech_pad_ms=200
            ),
        )

        logger.info(f"Transcription language: {info.language} (probability {info.language_probability:.2f})")

        result: List[Dict[str, Any]] = []
        for seg in segments:
            clean_text = re.sub(r"\[.*?\]|\(.*?\)|♪|♫|#", "", seg.text).strip()
            if not clean_text or HALLUCINATION_REGEX.search(clean_text):
                continue

            result.append({
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "text": clean_text
            })

        logger.info(f"Transcription completed, extracted {len(result)} segments.")
        return result
