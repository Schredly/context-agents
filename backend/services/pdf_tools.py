"""PDF report generation for the action execution engine."""

from __future__ import annotations

import logging
import os
import time
import uuid

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

logger = logging.getLogger(__name__)

PDF_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "generated_pdfs")
os.makedirs(PDF_DIR, exist_ok=True)


def _build_pdf(file_path: str, title: str, content: str) -> None:
    """Build a simple PDF report from text content."""
    doc = SimpleDocTemplate(
        file_path,
        pagesize=letter,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontSize=18,
        spaceAfter=16,
    )
    body_style = ParagraphStyle(
        "ReportBody",
        parent=styles["BodyText"],
        fontSize=11,
        leading=15,
        spaceAfter=8,
    )

    story = []
    story.append(Paragraph(title, title_style))
    story.append(Spacer(1, 12))

    # Split content into paragraphs and render
    for para in content.split("\n"):
        text = para.strip()
        if not text:
            story.append(Spacer(1, 6))
            continue
        # Escape XML special chars for reportlab
        text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        story.append(Paragraph(text, body_style))

    doc.build(story)


async def generate_pdf(tenant_id: str, payload: dict, app) -> dict:
    """Generate a PDF report from agent result content.

    payload keys: content (str), title (str, optional)
    """
    content = payload.get("content", "")
    title = payload.get("title", "Agent Analysis Report")

    if not content:
        return {"status": "error", "error": "No content to generate PDF from"}

    pdf_id = uuid.uuid4().hex[:12]
    filename = f"report_{pdf_id}.pdf"
    file_path = os.path.join(PDF_DIR, filename)

    t0 = time.monotonic()
    try:
        _build_pdf(file_path, title, content)
        latency_ms = int((time.monotonic() - t0) * 1000)

        download_url = f"/api/admin/{tenant_id}/reports/{filename}"

        return {
            "status": "ok",
            "name": filename,
            "download_url": download_url,
            "latency_ms": latency_ms,
        }
    except Exception as e:
        latency_ms = int((time.monotonic() - t0) * 1000)
        logger.error("PDF generation failed: %s", e)
        return {"status": "error", "error": str(e), "latency_ms": latency_ms}
