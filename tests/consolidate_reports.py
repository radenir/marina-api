#!/usr/bin/env python3
"""
Marina — Consolidate each report run into plain-text files.
===========================================================
For every tests/reports/<dir>/ produced by run_reports.py, writes:

    report.txt       single human-readable record: scenario personas (INPUT),
                     full interview transcript (INPUT), extracted summary
                     (/ai/extract OUTPUT), and the filled PDF field values
                     (generate-pdf OUTPUT).
    report_pdf.txt   literal text rendering of report.pdf (via pdftotext).

Safe to run repeatedly and while run_reports.py is still going (it only reads
artifacts that are already on disk). Used both as a post-step and a backfill.

Usage:
    python3 tests/consolidate_reports.py [reports_dir]
"""

import sys, os, json, subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
try:
    from run_simple import SCENARIOS
    BY_NAME = {s["name"]: s for s in SCENARIOS}
except Exception:
    BY_NAME = {}

REPORTS_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(SCRIPT_DIR, "reports")


def pdf_fields(pdf_path):
    """Return [(field, value), ...] of non-empty filled fields via pdftk."""
    try:
        out = subprocess.run(
            ["pdftk", pdf_path, "dump_data_fields"],
            capture_output=True, text=True, timeout=60,
        ).stdout
    except Exception:
        return []
    fields, name, val = [], None, None
    for line in out.splitlines():
        if line.startswith("FieldName:"):
            name = line.split(":", 1)[1].strip()
        elif line.startswith("FieldValue:"):
            val = line.split(":", 1)[1].strip()
        elif line.startswith("---"):
            if name and val:
                fields.append((name, val))
            name = val = None
    if name and val:
        fields.append((name, val))
    return fields


def pdf_to_text(pdf_path, out_path):
    try:
        subprocess.run(["pdftotext", "-layout", pdf_path, out_path],
                       capture_output=True, timeout=60)
        return os.path.exists(out_path)
    except Exception:
        return False


def consolidate(run_dir):
    name = os.path.basename(run_dir).split("_", 1)[1] if "_" in os.path.basename(run_dir) else os.path.basename(run_dir)
    scenario = BY_NAME.get(name, {})

    transcript = _read(os.path.join(run_dir, "transcript.txt"))
    summary = _read_json(os.path.join(run_dir, "summary.json"))
    result = _read_json(os.path.join(run_dir, "result.json"))
    pdf_path = os.path.join(run_dir, "report.pdf")

    L = []
    L.append("=" * 70)
    L.append(f" MARINA SEAFARER REPORT — full text record")
    L.append(f" Scenario : {name}")
    if scenario:
        L.append(f" Languages: {scenario.get('p_lang','?')} patient / {scenario.get('mo_lang','?')} medical officer")
    if result:
        L.append(f" Status   : {result.get('status','?')}  "
                 f"(interview {'complete' if result.get('completed') else 'incomplete'}, "
                 f"{result.get('turns','?')} turns, conversationId={result.get('conversationId')})")
    L.append("=" * 70)

    # INPUT — scenario personas
    if scenario:
        L.append("\n#################### INPUT — scenario personas ####################\n")
        L.append(f"Chief symptom (opening line): {scenario.get('symptom','')}\n")
        L.append("[Patient persona prompt]")
        L.append(scenario.get("patient_prompt", "") + "\n")
        L.append("[Medical officer persona prompt]")
        L.append(scenario.get("mo_prompt", "") + "\n")

    # INPUT — interview transcript
    L.append("\n#################### INPUT — interview transcript ####################\n")
    L.append(transcript or "(no transcript saved)")

    # OUTPUT — extracted summary
    L.append("\n\n#################### OUTPUT — /ai/extract summary ####################\n")
    if summary:
        filled = {k: v for k, v in summary.items() if v not in (None, "", False, [])}
        L.append(f"({len(filled)} of {len(summary)} fields populated)\n")
        for k, v in summary.items():
            if v not in (None, "", False, []):
                L.append(f"  {k}: {v}")
    else:
        L.append("(no summary.json)")

    # OUTPUT — filled PDF fields
    L.append("\n\n#################### OUTPUT — generated PDF report fields ####################\n")
    if os.path.exists(pdf_path):
        fields = pdf_fields(pdf_path)
        if fields:
            L.append(f"({len(fields)} filled form fields in report.pdf)\n")
            for fn, fv in fields:
                L.append(f"  {fn}: {fv}")
        else:
            L.append("(no fillable field values read; see report_pdf.txt for rendered text)")
        pdf_to_text(pdf_path, os.path.join(run_dir, "report_pdf.txt"))
    else:
        L.append("(no report.pdf generated for this run)")

    with open(os.path.join(run_dir, "report.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    return os.path.exists(pdf_path)


def _read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except Exception:
        return ""


def _read_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def main():
    if not os.path.isdir(REPORTS_DIR):
        print(f"No reports dir: {REPORTS_DIR}")
        sys.exit(1)
    dirs = sorted(
        os.path.join(REPORTS_DIR, d) for d in os.listdir(REPORTS_DIR)
        if os.path.isdir(os.path.join(REPORTS_DIR, d))
    )
    n = 0
    for d in dirs:
        if os.path.exists(os.path.join(d, "transcript.txt")) or os.path.exists(os.path.join(d, "report.pdf")):
            consolidate(d)
            n += 1
            print(f"  ✓ {os.path.basename(d)}/report.txt")
    print(f"\nConsolidated {n} run(s) into report.txt + report_pdf.txt")


if __name__ == "__main__":
    main()
