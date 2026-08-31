from pathlib import Path
from typing import Optional
from app.media.types import MediaType

VOICE_NOTE_EXTENSIONS = {".m4a", ".m4b", ".aac"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".oga", ".flac", ".opus"}
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".webm", ".mov", ".avi"}

def detect_media_type(
    filename: str,
    content_type: Optional[str] = None,
    override: Optional[str] = None,
) -> MediaType:
    if override:
        try:
            return MediaType(override)
        except ValueError:
            raise ValueError(f"Неподдерживаемый тип медиа override: {override}")

    if content_type:
        mime = content_type.lower().strip()
        if mime.startswith("video/"):
            return MediaType.VIDEO
        if mime in {"audio/mp4", "audio/aac", "audio/m4a"}:
            return MediaType.VOICE_NOTE
        if mime.startswith("audio/"):
            return MediaType.AUDIO

    suffix = Path(filename).suffix.lower()
    if suffix in VIDEO_EXTENSIONS:
        return MediaType.VIDEO
    if suffix in VOICE_NOTE_EXTENSIONS:
        return MediaType.VOICE_NOTE
    if suffix in AUDIO_EXTENSIONS:
        return MediaType.AUDIO

    return MediaType.AUDIO
