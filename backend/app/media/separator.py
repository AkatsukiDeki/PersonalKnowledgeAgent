import subprocess
from pathlib import Path
import logging
import os

logger = logging.getLogger(__name__)


class AudioSeparatorService:
    @staticmethod
    def extract_vocals(input_path: Path, output_dir: Path) -> Path:
        """
        Выделяет вокальную дорожку с помощью оптимизированных CPU-параметров Demucs.
        При сбое возвращает оригинальный путь с логированием ошибки.
        """
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Определяем доступное число ядер (оставляем запас для API)
        cpu_threads = max(1, (os.cpu_count() or 4) - 1)
        
        cmd = [
            "demucs",
            "--two-stems=vocals",
            "-n", "htdemucs",
            "--shifts", "0",          # Отключаем time-shift averaging (ускорение до 2x)
            "--segment", "4",          # Уменьшенный размер сегмента (меньше RAM, быстрее CPU FFT)
            "-j", str(cpu_threads),    # Явный параллелизм потоков
            "-o", str(output_dir),
            str(input_path)
        ]
        
        try:
            logger.info(f"Starting optimized Demucs separation with {cpu_threads} threads...")
            res = subprocess.run(
                cmd, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE, 
                timeout=240
            )
            
            if res.returncode == 0:
                track_name = input_path.stem
                vocals_file = output_dir / "htdemucs" / track_name / "vocals.wav"
                if vocals_file.exists():
                    logger.info(f"Demucs extraction successful: {vocals_file}")
                    return vocals_file
            
            logger.warning(
                f"Demucs separation non-zero exit ({res.returncode}), fallback to original: "
                f"{res.stderr.decode('utf-8', errors='ignore')}"
            )
        except subprocess.TimeoutExpired:
            logger.error("Demucs separation timed out after 240s, falling back to original audio.")
        except Exception as e:
            logger.error(f"Demucs execution failed: {e}")
        
        return input_path
