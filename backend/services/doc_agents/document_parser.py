"""Document Parser Agent — extract text content from PDF, DOCX, TXT, MD files."""

from __future__ import annotations

import logging
import os
import time

logger = logging.getLogger(__name__)


async def parse_document(
    file_path: str,
    on_progress=None,
) -> dict:
    """Parse a document file and return structured text sections.

    Returns:
        {
            "status": "ok",
            "full_text": str,
            "sections": [{"title": str, "content": str, "page": int}],
            "page_count": int,
            "word_count": int,
            "latency_ms": int,
        }
    """
    t0 = time.time()
    if on_progress:
        await on_progress("document_parser", "running", {})

    ext = os.path.splitext(file_path)[1].lower()
    full_text = ""
    sections: list[dict] = []
    page_count = 0

    try:
        if ext == ".pdf":
            full_text, sections, page_count = _parse_pdf(file_path)
        elif ext == ".docx":
            full_text, sections, page_count = _parse_docx(file_path)
        elif ext in (".txt", ".md", ".markdown"):
            full_text, sections, page_count = _parse_text(file_path)
        else:
            # Fallback: try reading as text
            full_text, sections, page_count = _parse_text(file_path)
    except Exception as exc:
        logger.error("[doc_parser] Failed to parse %s: %s", file_path, exc)
        if on_progress:
            await on_progress("document_parser", "error", {"error": str(exc)})
        return {"status": "error", "error": str(exc)}

    word_count = len(full_text.split())
    latency_ms = int((time.time() - t0) * 1000)

    if on_progress:
        await on_progress("document_parser", "done", {
            "pages": page_count,
            "words": word_count,
            "sections": len(sections),
            "latency_ms": latency_ms,
        })

    return {
        "status": "ok",
        "full_text": full_text,
        "sections": sections,
        "page_count": page_count,
        "word_count": word_count,
        "latency_ms": latency_ms,
    }


def _parse_pdf(file_path: str) -> tuple[str, list[dict], int]:
    """Parse PDF using PyPDF2 or pdfplumber (fallback to basic text extraction)."""
    try:
        import pdfplumber
        pages_text = []
        sections = []
        with pdfplumber.open(file_path) as pdf:
            for i, page in enumerate(pdf.pages):
                text = page.extract_text() or ""
                pages_text.append(text)
                if text.strip():
                    sections.append({"title": f"Page {i + 1}", "content": text.strip(), "page": i + 1})
            return "\n\n".join(pages_text), sections, len(pdf.pages)
    except ImportError:
        pass

    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(file_path)
        pages_text = []
        sections = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            pages_text.append(text)
            if text.strip():
                sections.append({"title": f"Page {i + 1}", "content": text.strip(), "page": i + 1})
        return "\n\n".join(pages_text), sections, len(reader.pages)
    except ImportError:
        pass

    raise ImportError("No PDF parser available. Install pdfplumber or PyPDF2: pip install pdfplumber")


def _parse_docx(file_path: str) -> tuple[str, list[dict], int]:
    """Parse DOCX using python-docx."""
    try:
        from docx import Document
    except ImportError:
        raise ImportError("python-docx not installed. Install it: pip install python-docx")

    doc = Document(file_path)
    full_parts: list[str] = []
    sections: list[dict] = []
    current_section_title = "Introduction"
    current_section_content: list[str] = []

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        full_parts.append(text)

        # Detect headings as section breaks
        if para.style and para.style.name and para.style.name.startswith("Heading"):
            if current_section_content:
                sections.append({
                    "title": current_section_title,
                    "content": "\n".join(current_section_content),
                    "page": 0,
                })
            current_section_title = text
            current_section_content = []
        else:
            current_section_content.append(text)

    if current_section_content:
        sections.append({
            "title": current_section_title,
            "content": "\n".join(current_section_content),
            "page": 0,
        })

    full_text = "\n".join(full_parts)
    # Rough page estimate
    page_count = max(1, len(full_text) // 3000)
    return full_text, sections, page_count


def _parse_text(file_path: str) -> tuple[str, list[dict], int]:
    """Parse plain text or markdown."""
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        full_text = f.read()

    sections: list[dict] = []
    current_title = "Document"
    current_lines: list[str] = []

    for line in full_text.split("\n"):
        stripped = line.strip()
        # Detect markdown headings or ALL-CAPS lines as sections
        if stripped.startswith("#") or (stripped.isupper() and len(stripped) > 3 and len(stripped) < 100):
            if current_lines:
                sections.append({
                    "title": current_title,
                    "content": "\n".join(current_lines).strip(),
                    "page": 0,
                })
            current_title = stripped.lstrip("#").strip()
            current_lines = []
        else:
            current_lines.append(line)

    if current_lines:
        sections.append({
            "title": current_title,
            "content": "\n".join(current_lines).strip(),
            "page": 0,
        })

    page_count = max(1, len(full_text) // 3000)
    return full_text, sections, page_count
