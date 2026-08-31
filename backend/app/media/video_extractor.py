"""
Video Keyframe & Slide Extraction Service.
Extracts significant scene changes from video files using FFmpeg and filters duplicates via SSIM.
"""

import os
import re
import cv2
import logging
import subprocess
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
from skimage.metrics import structural_similarity as ssim

logger = logging.getLogger(__name__)


class VideoSlideExtractor:
    def __init__(self, ssim_threshold: float = 0.85, scene_threshold: float = 0.3, max_slides: int = 80):
        """
        :param ssim_threshold: Порог схожести кадров (0.85 = 85% совпадения, дубликат отбрасывается)
        :param scene_threshold: Чувствительность FFmpeg к смене сцены (0.3 = 30% изменения картинки)
        :param max_slides: Максимальное количество слайдов на видео для защиты от переполнения
        """
        self.ssim_threshold = ssim_threshold
        self.scene_threshold = scene_threshold
        self.max_slides = max_slides

    def _extract_keyframes_with_timestamps(
        self, video_path: str, output_dir: Path
    ) -> List[Tuple[float, Path]]:
        """
        Executes FFmpeg with scene change detection filter and parses presentation timestamps (pts_time).
        """
        output_pattern = str(output_dir / "frame_%04d.jpg")
        
        ffmpeg_cmd = [
            "ffmpeg",
            "-y",
            "-i", video_path,
            "-vf", f"select='gt(scene,{self.scene_threshold})',showinfo",
            "-fps_mode", "vfr",
            "-q:v", "2",
            "-pix_fmt", "yuvj420p",
            output_pattern
        ]

        logger.info(f"[VideoExtractor] Running FFmpeg scene extraction for {video_path}...")
        process = subprocess.Popen(
            ffmpeg_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True
        )
        _, stderr = process.communicate()

        if process.returncode != 0:
            logger.error(f"[VideoExtractor] FFmpeg failed with error: {stderr}")
            raise RuntimeError(f"FFmpeg scene extraction failed: {stderr}")

        timestamps: List[float] = []
        for line in stderr.splitlines():
            if "Parsed_showinfo" in line and "pts_time:" in line:
                match = re.search(r"pts_time:\s*([\d\.]+)", line)
                if match:
                    timestamps.append(float(match.group(1)))

        frame_files = sorted(list(output_dir.glob("frame_*.jpg")))
        
        results = []
        for i, frame_path in enumerate(frame_files):
            ts = timestamps[i] if i < len(timestamps) else float(i * 5.0)
            results.append((round(ts, 2), frame_path))

        logger.info(f"[VideoExtractor] Raw keyframes extracted: {len(results)}")
        return results

    def _calculate_ssim(self, img_path_a: Path, img_path_b: Path) -> float:
        """Computes structural similarity index between two slide images."""
        img_a = cv2.imread(str(img_path_a), cv2.IMREAD_GRAYSCALE)
        img_b = cv2.imread(str(img_path_b), cv2.IMREAD_GRAYSCALE)

        if img_a is None or img_b is None:
            return 0.0

        img_a = cv2.resize(img_a, (640, 360))
        img_b = cv2.resize(img_b, (640, 360))

        score, _ = ssim(img_a, img_b, full=True)
        return float(score)

    def extract_unique_slides(
        self, video_path: str, output_dir: Path, source_id_str: str
    ) -> List[Dict[str, Any]]:
        """
        Extracts keyframes, removes redundant/flickering duplicate slides and sets web-accessible URLs.
        """
        output_dir.mkdir(parents=True, exist_ok=True)
        raw_keyframes = self._extract_keyframes_with_timestamps(video_path, output_dir)

        if not raw_keyframes:
            logger.warning("[VideoExtractor] No keyframes detected in video.")
            return []

        unique_slides: List[Dict[str, Any]] = []
        last_saved_frame: Optional[Path] = None

        for ts, frame_path in raw_keyframes:
            if len(unique_slides) >= self.max_slides:
                logger.warning(f"[VideoExtractor] Hit max slides limit ({self.max_slides}). Stopping.")
                try:
                    os.remove(frame_path)
                except OSError:
                    pass
                continue

            is_duplicate = False
            if last_saved_frame is not None:
                similarity = self._calculate_ssim(last_saved_frame, frame_path)
                if similarity >= self.ssim_threshold:
                    is_duplicate = True
                    try:
                        os.remove(frame_path)
                    except OSError:
                        pass

            if not is_duplicate:
                mins = int(ts // 60)
                secs = int(ts % 60)
                formatted_time = f"{mins:02d}:{secs:02d}"
                
                # Публичный URL для раздачи через FastAPI StaticFiles
                relative_url = f"/uploads/slides/{source_id_str}/{frame_path.name}"

                unique_slides.append({
                    "slide_index": len(unique_slides) + 1,
                    "timestamp_seconds": ts,
                    "formatted_time": formatted_time,
                    "image_path": str(frame_path),
                    "image_url": relative_url,
                    "extracted_text": ""
                })
                last_saved_frame = frame_path

        logger.info(f"[VideoExtractor] Deduplicated slides: {len(unique_slides)} kept from {len(raw_keyframes)}")
        return unique_slides
