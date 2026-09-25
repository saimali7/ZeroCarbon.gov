"""PDF documents in each submission package, rendered from HTML with headless Chrome."""
from __future__ import annotations

import os
import shutil
import signal
import subprocess
import tempfile
import time
from datetime import date
from html import escape
from pathlib import Path

from model import (
    CALIB, CH4_EF_DIESEL_COMB, CH4_EF_GAS_COMB, COMPONENTS, DIESEL_EF, DIESEL_NCV, FLARE_CE, GWP_CH4, LAB, LDAR_CONTRACTOR,
    MOLAR_VOLUME, OPERATOR, VERIFIER, YEAR, Facility,
)
from xlsx_report import facility_summary, instruments, technical_units

CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
]
DISCLAIMER = "Fictional document created for the ZeroCarbon.gov demo. All companies, people and numbers are invented."

BASE_CSS = """
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 9.3pt; line-height: 1.45; color: #1f2a30; margin: 0;
       font-variant-ligatures: none; font-feature-settings: "liga" 0, "clig" 0; }
h1 { font-size: 17pt; line-height: 1.2; margin: 0 0 4pt; color: var(--dark); letter-spacing: -0.01em; }
h2 { font-size: 11.2pt; margin: 16pt 0 6pt; padding-bottom: 3pt; border-bottom: 1.2pt solid var(--accent); color: var(--dark); break-after: avoid; }
h3 { font-size: 9.8pt; margin: 10pt 0 4pt; color: var(--dark); break-after: avoid; }
p { margin: 0 0 6pt; }
ul, ol { margin: 0 0 6pt; padding-left: 15pt; }
li { margin-bottom: 2pt; }
table { width: 100%; border-collapse: collapse; margin: 4pt 0 10pt; font-size: 8.2pt; }
thead { display: table-header-group; }
th { background: var(--dark); color: #fff; font-weight: 600; text-align: left; padding: 4pt 5pt; vertical-align: bottom; }
td { padding: 3.3pt 5pt; border-bottom: 0.6pt solid #d6dde0; vertical-align: top; }
td:first-child { white-space: nowrap; }
.keep { break-inside: avoid; }
tr { break-inside: avoid; }
tr.total td { font-weight: 700; background: #eef3f1; border-top: 1pt solid var(--dark); }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.muted { color: #5f6b72; }
.small { font-size: 7.9pt; }
.lh { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 9pt; border-bottom: 2.2pt solid var(--accent); margin-bottom: 14pt; }
.lh-brand { display: flex; align-items: center; gap: 10pt; }
.lh-name { font-size: 14pt; font-weight: 700; color: var(--dark); letter-spacing: -0.01em; line-height: 1.15; }
.lh-sub { font-size: 8pt; color: #5f6b72; }
.lh-right { text-align: right; font-size: 7.6pt; color: #5f6b72; line-height: 1.45; }
.ar { font-family: "Geeza Pro", "Al Nile", "Noto Naskh Arabic", serif; direction: rtl; }
.meta { font-size: 8.3pt; margin: 6pt 0 12pt; }
.meta td { border: 0.6pt solid #d6dde0; padding: 3.5pt 6pt; }
.meta td.k { background: #f3f6f7; font-weight: 600; width: 29%; color: #33434a; }
.callout { border-left: 3pt solid var(--accent); background: #f5f8f9; padding: 7pt 10pt; margin: 8pt 0 10pt; break-inside: avoid; }
.sigs { display: flex; gap: 22pt; margin-top: 18pt; align-items: flex-end; break-inside: avoid; }
.sig { flex: 1; }
.sig .hand { font-family: "Snell Roundhand", "Apple Chancery", "Brush Script MT", cursive; font-size: 19pt; color: #1b3a73; height: 30pt; line-height: 30pt; white-space: nowrap; }
.sig .line { border-top: 0.8pt solid #33434a; padding-top: 3pt; font-size: 8pt; line-height: 1.35; }
.stamp { transform: rotate(-9deg); opacity: 0.85; flex: 0 0 auto; }
.figure { border: 0.6pt solid #d6dde0; padding: 6pt; margin: 6pt 0 3pt; break-inside: avoid; }
.caption { font-size: 7.9pt; color: #5f6b72; margin-bottom: 10pt; }
.page-break { break-before: page; }
.badge { display: inline-block; padding: 1pt 6pt; border-radius: 8pt; font-size: 7.4pt; font-weight: 700; white-space: nowrap; }
.badge.ok { background: #e3f1e6; color: #1e6b34; }
.badge.warn { background: #fbeed5; color: #8a5a00; }
.badge.bad { background: #f8e0dd; color: #9b2c1f; }
.title-block { margin: 2pt 0 10pt; }
.eyebrow { font-size: 8pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); margin-bottom: 3pt; }
.formula { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 8pt; background: #f5f8f9; padding: 5pt 8pt; margin: 4pt 0 8pt; border-radius: 3pt; }
"""


def n0(x: float) -> str:
    return f"{x:,.0f}"


def n1(x: float) -> str:
    return f"{x:,.1f}"


def n2(x: float) -> str:
    return f"{x:,.2f}"


def dlong(d: date) -> str:
    return f"{d.day} {d:%B %Y}"


def dshort(d: date) -> str:
    return f"{d.day:02d}-{d:%b-%Y}"


def page(title: str, body: str, accent: str, dark: str, running: str = "") -> str:
    font = 'font-family: "Helvetica Neue", Arial, sans-serif;'
    top = f'@top-right {{ content: "{running}"; {font} font-size: 7.5pt; color: #5f6b72; }}' if running else ""
    page_css = (f'@page {{ size: A4; margin: 18mm 16mm 20mm 16mm; {top}'
                f'@bottom-left {{ content: "{DISCLAIMER}"; {font} font-size: 6.3pt; color: #9aa5ab; }}'
                f'@bottom-right {{ content: "Page " counter(page) " of " counter(pages); {font} font-size: 7.5pt; color: #5f6b72; }} }}'
                '@page :first { @top-right { content: none; } }')
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{escape(title)}</title>'
            f'<style>{page_css}{BASE_CSS}</style></head><body style="--accent:{accent};--dark:{dark}">{body}</body></html>')


def chrome_path() -> str:
    for candidate in CHROME_CANDIDATES:
        if Path(candidate).exists() or shutil.which(candidate):
            return candidate
    raise SystemExit("Google Chrome or Chromium is required to render the PDFs.")


def run_chrome(src: Path, out: Path, tmp: str) -> None:
    # Chrome writes the PDF quickly but may not exit with a throwaway profile, so wait for the
    # "bytes written" message and then stop the whole process group.
    log_path = Path(tmp) / "chrome.log"
    if out.exists():
        out.unlink()
    with open(log_path, "w") as log:
        proc = subprocess.Popen(
            [chrome_path(), "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--no-first-run", "--no-default-browser-check",
             "--use-mock-keychain", "--password-store=basic", "--disable-extensions", f"--user-data-dir={tmp}/profile",
             f"--print-to-pdf={out}", src.as_uri()],
            stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    deadline = time.monotonic() + 90
    try:
        while time.monotonic() < deadline:
            if proc.poll() is not None or "bytes written to file" in log_path.read_text(errors="ignore"):
                break
            time.sleep(0.2)
    finally:
        if proc.poll() is None:
            os.killpg(proc.pid, signal.SIGTERM)
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
    if not out.exists() or out.stat().st_size == 0:
        raise SystemExit(f"Chrome failed to render {out.name}. Log:\n{log_path.read_text(errors='ignore')[-2000:]}")


def render_pdf(doc: str, out: Path, meta: dict) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "doc.html"
        src.write_text(doc, encoding="utf-8")
        run_chrome(src, out, tmp)
    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError:
        return
    writer = PdfWriter(clone_from=PdfReader(out))
    stamp = meta["date"].strftime("D:%Y%m%d093000+04'00'")
    writer.add_metadata({"/Title": meta["title"], "/Author": meta["author"], "/Creator": meta["author"],
                         "/Subject": DISCLAIMER, "/CreationDate": stamp, "/ModDate": stamp})
    with open(out, "wb") as fh:
        writer.write(fh)


def dunes_logo(size: int = 46) -> str:
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#0f4c5c"/>'
            '<circle cx="33" cy="15" r="5.5" fill="#f2d98b"/>'
            '<path d="M0 31 C10 21 20 22 28 29 S41 35 48 27 L48 48 L0 48 Z" fill="#c9a227"/>'
            '<path d="M0 38 C12 30 22 32 30 37 S42 41 48 35 L48 48 L0 48 Z" fill="#e6c96a"/></svg>')


def kestrel_logo() -> str:
    return ('<svg width="44" height="44" viewBox="0 0 48 48"><rect width="48" height="48" rx="4" fill="#14264a"/>'
            '<path d="M8 30 L24 12 L40 30 L32 30 L24 21 L16 30 Z" fill="#ffffff"/><rect x="21" y="30" width="6" height="8" fill="#d6423a"/></svg>')


def lab_logo() -> str:
    return ('<svg width="44" height="44" viewBox="0 0 48 48"><polygon points="24,3 44,14 44,34 24,45 4,34 4,14" fill="#1f6f5c"/>'
            '<path d="M19 12 h10 M21 12 v10 l-7 13 a2 2 0 0 0 2 3 h16 a2 2 0 0 0 2 -3 l-7 -13 v-10" stroke="#fff" stroke-width="2.4" fill="none"/>'
            '<path d="M16.5 31 h15" stroke="#9fe0c9" stroke-width="3"/></svg>')


def calib_logo() -> str:
    return ('<svg width="44" height="44" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="#b4531b"/>'
            '<path d="M10 30 A15 15 0 1 1 38 30" stroke="#fff" stroke-width="3" fill="none"/>'
            '<line x1="24" y1="28" x2="33" y2="16" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="28" r="3.2" fill="#fff"/></svg>')


def clearsight_logo() -> str:
    return ('<svg width="44" height="44" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="#4b2a7b"/>'
            '<path d="M7 24 C14 13 34 13 41 24 C34 35 14 35 7 24 Z" fill="#fff"/><circle cx="24" cy="24" r="6.5" fill="#4b2a7b"/>'
            '<circle cx="26" cy="22" r="2" fill="#c7b3ef"/></svg>')


def stamp(uid: str, ring: str, center: str, color: str, size: int = 112) -> str:
    return (f'<svg class="stamp" width="{size}" height="{size}" viewBox="0 0 120 120"><defs>'
            f'<path id="r{uid}" d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0"/></defs>'
            f'<circle cx="60" cy="60" r="56" fill="none" stroke="{color}" stroke-width="3"/>'
            f'<circle cx="60" cy="60" r="33" fill="none" stroke="{color}" stroke-width="1.4"/>'
            f'<text font-family="Helvetica Neue, Arial" font-size="10.2" font-weight="700" fill="{color}">'
            f'<textPath href="#r{uid}" textLength="276" lengthAdjust="spacing">{escape(ring)}</textPath></text>'
            f'<text x="60" y="57" text-anchor="middle" font-family="Helvetica Neue, Arial" font-size="9.5" font-weight="700" fill="{color}">{escape(center[0])}</text>'
            f'<text x="60" y="70" text-anchor="middle" font-family="Helvetica Neue, Arial" font-size="8" fill="{color}">{escape(center[1])}</text></svg>')


def signature(name: str, role: str, when: date, hand: str | None = None) -> str:
    written = hand or name.replace("Eng. ", "").replace("Dr. ", "")
    return (f'<div class="sig"><div class="hand">{escape(written)}</div>'
            f'<div class="line"><b>{escape(name)}</b><br>{escape(role)}<br>{dlong(when)}</div></div>')


def meta_table(rows: list[tuple[str, str]]) -> str:
    return '<table class="meta">' + "".join(f'<tr><td class="k">{escape(k)}</td><td>{v}</td></tr>' for k, v in rows) + "</table>"


def table(headers: list[str], rows: list[list], num_cols: set[int] = frozenset(), total: bool = False) -> str:
    head = "".join(f'<th class="{"num" if i in num_cols else ""}">{h}</th>' for i, h in enumerate(headers))
    body = []
    for r_i, row in enumerate(rows):
        cls = ' class="total"' if total and r_i == len(rows) - 1 else ""
        cells = "".join(f'<td class="{"num" if i in num_cols else ""}">{str(v).replace("Tier ", "Tier&nbsp;")}</td>'
                        for i, v in enumerate(row))
        body.append(f"<tr{cls}>{cells}</tr>")
    return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(body)}</tbody></table>"


def company_letterhead(f: Facility) -> str:
    return (f'<div class="lh"><div class="lh-brand">{dunes_logo()}<div><div class="lh-name">{OPERATOR["name"]}</div>'
            f'<div class="ar" style="font-size:11pt;color:#0f4c5c;text-align:left">{OPERATOR["name_ar"]}</div>'
            f'<div class="lh-sub">{escape(f.short)} &middot; {escape(f.field_name)}, Al Dhafra Region</div></div></div>'
            f'<div class="lh-right">Dunes Energy Tower, Al Maryah Island<br>PO Box 47120, Abu Dhabi, UAE<br>'
            f'Commercial licence {OPERATOR["licence"]}<br>{OPERATOR["web"]}</div></div>')


def company_stamp(f: Facility, uid: str) -> str:
    return stamp(uid, "DUNES ENERGY COMPANY \u2022 ABU DHABI \u2022 ", (f.short.split(" ")[-1], "HSE / MRV"), "#0f4c5c")


def cover_letter(f: Facility) -> str:
    c = f.calc
    ref = f"DEC/{f.code.split('-')[1]}/HSE/{f.submitted.year}/{f.submitted:%m%d}"
    enclosures = [
        (f"{f.code}_EAD-MRV-Emissions-Report_RY{YEAR}.xlsx", "Annual emissions report (EAD MRV reporting template, sheets A to K)"),
        (f"{f.code}_Monitoring-Plan_Rev{f.mp_rev}.pdf", f"Monitoring Plan Rev {f.mp_rev} including site schematic"),
        (f"{f.code}_Verification-Statement_RY{YEAR}.pdf", f"Verification statement {f.verifier_ref}, {VERIFIER['name']}"),
        ("evidence/", "Supporting evidence: meter data, flare log, diesel invoices, production and gas balance, gas analyses, calibration certificates"
         + ("" if f.flagged else ", LDAR survey summary")),
    ]
    gap_text = ("No data gaps occurred during the reporting period."
                if f.flagged else "One minor data gap (LP flare meter FT-5102, 11 to 13 March 2025) was identified, substituted in accordance with the Monitoring Plan and is reported in sheet H1.")
    body = f"""
{company_letterhead(f)}
<div style="display:flex;justify-content:space-between;gap:18pt;margin-bottom:8pt">
<p style="margin:0">Facility-Level MRV Team<br>Environment Agency &ndash; Abu Dhabi <span class="ar">(هيئة البيئة &ndash; أبوظبي)</span><br>Abu Dhabi, United Arab Emirates</p>
<p style="margin:0;text-align:right" class="small">Our ref: <b>{ref}</b><br>Date: <b>{dlong(f.submitted)}</b><br>EAD facility ID / permit: <b>{f.ead_id} / {f.permit}</b><br>
Submitted via the EAD Facility MRV portal (facilitymrv.ead.ae)</p></div>
<p style="margin-top:10pt"><b>Subject: Submission of the Annual Greenhouse Gas Emissions Report for Reporting Year {YEAR}, {escape(f.name)}</b></p>
<p>Dear Sir or Madam,</p>
<p>Pursuant to Article 6 of Federal Decree-Law No. 11 of 2024 on the Reduction of Climate Change Effects and the Agency's Technical Guidance for
Measurement, Reporting and Verification of Greenhouse Gas Emissions in Abu Dhabi Emirate, {OPERATOR["name"]} hereby submits the annual emissions
report for {escape(f.name)} covering the period 1 January to 31 December {YEAR}.</p>
{table(["Summary of reported emissions", "Value"], [
    ["Carbon dioxide (CO2)", f"{n0(c['co2_total'])} t"],
    ["Methane (CH4)", f"{n1(c['ch4_total'])} t ({n0(c['ch4_co2e'])} t CO2e, GWP {GWP_CH4})"],
    ["<b>Total Scope 1 emissions</b>", f"<b>{n0(c['total_co2e'])} t CO2e</b>"],
    ["Total hydrocarbon production", f"{n2(c['mmboe'])} MMboe"],
], num_cols={1})}
<p style="margin-bottom:2pt"><b>Enclosures</b></p>
{table(["#", "File", "Content"], [[str(i + 1), f'<span style="font-family:Menlo,monospace;font-size:7.4pt">{escape(name)}</span>', escape(desc)]
                                  for i, (name, desc) in enumerate(enclosures)])}
<p><b>Declaration.</b> We confirm that the enclosed report is complete and accurate, has been prepared in accordance with the approved Monitoring Plan
(Rev {f.mp_rev}) and the Agency's Technical Guidance, and covers all greenhouse gas emissions within the facility boundary. {gap_text}</p>
<p>For any clarification please contact {escape(f.ghg_lead)}, GHG &amp; Energy Lead ({f.ghg_lead_email}, {f.ghg_lead_phone}).</p>
<div class="keep"><p>Yours faithfully,</p>
<div class="sigs" style="margin-top:4pt">{signature(f.facility_manager, "Facility Manager", f.submitted)}{signature(f.ghg_lead, "GHG & Energy Lead", f.submitted)}{company_stamp(f, "cl")}</div></div>
"""
    return page(f"Cover letter RY{YEAR} {f.short}", body, "#c9a227", "#0f4c5c")


def schematic_svg(f: Facility) -> str:
    grey, orange, red, brown, purple = "#7b8a92", "#d9822b", "#c0392b", "#8d6e63", "#7d3c98"
    out = ['<svg viewBox="0 0 900 480" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica Neue, Arial">', "<defs>"]
    for name, color in (("g", grey), ("o", orange), ("r", red), ("p", purple)):
        out.append(f'<marker id="a{name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
                   f'<path d="M0,0 L10,5 L0,10 z" fill="{color}"/></marker>')
    out.append("</defs>")
    out.append('<rect x="6" y="6" width="888" height="468" rx="10" fill="none" stroke="#9aa5ab" stroke-dasharray="6 5"/>')
    out.append(f'<text x="18" y="466" font-size="10" fill="#5f6b72">Facility boundary (operational control of {OPERATOR["name"]}): {escape(f.short)}</text>')

    def box(x, y, w, h, l1, l2, stripe=None, badge=None):
        s = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="#ffffff" stroke="#51626b" stroke-width="1.2"/>'
        if stripe:
            s += f'<rect x="{x}" y="{y}" width="6" height="{h}" rx="2" fill="{stripe}"/>'
        s += f'<text x="{x + w / 2 + 3}" y="{y + h / 2 - 2}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#1d2327">{l1}</text>'
        s += f'<text x="{x + w / 2 + 3}" y="{y + h / 2 + 13}" text-anchor="middle" font-size="9.8" fill="#51626b">{l2}</text>'
        if badge:
            text, color = badge
            bw = len(text) * 6.2 + 12
            s += f'<rect x="{x + w - bw - 6}" y="{y - 8}" width="{bw}" height="15" rx="7.5" fill="{color}"/>'
            s += f'<text x="{x + w - bw / 2 - 6}" y="{y + 3}" text-anchor="middle" font-size="8.6" font-weight="700" fill="#fff">{text}</text>'
        return s

    def line(points, color, marker, dashed=False, width=1.8):
        pts = " ".join(f"{x},{y}" for x, y in points)
        dash = ' stroke-dasharray="5 4"' if dashed else ""
        return f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="{width}"{dash} marker-end="url(#a{marker})"/>'

    def meter(cx, cy, tag, color, label_dx=16, label_dy=4):
        return (f'<circle cx="{cx}" cy="{cy}" r="10" fill="#fff" stroke="{color}" stroke-width="1.8"/>'
                f'<text x="{cx}" y="{cy + 3.5}" text-anchor="middle" font-size="8.5" font-weight="700" fill="{color}">FT</text>'
                f'<text x="{cx + label_dx}" y="{cy + label_dy}" font-size="9.5" font-weight="700" fill="{color}">{tag}</text>')

    def diamond(cx, cy):
        return f'<path d="M{cx},{cy - 6} L{cx + 6},{cy} L{cx},{cy + 6} L{cx - 6},{cy} Z" fill="{purple}"/>'

    out += [
        line([(138, 223), (176, 223)], grey, "g"), line([(316, 210), (341, 210), (341, 156), (364, 156)], grey, "g"),
        line([(316, 236), (341, 236), (341, 292), (364, 292)], grey, "g"), line([(512, 156), (554, 156)], grey, "g"),
        line([(702, 156), (744, 156)], grey, "g"), line([(512, 292), (554, 292)], grey, "g"), line([(702, 292), (744, 292)], grey, "g"),
        line([(629, 128), (629, 110), (247, 110), (247, 92)], orange, "o"), line([(316, 64), (364, 64)], orange, "o"),
        line([(247, 250), (247, 390)], red, "r"), line([(439, 320), (439, 390)], red, "r"),
    ]
    out += [
        box(20, 196, 118, 54, "Production wells", "&amp; flowlines"),
        box(178, 196, 138, 54, "Inlet separators", "V-101 HP &#183; V-102 LP"),
        box(178, 40, 138, 50, "Fuel gas system", "header &#183; KO drum", badge=("SS-01", orange)),
        box(366, 36, 146, 56, "Power generation", "GTG-A/B/C", stripe=orange),
        box(366, 128, 146, 56, "Gas compression", "K-201A/B (GT-driven)", stripe=orange),
        box(556, 128, 146, 56, "TEG dehydration", "U-250"),
        box(746, 128, 136, 56, "Sales gas export", "&amp; reinjection"),
        box(366, 264, 146, 56, "Crude heaters", "H-101A/B", stripe=orange),
        box(556, 264, 146, 56, "Storage tanks", "T-401A/B"),
        box(746, 264, 136, 56, "Crude export", "P-410A/B &#8594; pipeline"),
        box(178, 392, 138, 54, "HP flare", "FL-501", stripe=red, badge=("SS-02", red)),
        box(366, 392, 146, 54, "LP flare", "FL-502", stripe=red, badge=("SS-03", red)),
        box(746, 392, 136, 54, "Emergency diesel", "EDG-1 &#183; P-801A/B", stripe=brown, badge=("SS-04", brown)),
        meter(300, 110, "FT-3001", orange, -18, 24), meter(247, 322, "FT-5101", red), meter(439, 356, "FT-5102", red),
    ]
    out += [line([(690, 128), (690, 104)], purple, "p", dashed=True), diamond(690, 128),
            f'<text x="697" y="108" font-size="9.5" fill="{purple}">still vent</text>',
            diamond(384, 184), f'<text x="394" y="200" font-size="9.5" fill="{purple}">wet seal vents</text>']
    if f.flagged:
        out += [line([(672, 264), (672, 236)], purple, "p", dashed=True), diamond(672, 264),
                f'<text x="679" y="240" font-size="9.5" fill="{purple}">P/V vents to atmosphere</text>']
    else:
        out += [line([(590, 264), (590, 226), (470, 226), (470, 186)], purple, "p", dashed=True), diamond(590, 264),
                f'<text x="597" y="238" font-size="9.5" fill="{purple}">VRU-401: tank vapours recovered</text>']
    lx, ly = 528, 380
    legend = [(orange, False, "SS-01 fuel gas (bar = consumer)"), (red, False, "SS-02/03 flare gas"),
              (brown, False, "SS-04 diesel (invoices)"), (purple, True, "Methane vent / fugitive source"), (grey, False, "Process flow")]
    out.append(f'<rect x="{lx}" y="{ly}" width="206" height="86" rx="6" fill="#f7f9fa" stroke="#d6dde0"/>')
    for i, (color, dashed, text) in enumerate(legend):
        y = ly + 13 + i * 12
        dash = ' stroke-dasharray="5 4"' if dashed else ""
        out.append(f'<line x1="{lx + 10}" y1="{y}" x2="{lx + 32}" y2="{y}" stroke="{color}" stroke-width="2.4"{dash}/>')
        out.append(f'<text x="{lx + 40}" y="{y + 3.5}" font-size="8.8" fill="#33434a">{text}</text>')
    out.append(f'<text x="{lx + 10}" y="{ly + 78}" font-size="8.2" fill="#5f6b72">Site-wide: pneumatics, fugitive components</text>')
    out.append("</svg>")
    return "".join(out)


def monitoring_plan(f: Facility) -> str:
    c = f.calc
    p = c["prior"]
    doc_no = f"{f.code}-HSE-MP-001"
    if f.flagged:
        history = [["1.0", "20-Jun-2024", "Initial Monitoring Plan following EAD registration"],
                   ["2.0", "15-Oct-2024", "Fuel gas meter FT-3001 replaced with 4-path ultrasonic meter"],
                   ["3.0", dshort(f.mp_date), "Annual update for RY2025; section 6.3 added (other methane sources)"]]
    else:
        history = [["1.0", "30-May-2024", "Initial Monitoring Plan following EAD registration"],
                   ["2.0", "12-Sep-2024", "Quantified methodology added for all methane sources (section 6)"],
                   ["3.0", "05-Dec-2024", "VRU-401 availability monitoring and LDAR quantification method added"],
                   ["4.0", dshort(f.mp_date), "Annual update for RY2025"]]
    hp_share = 0.9
    est_rows = [
        ["SS-01", "Fuel gas", "ES-01 GTG-A/B/C, ES-02 K-201A/B drivers, ES-03 H-101A/B", n0(p["fuel_co2"]), "Major", "Tier 3"],
        ["SS-02", "HP flare gas", "ES-04 HP flare FL-501", n0(p["flare_co2"] * hp_share), "Major", "Tier 2"],
        ["SS-03", "LP flare gas", "ES-05 LP flare FL-502", n0(p["flare_co2"] * (1 - hp_share)), "Minor", "Tier 2"],
        ["SS-04", "Diesel", "ES-06 EDG-1, ES-07 P-801A/B", n0(p["diesel_co2"]), "De-minimis", "Tier 1"],
    ]
    insts = instruments(f)
    inst_rows = [[i["tag"], i["service"], i["type"], i["range"], i["tier"], "12 months", CALIB["name"]] for i in insts]
    if f.flagged:
        methane = f"""
<h3>6.1 Flare combustion slip (M-01)</h3>
<p>Methane emitted from incomplete combustion at FL-501 and FL-502 is calculated from the metered flare volume, the methane content of the flare
header gas (quarterly GC analysis) and a combustion efficiency of {FLARE_CE:.0%}.</p>
<div class="formula">CH4 (t) = V_flare (Sm3) &times; x_CH4 &times; (1 &minus; CE) &times; 16.043 / 23.645 / 1000</div>
<h3>6.2 Combustion methane (M-02, M-03)</h3>
<p>Methane from fuel gas and diesel combustion is calculated with IPCC 2006 Tier 1 factors ({CH4_EF_GAS_COMB:g} and {CH4_EF_DIESEL_COMB:g} kg CH4/TJ).</p>
<h3>6.3 Other methane sources</h3>
<p>Crude storage tanks T-401A/B, the TEG dehydration unit still vent (U-250), gas-driven pneumatic controllers, compressor seals (K-201A/B) and
fugitive components have been identified as potential methane sources. A quantification methodology for these sources is under development and
will be included in the next revision of this Monitoring Plan (target: Q4 2025). A leak detection and repair (LDAR) programme is planned for 2026.</p>
"""
    else:
        x = f.extra
        methane = "<p>All methane sources at the facility are quantified as follows. Results are reported in sheet G of the emissions report.</p>" + table(
            ["ID", "Source", "Method", "Data / frequency"], [
                ["M-01", "Flare combustion slip", f"Metered flare volume &times; x_CH4 &times; (1 &minus; {FLARE_CE:.2f})", "FT-5101/5102 daily; GC quarterly"],
                ["M-02/03", "Fuel gas and diesel combustion", "IPCC 2006 Tier 1 (1 and 3 kg CH4/TJ)", "Monthly energy use"],
                ["M-04", "Storage tanks T-401A/B", "Process simulation of flash + working/breathing losses &times; (1 &minus; VRU availability)", "Simulation annual; VRU run-hours monthly"],
                ["M-05", "TEG still vent (U-250)", "GRI-GLYCalc v4", "Operating data quarterly"],
                ["M-06", "Gas-driven pneumatic controllers", "Device inventory &times; device-specific bleed factor", "Inventory annual; bleed survey 2024"],
                ["M-07", "Compressor wet seals K-201A/B", "Measured degassing vent flow &times; CH4 content", "Quarterly measurement"],
                ["M-08", "Fugitive components", "OGI LDAR survey; Hi-Flow quantification of leaks", f"Quarterly survey ({LDAR_CONTRACTOR['name']})"],
                ["M-09", "Maintenance blowdowns", "Vented volume (P, V, T of isolated section) &times; CH4 content", "Per event (permit-to-work)"],
            ]) + f'<p class="muted small">VRU-401 availability target 97%; pneumatic inventory {sum(n for _, n, _ in x["pneumatics"])} gas-driven devices.</p>'
    body = f"""
{company_letterhead(f)}
<div class="title-block"><div class="eyebrow">Greenhouse Gas Monitoring Plan</div>
<h1>{escape(f.name)}</h1></div>
{meta_table([("Document number", doc_no), ("Revision / date", f"Rev {f.mp_rev} &middot; {dlong(f.mp_date)}"), ("Status", "Submitted to EAD"),
             ("Reporting period covered", f"From 1 January {YEAR} until superseded"), ("Prepared by", f"{escape(f.ghg_lead)}, GHG &amp; Energy Lead"),
             ("Approved by", f"{escape(f.facility_manager)}, Facility Manager")])}
<h2>Revision history</h2>
{table(["Rev", "Date", "Description"], history)}
<h2>1. Purpose and regulatory basis</h2>
<p>This Monitoring Plan sets out how {OPERATOR["name"]} monitors and reports direct (Scope 1) emissions of carbon dioxide and methane from
{escape(f.name)}. It implements Article 6 of Federal Decree-Law No. 11 of 2024 on the Reduction of Climate Change Effects and the Agency's
Technical Guidance for MRV of Greenhouse Gas Emissions in Abu Dhabi Emirate, under the operational control approach.</p>
<h2>2. Facility description and boundary</h2>
<p>{escape(facility_summary(f))}</p>
{table(["Tag", "Unit", "Capacity", "Source stream", "Notes"], [[r[0], r[1], r[2], r[3], r[5]] for r in technical_units(f)])}
<h2>3. Site schematic</h2>
<div class="figure">{schematic_svg(f)}</div>
<div class="caption">Figure 1: Emission sources, source streams and measurement points at {escape(f.short)}. Tags are referenced throughout this plan and the emissions report.</div>
<h2>4. Source streams and categorisation</h2>
<p>Estimated emissions are based on the reporting year 2024. Categories follow the Technical Guidance (Appendix 1.3, Step 3).</p>
{table(["ID", "Source stream", "Emission sources", "Est. t CO2 (2024)", "Category", "Tier"], est_rows, num_cols={3})}
<h2>5. Calculation methodology</h2>
<h3>5.1 Combustion of fuel gas and diesel</h3>
<div class="formula">CO2 (t) = AD (Sm3) &times; NCV (MJ/Sm3) &times; 10&#8315;&#8310; &times; EF (t CO2/TJ) &times; OF &nbsp;&nbsp;|&nbsp;&nbsp; Diesel: CO2 (t) = m (t) &times; NCV (GJ/t) / 1000 &times; EF (t CO2/TJ)</div>
<h3>5.2 Calculation factors</h3>
{table(["Parameter", "Source stream", "Basis", "Tier"], [
    ["NCV fuel gas", "SS-01", "Site-specific: quarterly GC analysis at SP-3001 (ISO 6974 / ISO 6976), arithmetic mean of four samples", "Tier 3"],
    ["EF fuel gas", "SS-01", "Site-specific: calculated from the carbon content of the same quarterly samples", "Tier 3"],
    ["Oxidation factor", "SS-01, SS-04", "1.0", "-"],
    ["EF flare gas", "SS-02, SS-03", f"Composition-based from quarterly GC at SP-5101, combustion efficiency {FLARE_CE:.2f}", "Tier 3"],
    ["NCV / EF diesel", "SS-04", f"IPCC 2006 defaults ({DIESEL_NCV:g} GJ/t, {DIESEL_EF:g} t CO2/TJ)", "Tier 1"],
])}
<h3>5.3 Flaring</h3>
<div class="formula">CO2 (t) = V (Sm3) &times; [ &Sigma;(x&#7522; &times; n&#7522;) &times; CE + x_CO2 ] &times; 44.01 / {MOLAR_VOLUME} / 1000</div>
<p class="small muted">x&#7522; = mole fraction of hydrocarbon component i, n&#7522; = carbon atoms per molecule, CE = combustion efficiency, standard conditions 15 &deg;C and 101.325 kPa.</p>
<h2>6. Methane monitoring</h2>
{methane}
<h2>7. Measurement equipment</h2>
{table(["Tag", "Service", "Type", "Range", "Tier", "Calibration interval", "Calibrated by"], inst_rows)}
<p class="small">Gas sampling points: SP-3001 (fuel gas header) and SP-5101 (HP flare header), sampled quarterly and analysed by {LAB["name"]}.</p>
<h2>8. Data flow, QA/QC and data gaps</h2>
<h3>8.1 Data flow</h3>
<p>Meter totals are recorded in the PI historian, extracted monthly into the GHG workbook ({f.code}-HSE-PR-110), reviewed by the HSE Manager,
compiled into the annual emissions report and verified by an accredited verifier before submission to the Agency.</p>
<h3>8.2 Control activities</h3>
<ul>
<li>Monthly reconciliation of FT-3001 fuel gas totals with the production allocation fuel gas figure (tolerance 2%).</li>
<li>Monthly reconciliation of flare meter totals against the gas balance in the production allocation report. Deviations greater than 10% are investigated and documented.</li>
<li>Diesel deliveries reconciled with supplier invoices and tank dips.</li>
<li>Year-on-year comparison of emissions and intensity; variances greater than 10% explained in the annual review memo.</li>
</ul>
<h3>8.3 Data gaps and substitution</h3>
<p>Where a meter is unavailable, missing data are substituted with the average of the 30 days of valid data preceding the gap. Gaps are recorded in
sheet H1 of the emissions report and notified to the Agency within 30 days. Where a meter is expected to be out of service for more than 30 days,
this Monitoring Plan is revised and resubmitted to the Agency within 30 days of the change.</p>
<h3>8.4 Revision of this plan</h3>
<p>The plan is reviewed annually and updated before 1 April each year, and within 30 days of any significant change in operations, methodology or
measurement equipment.</p>
<h2>9. Roles and responsibilities</h2>
{table(["Post", "Responsibility"], [
    ["Facility Manager", "Accountable for MRV compliance; approves this plan and signs the operator declaration."],
    ["GHG &amp; Energy Lead", "Owns this plan, the GHG workbook and the annual report; runs monthly reconciliations."],
    ["Instrumentation Supervisor", "Calibration and maintenance of FT-3001, FT-5101 and FT-5102."],
    ["Laboratory Coordinator", "Quarterly gas sampling and liaison with the analytical laboratory."],
    ["Production Accounting Engineer", "Monthly hydrocarbon allocation and gas balance."],
])}
<div class="keep"><h2>10. Records</h2>
<p>All monitoring data, calculations, calibration certificates, analyses, invoices and verification reports are retained for at least five years.</p>
<div class="sigs">{signature(f.ghg_lead, "Prepared: GHG & Energy Lead", f.mp_date)}{signature(f.facility_manager, "Approved: Facility Manager", f.mp_date)}{company_stamp(f, "mp")}</div></div>
"""
    return page(f"Monitoring Plan {doc_no} Rev {f.mp_rev}", body, "#c9a227", "#0f4c5c", running=f"{doc_no} Rev {f.mp_rev}")


def verification_statement(f: Facility) -> str:
    c = f.calc
    rows = [[sid, name, n0(co2)] for sid, name, co2, _ in c["streams"]]
    rows.append(["CH4", "Methane (in scope)", f"{n1(c['ch4_total'])} t CH4 = {n0(c['ch4_co2e'])} t CO2e"])
    rows.append(["", "Total verified emissions", f"{n0(c['total_co2e'])} t CO2e"])
    if f.flagged:
        est_sm3 = sum(r["hp"] for r in c["log"] if r["hp_src"] == "ENGINEERING ESTIMATE")
        ef_gap = round(c["fuel_tj"] * c["fuel_ef_lab"]) - c["fuel_co2"]
        scope = ("CO2 emissions from source streams SS-01 to SS-04, and CH4 from combustion and flare combustion slip (M-01 to M-03). "
                 "Methane sources M-04 to M-08 (storage tanks, TEG still vent, pneumatic controllers, compressor seals and fugitive components) "
                 "are not quantified in the Monitoring Plan and were excluded from the scope of this verification at the request of the operator.")
        findings = [
            ["F-01", '<span class="badge warn">Misstatement, uncorrected</span>',
             f"SS-01: the IPCC default emission factor ({c['fuel_ef_used']:.2f} t CO2/TJ) was applied instead of the site-specific factor required by "
             f"Monitoring Plan section 5.2 (mean of quarterly analyses {c['fuel_ef_lab']:.2f} t CO2/TJ). Understatement {n0(ef_gap)} t CO2 "
             f"({ef_gap / c['total_co2e']:.1%} of total), below materiality.", "Open. Operator to correct from RY2026."],
            ["F-02", '<span class="badge ok">Misstatement, corrected</span>',
             "SS-04: one diesel delivery was counted twice in the draft report (+62.4 t diesel). Corrected in the final report.", "Closed"],
            ["F-03", '<span class="badge bad">Non-conformity, unresolved</span>',
             f"SS-02: the calibration of HP flare meter FT-5101 expired on 31 May 2025 and the meter was removed on 1 June 2025 and not reinstated "
             f"during the reporting period. HP flare volumes from 1 June to 31 December 2025 ({n0(est_sm3)} Sm3, {est_sm3 / c['hp_sm3']:.0%} of SS-02) "
             "are engineering estimates. Documentation of the estimation model was not provided and the estimates could not be corroborated "
             "against the gas balance. The substitution procedure of Monitoring Plan section 8.3 was not applied and the plan was not revised.", "Open"],
            ["F-04", '<span class="badge warn">Observation</span>',
             "Methane sources M-04 to M-08 are not quantified (Monitoring Plan section 6.3). Quantification is required for a complete report.", "Open"],
        ]
        opinion = ("<p><b>Qualified opinion.</b> Based on the procedures performed and the evidence obtained, except for the possible effects of the matter "
                   "described in finding F-03, the in-scope CO2 and CH4 emissions stated in the operator's emissions report for the period "
                   f"1 January to 31 December {YEAR} are, in all material respects, fairly stated in accordance with the verification criteria.</p>"
                   "<p><b>Basis for qualification.</b> HP flare volumes for 1 June to 31 December 2025 are based on uncorroborated engineering estimates. "
                   "We were unable to obtain sufficient appropriate evidence for source stream SS-02 for that period. This statement does not cover "
                   "methane sources M-04 to M-08.</p>")
        recs = ["Reinstate and recalibrate FT-5101; apply the Monitoring Plan substitution procedure and report the June to December 2025 period as a data gap.",
                "Revise the Monitoring Plan to include quantification of all methane sources before RY2026.",
                "Apply the site-specific fuel gas emission factor as required by the Monitoring Plan."]
    else:
        scope = f"CO2 and CH4 emissions from all source streams (SS-01 to SS-04) and methane sources (M-01 to M-09) described in Monitoring Plan Rev {f.mp_rev}."
        findings = [
            ["F-01", '<span class="badge ok">Misstatement, corrected</span>',
             "M-06: pneumatic device count updated from 44 to 42 after field verification of the device inventory.", "Closed"],
            ["F-02", '<span class="badge warn">Observation</span>',
             "SS-04: diesel is monitored at Tier 1 using supplier invoices. Tank level gauging would allow Tier 2.", "Open (improvement)"],
        ]
        opinion = ("<p><b>Unmodified opinion.</b> Based on the procedures performed and the evidence obtained, the CO2 and CH4 emissions stated in the "
                   f"operator's emissions report for the period 1 January to 31 December {YEAR} are, in all material respects, fairly stated in "
                   "accordance with the verification criteria and free from material misstatement.</p>")
        recs = ["Consider tank level gauging for diesel to move SS-04 to Tier 2.",
                "Continue quarterly LDAR surveys and extend Hi-Flow quantification to all leaks above 0.5 kg/h."]
    body = f"""
<div class="lh"><div class="lh-brand">{kestrel_logo()}<div><div class="lh-name">KESTREL</div><div class="lh-sub">Verification Services LLC</div></div></div>
<div class="lh-right">{escape(VERIFIER["address"])}<br>{escape(VERIFIER["accreditation"])}<br>{escape(VERIFIER["ead_listing"])}</div></div>
<div class="title-block"><div class="eyebrow">Independent Verification Statement</div>
<h1>Annual Greenhouse Gas Emissions Report, Reporting Year {YEAR}</h1></div>
{meta_table([("Statement reference", f.verifier_ref), ("Date of statement", dlong(f.verif_date)), ("Operator", OPERATOR["name"]),
             ("Facility", f"{escape(f.name)} (EAD ID {f.ead_id})"), ("Reporting period", f"1 January to 31 December {YEAR}"),
             ("Emissions report", f"{f.code}_EAD-MRV-Emissions-Report_RY{YEAR}.xlsx (final)"),
             ("Monitoring Plan", f"{f.code}-HSE-MP-001 Rev {f.mp_rev}"),
             ("Criteria", "EAD Technical Guidance for MRV; approved Monitoring Plan; ISO 14064-3:2019"),
             ("Level of assurance / materiality", "Reasonable assurance / 5% of total reported emissions"),
             ("Verification team", f"{escape(f.lead_verifier)} (Lead Verifier); {escape(VERIFIER['expert'])} (Technical Expert, oil &amp; gas); {escape(VERIFIER['reviewer'])} (Independent Reviewer)"),
             ("Notification to EAD / site visit", f"{dlong(f.verif_notified)} / {dlong(f.site_visit)}")])}
<h2>1. Scope</h2><p>{escape(scope)}</p>
<h2>2. Emissions covered by this statement</h2>
{table(["ID", "Source", "Verified (t CO2 unless stated)"], rows, num_cols={2}, total=True)}
<h2>3. Verification activities</h2>
<ul><li>Remote review of the Monitoring Plan, GHG workbook and previous correspondence with the Agency; strategic analysis and risk assessment.</li>
<li>Site visit on {dlong(f.site_visit)}: interviews with the GHG &amp; Energy Lead, Instrumentation Supervisor, Laboratory Coordinator and Production Accounting Engineer; inspection of FT-3001, FT-5101 and FT-5102.</li>
<li>Data testing: PI historian totals traced to the GHG workbook for 3 months per source stream; recalculation of all source streams; sampling of 60% of diesel invoices.</li>
<li>Cross-checks of meter totals against the production allocation gas balance; review of calibration certificates and gas analyses.</li></ul>
<h2>4. Findings</h2>
{table(["ID", "Classification", "Description", "Status"], findings)}
<h2>5. Opinion</h2>
{opinion}
<h2>6. Recommendations</h2>
<ol>{''.join(f"<li>{escape(r)}</li>" for r in recs)}</ol>
<div class="keep"><p class="small muted">This statement is issued to {OPERATOR["name"]} for submission to the Environment Agency &ndash; Abu Dhabi and relates only to the
facility and period stated. The operator is responsible for the preparation of the emissions report.</p>
<div class="sigs">{signature(f.lead_verifier, "Lead Verifier", f.verif_date)}{signature(VERIFIER["reviewer"], "Independent Reviewer", f.verif_date)}
{stamp("kv", "KESTREL VERIFICATION SERVICES \u2022 ", ("VERIFIED", f.verifier_ref), "#14264a")}</div></div>
"""
    return page(f"Verification Statement {f.verifier_ref}", body, "#d6423a", "#14264a", running=f"Kestrel {f.verifier_ref}")


def lab_sample_dates(f: Facility) -> list[date]:
    days = [12, 14, 13, 12] if f.flagged else [11, 13, 12, 11]
    return [date(YEAR, m, d) for m, d in zip((2, 5, 8, 11), days)]


def lab_report(f: Facility) -> str:
    c = f.calc
    sampled = lab_sample_dates(f)
    report_date = date(YEAR, 12, 3) if f.flagged else date(YEAR, 11, 28)
    samples = []
    for q, d in enumerate(sampled):
        samples.append([f"{f.lab_ref}-FG-Q{q + 1}", "SP-3001 fuel gas header", dshort(d), dshort(date.fromordinal(d.toordinal() + 2)), "SAL field technician"])
        samples.append([f"{f.lab_ref}-FL-Q{q + 1}", "SP-5101 HP flare header", dshort(d), dshort(date.fromordinal(d.toordinal() + 2)), "SAL field technician"])

    def composition(comps: list[dict], props: list[dict], title: str, flare: bool) -> str:
        rows = []
        for key, (name, *_rest) in COMPONENTS.items():
            vals = [q[key] for q in comps]
            rows.append([name] + [f"{v:.2f}" for v in vals] + [f"{sum(vals) / 4:.2f}"])
        rows.append(["Total"] + ["100.00"] * 5)
        prop_rows = [
            ["Molar mass (kg/kmol)"] + [f"{p['molar_mass']:.2f}" for p in props] + [f"{sum(p['molar_mass'] for p in props) / 4:.2f}"],
            ["Relative density (air = 1)"] + [f"{p['rel_density']:.4f}" for p in props] + [f"{sum(p['rel_density'] for p in props) / 4:.4f}"],
            ["Net calorific value (MJ/Sm3)"] + [f"{p['ncv']:.2f}" for p in props] + [f"{sum(p['ncv'] for p in props) / 4:.2f}"],
            ["Carbon content (wt %)"] + [f"{p['carbon_wt']:.2f}" for p in props] + [f"{sum(p['carbon_wt'] for p in props) / 4:.2f}"],
            ["CO2 emission factor (t CO2/TJ)"] + [f"{p['ef']:.2f}" for p in props] + [f"{sum(p['ef'] for p in props) / 4:.2f}"],
        ]
        if flare:
            prop_rows.append([f"CO2 per 10^3 Sm3 flared at CE {FLARE_CE:.2f} (t)"] + [f"{p['flare_co2']:.3f}" for p in props] + [f"{sum(p['flare_co2'] for p in props) / 4:.3f}"])
            prop_rows.append(["CH4 per 10^3 Sm3 vented (t)"] + [f"{p['vent_ch4']:.4f}" for p in props] + [f"{sum(p['vent_ch4'] for p in props) / 4:.4f}"])
        hdr = ["Component (mol %)"] + [f"Q{i + 1} {dshort(d)}" for i, d in enumerate(sampled)] + ["Mean"]
        return (f"<h2>{title}</h2>" + table(hdr, rows, num_cols={1, 2, 3, 4, 5}, total=True)
                + table(["Calculated property"] + hdr[1:], prop_rows, num_cols={1, 2, 3, 4, 5}))

    body = f"""
<div class="lh"><div class="lh-brand">{lab_logo()}<div><div class="lh-name">Sabkha Analytical Laboratories</div><div class="lh-sub">Petroleum &amp; gas testing &middot; LLC</div></div></div>
<div class="lh-right">{escape(LAB["address"])}<br>{escape(LAB["accreditation"])}</div></div>
<div class="title-block"><div class="eyebrow">Certificate of Analysis</div><h1>Natural gas composition and calorific value: {YEAR} quarterly samples</h1></div>
{meta_table([("Report number", f.lab_ref), ("Date of issue", dlong(report_date)), ("Client", f"{OPERATOR['name']}, {escape(f.name)}"),
             ("Methods", "Composition by gas chromatography, ISO 6974-5; calorific value, density and carbon content calculated per ISO 6976:2016"),
             ("Reference conditions", f"Combustion 15 &deg;C, metering 15 &deg;C, 101.325 kPa; ideal molar volume {MOLAR_VOLUME} m3/kmol"),
             ("Expanded uncertainty (k = 2)", "NCV &plusmn;0.3%; methane &plusmn;0.15 mol %; CO2 emission factor &plusmn;0.5%")])}
<h2>Samples</h2>
{table(["Sample ID", "Sampling point", "Sampled", "Analysed", "Sampled by"], samples)}
{composition(c["fuel_q"], c["fuel_p"], "Results: fuel gas (SP-3001)", False)}
{composition(c["flare_q"], c["flare_p"], "Results: HP flare header gas (SP-5101)", True)}
<div class="keep"><p class="small muted">The CO2 emission factor is calculated as the total carbon (hydrocarbon carbon plus CO2) multiplied by 44.010 and divided by the net
calorific value. Flare factors assume the stated combustion efficiency applied to hydrocarbon carbon; CO2 present in the gas is emitted unchanged.
Results relate only to the samples tested.</p>
<div class="sigs">{signature(LAB["analyst"], "Analyst", report_date)}{signature(LAB["approver"], "Laboratory Manager (approved)", report_date)}
{stamp("lab", "SABKHA ANALYTICAL LABORATORIES \u2022 ", ("TL-0388", "ISO/IEC 17025"), "#1f6f5c")}</div></div>
"""
    return page(f"Certificate of Analysis {f.lab_ref}", body, "#2ea37f", "#1f6f5c", running=f"Sabkha Analytical Laboratories {f.lab_ref}")


def calibration_certificates(f: Facility) -> str:
    pages = []
    for i, inst in enumerate(instruments(f)):
        standard = "ISO 17089-1:2019" if inst["tag"] == "FT-3001" else "ISO 17089-2:2012"
        result = '<span class="badge ok">PASS</span>'
        pages.append(f"""
<div class="{'page-break' if i else ''}">
<div class="lh"><div class="lh-brand">{calib_logo()}<div><div class="lh-name">Gulfmetric</div><div class="lh-sub">Calibration Services LLC</div></div></div>
<div class="lh-right">{escape(CALIB["address"])}<br>{escape(CALIB["accreditation"])}</div></div>
<div class="title-block"><div class="eyebrow">Certificate of Calibration</div><h1>{inst["tag"]}: {escape(inst["service"])}</h1></div>
{meta_table([("Certificate number", inst["cert"]), ("Customer", f"{OPERATOR['name']}, {escape(f.name)}"), ("Instrument", escape(inst["type"])),
             ("Tag / serial number", f"{inst['tag']} / {inst['serial']}"), ("Measuring range", escape(inst["range"])),
             ("Date of calibration", dlong(inst["last"])), ("Next calibration due", f"<b>{dlong(inst['due'])}</b>"),
             ("Method", f"In-situ verification per {standard}: zero-flow verification, speed-of-sound check against value calculated from gas composition (AGA Report No. 10), path and transducer diagnostics, transmitter and flow computer checks"),
             ("Reference standards", "Pressure calibrator PC-118 (cert. GCS-REF-24-311), temperature reference TR-044 (cert. GCS-REF-24-298), traceable to SI via national standards")])}
<h2>Results</h2>
{table(["Check", "As found", "As left", "Acceptance limit", "Result"], [
    ["Flow measurement error (% of reading)", f"{inst['as_found']:+.2f}%", f"{inst['as_left']:+.2f}%", f"&plusmn;{inst['limit']:.1f}%", result],
    ["Speed of sound deviation (average of paths)", f"{inst['as_found'] * 0.08:.2f}%", f"{inst['as_left'] * 0.08:.2f}%", "&plusmn;0.2%", result],
    ["Zero-flow reading", "0.003 m/s", "0.001 m/s", "&plusmn;0.006 m/s", result],
    ["Transmitter / flow computer check", "Within limits", "Within limits", "Manufacturer spec.", result],
], num_cols=set())}
<p>The instrument was found to be within the acceptance limits after adjustment and is fit for use until the next calibration due date shown above.
Results relate only to the item calibrated at the time of calibration.</p>
<div class="sigs">{signature(CALIB["technician"], "Calibration Technician", inst["last"])}{signature(CALIB["approver"], "Technical Manager (approved)", inst["last"])}
{stamp(f"cal{i}", "GULFMETRIC CALIBRATION SERVICES \u2022 ", ("CL-0215", "CALIBRATED"), "#b4531b")}</div>
</div>""")
    return page(f"Calibration certificates {f.code}", "".join(pages), "#e07a2f", "#8a3f12", running=f"Gulfmetric calibration records, {f.short}")


def ldar_summary(f: Facility) -> str:
    x = f.extra
    rows = [[q, dshort(d), n0(comp), str(leaks), str(rep), n1(t)] for q, d, comp, leaks, rep, t in x["ldar"]]
    rows.append(["Total", "", "", str(sum(r[3] for r in x["ldar"])), str(sum(r[4] for r in x["ldar"])), n1(sum(r[5] for r in x["ldar"]))])
    body = f"""
<div class="lh"><div class="lh-brand">{clearsight_logo()}<div><div class="lh-name">ClearSight</div><div class="lh-sub">OGI Surveys LLC</div></div></div>
<div class="lh-right">Prepared for {OPERATOR["name"]}<br>{escape(f.name)}</div></div>
<div class="title-block"><div class="eyebrow">Leak Detection and Repair (LDAR)</div><h1>{YEAR} annual summary: {escape(f.short)}</h1></div>
{meta_table([("Report reference", f"CS-LDAR-{YEAR}-{f.ead_id[-4:]}"), ("Date", dlong(date(YEAR, 12, 10))), ("Survey lead", LDAR_CONTRACTOR["lead"]),
             ("Method", "Optical gas imaging (cooled MWIR camera, 3.2 to 3.4 &micro;m) of all accessible components; detected leaks quantified with a Hi-Flow sampler"),
             ("Emission estimate", "Measured leak rate &times; leak duration; leaks assumed to start midway between surveys and to stop at the repair date recorded in CMMS")])}
<h2>Survey results</h2>
{table(["Survey", "Date", "Components surveyed", "Leaks detected", "Repaired within 15 days", "Estimated CH4 (t)"], rows, num_cols={2, 3, 4, 5}, total=True)}
<p>One leak detected in Q2 (gate valve on the K-201B suction header) required a shutdown to repair and was fixed during the planned September
maintenance window. Its emissions are included until the repair date.</p>
<h2>Component inventory</h2>
{table(["Component type", "Count"], [["Valves", "3,210"], ["Connectors and flanges", "5,480"], ["Pressure relief devices", "96"],
                                      ["Open-ended lines", "74"], ["Pump seals", "18"], ["Other", "592"], ["Total", "9,470"]], num_cols={1}, total=True)}
<div class="keep"><p class="small muted">Compressor seals, pneumatic controllers, tank and TEG vents are quantified separately by the operator and are excluded from this survey total.</p>
<div class="sigs">{signature(LDAR_CONTRACTOR["lead"], "Survey Lead, ClearSight OGI Surveys", date(YEAR, 12, 10))}{signature(f.ghg_lead, "Reviewed: GHG & Energy Lead, Dunes Energy", date(YEAR, 12, 14))}</div></div>
"""
    return page(f"LDAR summary {YEAR} {f.short}", body, "#7e57c2", "#4b2a7b", running=f"ClearSight LDAR {YEAR}, {f.short}")


def build_pdfs(f: Facility, folder: Path) -> list[Path]:
    ev = folder / "evidence"
    docs = [
        (folder / f"{f.code}_Cover-Letter_RY{YEAR}.pdf", cover_letter(f), f.submitted, OPERATOR["name"]),
        (folder / f"{f.code}_Monitoring-Plan_Rev{f.mp_rev}.pdf", monitoring_plan(f), f.mp_date, OPERATOR["name"]),
        (folder / f"{f.code}_Verification-Statement_RY{YEAR}.pdf", verification_statement(f), f.verif_date, VERIFIER["name"]),
        (ev / f"{f.code}_Gas-Analysis-Certificate_{YEAR}.pdf", lab_report(f), date(YEAR, 12, 3) if f.flagged else date(YEAR, 11, 28), LAB["name"]),
        (ev / f"{f.code}_Meter-Calibration-Certificates.pdf", calibration_certificates(f), max(i["last"] for i in instruments(f)), CALIB["name"]),
    ]
    if not f.flagged:
        docs.append((ev / f"{f.code}_LDAR-Survey-Summary_{YEAR}.pdf", ldar_summary(f), date(YEAR, 12, 14), LDAR_CONTRACTOR["name"]))
    for out, doc, when, author in docs:
        title = doc.split("<title>", 1)[1].split("</title>", 1)[0]
        render_pdf(doc, out, {"title": title, "author": author, "date": when})
    return [d[0] for d in docs]
