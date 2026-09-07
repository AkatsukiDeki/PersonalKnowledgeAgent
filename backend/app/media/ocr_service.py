import logging
from pathlib import Path
from typing import List, Dict, Any
import cv2

logger = logging.getLogger(__name__)


class SlideOCRService:
    def __init__(self, lang: str = "ru", use_angle_cls: bool = False):
        from paddleocr import PaddleOCR
        
        logger.info(f"[OCRService] Initializing fast PaddleOCR (lang={lang}, angle_cls={use_angle_cls})...")
        self.ocr = PaddleOCR(
            use_angle_cls=use_angle_cls,
            lang=lang,
            show_log=False
        )

    def extract_text_from_image(
        self, image_path: str, min_confidence: float = 0.65
    ) -> str:
        if not Path(image_path).exists():
            logger.error(f"[OCRService] Image path does not exist: {image_path}")
            return ""

        try:
            # Ограничение разрешения для ускорения детекции на CPU
            img = cv2.imread(image_path)
            if img is None:
                return ""
            h, w = img.shape[:2]
            if w > 1280:
                scale = 1280 / w
                img = cv2.resize(img, (1280, int(h * scale)), interpolation=cv2.INTER_AREA)

            result = self.ocr.ocr(img, cls=False)
            if not result or not result[0]:
                return ""

            boxes_and_text = []
            for line in result[0]:
                bbox, (text, conf) = line
                if conf >= min_confidence and text.strip():
                    top_y = bbox[0][1]
                    left_x = bbox[0][0]
                    boxes_and_text.append({
                        "top_y": top_y,
                        "left_x": left_x,
                        "text": text.strip(),
                        "confidence": conf
                    })

            if not boxes_and_text:
                return ""

            boxes_and_text.sort(key=lambda b: (round(b["top_y"] / 20) * 20, b["left_x"]))
            return "\n".join([b["text"] for b in boxes_and_text]).strip()

        except Exception as e:
            logger.error(f"[OCRService] OCR processing failed for {image_path}: {e}", exc_info=True)
            return ""

    def process_slides_batch(
        self, slides: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        logger.info(f"[OCRService] Processing OCR for {len(slides)} slides...")
        enriched_slides = []

        for slide in slides:
            image_path = slide.get("image_path", "")
            text = self.extract_text_from_image(image_path)
            enriched_slides.append({
                **slide,
                "extracted_text": text
            })

        logger.info(f"[OCRService] OCR completed for {len(enriched_slides)} slides.")
        return enriched_slides
