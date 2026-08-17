"""Tabular parser — converts CSV / XLSX to compact Markdown tables."""

import logging
from io import BytesIO

logger = logging.getLogger(__name__)


def parse_xlsx(file_bytes: bytes) -> str:
    """Convert an Excel workbook to Markdown tables (one per sheet)."""
    import pandas as pd

    xls = pd.ExcelFile(BytesIO(file_bytes), engine="openpyxl")
    parts: list[str] = []

    for sheet_name in xls.sheet_names:
        df = pd.read_excel(xls, sheet_name=sheet_name, dtype=str).fillna("")
        md = _dataframe_to_markdown(df)
        if md:
            parts.append(f"## Sheet: {sheet_name}\n\n{md}")

    result = "\n\n".join(parts)
    logger.info(f"[XLSXParser] Extracted {len(xls.sheet_names)} sheets, {len(result)} chars")
    return result


def parse_csv(file_bytes: bytes) -> str:
    """Convert a CSV file to a Markdown table."""
    import pandas as pd

    # Try to detect encoding; fall back to utf-8
    try:
        text = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = file_bytes.decode("cp1251", errors="replace")

    from io import StringIO
    df = pd.read_csv(StringIO(text), dtype=str).fillna("")
    md = _dataframe_to_markdown(df)
    logger.info(f"[CSVParser] Extracted {len(df)} rows, {len(md)} chars")
    return md


def _dataframe_to_markdown(df) -> str:
    """Render a pandas DataFrame as a compact Markdown table."""
    if df.empty:
        return ""

    cols = list(df.columns)
    header = "| " + " | ".join(str(c) for c in cols) + " |"
    separator = "| " + " | ".join(["---"] * len(cols)) + " |"
    rows: list[str] = []
    for _, row in df.iterrows():
        cells = [str(row[c]).replace("\n", " ").strip() for c in cols]
        rows.append("| " + " | ".join(cells) + " |")

    return "\n".join([header, separator] + rows)
