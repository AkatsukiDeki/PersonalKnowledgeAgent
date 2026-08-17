"""PDF parser — extracts text from PDF files page-by-page."""

import logging
from io import BytesIO

logger = logging.getLogger(__name__)


def parse_pdf(file_bytes: bytes) -> str:
    """Extract text from a PDF file, returning cleaned Markdown.

    Produces a heading per page (``## Page N``) followed by the page text
    with collapsed whitespace.
    """
    from pypdf import PdfReader

    reader = PdfReader(BytesIO(file_bytes))
    pages: list[str] = []

    for i, page in enumerate(reader.pages, 1):
        raw = page.extract_text() or ""
        # Collapse excessive blank lines
        lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
        if lines:
            pages.append(f"## Page {i}\n\n" + "\n".join(lines))

    result = "\n\n".join(pages)
    logger.info(f"[PDFParser] Extracted {len(reader.pages)} pages, {len(result)} chars")
    return result
