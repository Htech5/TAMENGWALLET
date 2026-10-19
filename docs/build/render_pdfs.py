#!/usr/bin/env python3
"""Render the submission PDFs from the repo Markdown, using headless Chrome.

Usage: python3 docs/build/render_pdfs.py

The build is deterministic and needs no network: Markdown -> styled HTML -> print-to-pdf.
Chrome is expected at /opt/google/chrome/chrome (override with CHROME=...).
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "docs" / "build"
OUT = ROOT / "docs" / "submission"
CHROME = os.environ.get("CHROME", "/opt/google/chrome/chrome")

CSS = """
:root { --ink:#0A0A0A; --ink2:#3E3E3E; --silver:#7A7A7A; --line:#E1E1E1; --stabilo:#D4FF3A; --soft:#F6F6F6; }
* { box-sizing: border-box; }
@page { size: A4; margin: 17mm 15mm 16mm; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family:"DejaVu Sans","Liberation Sans",Arial,sans-serif; color:var(--ink); font-size:10.2pt; line-height:1.5; margin:0; }
.brandline { display:flex; justify-content:space-between; border-bottom:3px solid var(--ink); padding-bottom:6px; margin-bottom:16px; font-size:8.5pt; letter-spacing:.08em; text-transform:uppercase; color:var(--silver); }
h1 { font-size:22pt; line-height:1.15; margin:0 0 4px; letter-spacing:-.02em; }
h2 { font-size:14pt; margin:20px 0 7px; border-bottom:1px solid var(--line); padding-bottom:4px; }
h3 { font-size:11.3pt; margin:14px 0 5px; }
h4 { font-size:10.5pt; margin:11px 0 4px; }
p { margin:6px 0; color:var(--ink2); }
li { margin:3px 0; color:var(--ink2); }
strong { color:var(--ink); }
a { color:#0B5674; text-decoration:none; word-break:break-all; }
code { font-family:"DejaVu Sans Mono","Liberation Mono",monospace; font-size:8.8pt; background:var(--soft); padding:1px 3px; border-radius:3px; color:var(--ink); }
pre { background:var(--soft); border-left:4px solid var(--stabilo); padding:9px 11px; border-radius:6px; overflow:hidden; }
pre code { background:none; padding:0; font-size:8.4pt; line-height:1.45; }
table { width:100%; border-collapse:collapse; margin:9px 0; }
th,td { border:1px solid var(--line); padding:4.5px 6px; font-size:8.9pt; text-align:left; vertical-align:top; color:var(--ink2); }
th { background:var(--soft); color:var(--ink); font-size:8.3pt; text-transform:uppercase; letter-spacing:.04em; }
blockquote { margin:9px 0; padding:7px 11px; border-left:4px solid var(--stabilo); background:var(--soft); color:var(--ink); }
hr { border:none; border-top:1px solid var(--line); margin:16px 0; }
.footer { margin-top:22px; border-top:1px solid var(--line); padding-top:6px; font-size:8pt; color:var(--silver); }
"""

HEAD = """<!doctype html><html><head><meta charset="utf-8"><title>{title}</title><style>{css}</style></head><body>
<div class="brandline"><span>Tameng — FinTechathon 2026</span><span>{kicker}</span></div>
"""


def render_pdf(title: str, kicker: str, body_html: str, out_name: str) -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    html_path = BUILD / (out_name.replace(".pdf", ".html"))
    pdf_path = OUT / out_name
    html = HEAD.format(title=title, kicker=kicker, css=CSS) + body_html
    html += f'<div class="footer">Tameng · Universitas Diponegoro · 2026 Shenzhen FinTechathon · Topic F: Agent Wallet<br>Generated from {html_path.name} in the repository.</div></body></html>'
    html_path.write_text(html, encoding="utf-8")
    subprocess.run(
        [
            CHROME,
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            "--no-pdf-header-footer",
            "--virtual-time-budget=3000",
            f"--user-data-dir={Path('/tmp/opencode/chrome-pdf')}",
            f"--print-to-pdf={pdf_path}",
            f"file://{html_path}",
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return pdf_path


def md_to_html(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    return markdown.markdown(text, extensions=["tables", "fenced_code", "sane_lists", "attr_list"])


GALLERY_CSS = """
.gallery { display:flex; flex-wrap:wrap; gap:12px; margin-top:10px; }
.shot { width:47%; border:1px solid var(--line); border-radius:8px; padding:8px; }
.shot img { width:100%; height:auto; border-radius:5px; }
.shot .cap { font-size:8.4pt; color:var(--silver); margin-top:5px; }
"""


def screenshot_gallery() -> str:
    """Base64-embed the app screenshots so the PDF needs no external files."""
    import base64

    captions = {
        "app-home.png": "Home — balance, pending auto-send, blocked transfer alert.",
        "app-chat.png": "Chat — owner asks for a monthly auto-send; Tam drafts the mandate, owner confirms with PIN.",
        "app-autosend.png": "Auto-send — recipients, split, minimum balance and next run.",
        "app-activity.png": "Activity — every sent, blocked and postponed transfer with its reason.",
    }
    shots = []
    for name, cap in captions.items():
        p = OUT / "screenshots" / name
        if not p.exists():
            continue
        b64 = base64.b64encode(p.read_bytes()).decode()
        shots.append(f'<div class="shot"><img src="data:image/png;base64,{b64}"><div class="cap">{cap}</div></div>')
    if not shots:
        return ""
    return (
        f"<style>{GALLERY_CSS}</style><h2>Appendix — Mobile app screens (mock mode)</h2>"
        '<div class="gallery">' + "".join(shots) + "</div>"
    )


def main() -> int:
    jobs = [
        ("Tameng — Technical Documentation", "Technical documentation", ROOT / "docs" / "TECHNICAL_DOC.md", "Tameng_1_TechnicalDoc.pdf"),
        ("Tameng — Security Self-Assessment", "Security self-assessment", ROOT / "docs" / "SECURITY_REPORT.md", "Tameng_3_SecurityReport.pdf"),
        ("Tameng — Execution Evidence", "Execution evidence", ROOT / "docs" / "EXECUTION_EVIDENCE.md", "Tameng_4_ExecutionEvidence.pdf"),
    ]
    for title, kicker, md_path, out_name in jobs:
        body = md_to_html(md_path)
        if "ExecutionEvidence" in out_name:
            body += screenshot_gallery()
        out = render_pdf(title, kicker, body, out_name)
        print(out)
    # The deck is a hand-written HTML file with its own slide CSS.
    deck_src = BUILD / "deck.html"
    deck_pdf = OUT / "Tameng_2_Deck.pdf"
    subprocess.run(
        [
            CHROME,
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            "--no-pdf-header-footer",
            "--virtual-time-budget=3000",
            f"--user-data-dir={Path('/tmp/opencode/chrome-pdf')}",
            f"--print-to-pdf={deck_pdf}",
            f"file://{deck_src}",
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print(deck_pdf)
    return 0


if __name__ == "__main__":
    sys.exit(main())
