import subprocess
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

def extract_audio_to_wav(input_path: Path, output_path: Path) -> Path:
    """
    Extracts and normalizes audio from video/audio files to 16kHz mono WAV 
    using ffmpeg.
    """
    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-vn",
        "-af", "highpass=f=200,lowpass=f=3500,volume=1.5",  # Срезаем низкий гул баса и тарелки, усиливаем вокал
        "-ar", "16000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        str(output_path)
    ]
    
    logger.info(f"Extracting audio using FFmpeg: {' '.join(cmd)}")
    
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode != 0:
        error_msg = result.stderr.decode('utf-8', errors='ignore')
        logger.error(f"FFmpeg failed with error: {error_msg}")
        raise RuntimeError(f"FFmpeg failed: {error_msg}")
        
    return output_path
