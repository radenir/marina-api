#!/usr/bin/env python3
"""
Marina API — Audit-grade verification runner.
==============================================
Verifies the interview -> extract -> report pipeline against versioned fixtures
with field-level assertions, captures provenance, and emits machine-readable
evidence (JUnit XML + JSON) plus a requirement traceability matrix.

Unlike run_reports.py (which records "did it run"), this asserts "is the output
correct" — every extracted vital is checked against the known ground truth, and
the report PDF is parsed to confirm the values actually rendered.

Two modes:
  --assert-existing <reports_dir>   verify artifacts already captured (default;
                                    no network, no rate-limit usage)
  --execute                         (reserved) run the pipeline live first

Usage:
    python3 tests/audit/run_audit.py [--assert-existing tests/reports]

Outputs (under tests/audit/results/<run_id>/):
    junit.xml          CI-gating test results, one testcase per assertion
    results.json       full structured results + provenance
    traceability.md    requirement -> cases -> pass/fail matrix
    summary printed to stdout; exit 0 only if every assertion passes
"""

import sys, os, re, json, glob, subprocess, datetime, xml.sax.saxutils as sx

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fixtures import build_fixtures, REQUIREMENTS, VITAL_FIELDS

HARNESS_VERSION = "1.0.0"
RED, GREEN, YELLOW, BLUE, BOLD, NC = (
    "\033[0;31m", "\033[0;32m", "\033[1;33m", "\033[0;34m", "\033[1m", "\033[0m",
)

# ── helpers ──────────────────────────────────────────────────────────────────

def num(v):
    """First numeric token of a value, as float, or None."""
    if v is None:
        return None
    m = re.search(r"-?\d+(?:\.\d+)?", str(v))
    return float(m.group()) if m else None


def pdf_radio_selection(pdf_path, field_name):
    """Semantic selection of a radio field, resolved the way the report encodes it.

    pdf-lib gives radio widgets numeric on-states (/0../n) with the semantic names
    in /Opt; pdftk misreports these as 'Off'. We read /V and map it back through
    /Opt with pypdf so the audit sees what the rendered report actually shows.
    Returns the chosen option name, 'Off' if unselected, or None on error.
    """
    try:
        from pypdf import PdfReader
        reader = PdfReader(pdf_path)
        fields = reader.trailer["/Root"]["/AcroForm"]["/Fields"]

        def find(objs):
            for ref in objs:
                f = ref.get_object()
                if f.get("/T") == field_name:
                    return f
                kids = f.get("/Kids")
                if kids and f.get("/T") is None:
                    hit = find(kids)
                    if hit:
                        return hit
            return None

        fld = find(fields)
        if fld is None:
            return None
        v = fld.get("/V")
        if v is None or str(v) in ("/Off", "Off"):
            return "Off"
        opt = fld.get("/Opt")
        if opt is not None:
            try:
                idx = int(str(v).lstrip("/"))
                names = [str(x).lstrip("/") for x in opt]
                if 0 <= idx < len(names):
                    return names[idx]
            except (ValueError, TypeError):
                pass
        return str(v).lstrip("/")
    except Exception:
        return None


def pdf_field_map(pdf_path):
    """{field_name: value or None} for all AcroForm fields via pdftk."""
    try:
        out = subprocess.run(["pdftk", pdf_path, "dump_data_fields"],
                             capture_output=True, text=True, timeout=60).stdout
    except Exception:
        return {}
    fields, name, val = {}, None, None
    for line in out.splitlines() + ["---"]:
        if line.startswith("FieldName:"):
            if name is not None:
                fields[name] = val
            name, val = line.split(":", 1)[1].strip(), None
        elif line.startswith("FieldValue:"):
            val = line.split(":", 1)[1].strip()
    return fields


def latin_ratio(text):
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return 0.0
    latin = sum(1 for c in letters if "a" <= c.lower() <= "z")
    return latin / len(letters)


def check(checks, cid, req, name, ok, expected, actual, detail=""):
    checks.append({
        "check_id": cid, "requirement": req, "name": name,
        "status": "PASS" if ok else "FAIL",
        "expected": str(expected), "actual": str(actual), "detail": detail,
    })

# ── per-case verification ────────────────────────────────────────────────────

def verify_case(fx, reports_dir):
    case_id = fx["case_id"]
    dirs = glob.glob(os.path.join(reports_dir, f"{fx['index']:02d}_*"))
    checks = []
    if not dirs:
        check(checks, f"{case_id}.ARTIFACT", "REQ-INT-COMPLETE",
              "artifacts present", False, "run folder", "missing")
        return {"case_id": case_id, "fixture": fx, "checks": checks, "dir": None}
    d = dirs[0]
    summary = _json(os.path.join(d, "summary.json")) or {}
    result = _json(os.path.join(d, "result.json")) or {}
    pdf_path = os.path.join(d, "report.pdf")

    # --- structural --------------------------------------------------------
    check(checks, f"{case_id}.INT", "REQ-INT-COMPLETE", "interview completed",
          bool(result.get("completed")), True, result.get("completed"))
    check(checks, f"{case_id}.PDFGEN", "REQ-PDF-GEN", "report PDF generated",
          bool(result.get("pdf_ok")) and _is_pdf(pdf_path), True,
          f"pdf_ok={result.get('pdf_ok')}")

    # --- schema: required clinical fields populated ------------------------
    required = ["chiefComplaint", "history", "pastHistory", "currentMedications",
                "allergies"] + list(VITAL_FIELDS) + ["avpu", "gender"]
    missing = [k for k in required if not summary.get(k)]
    check(checks, f"{case_id}.SCHEMA", "REQ-EXT-SCHEMA",
          "required fields populated", not missing, "all populated",
          f"missing: {missing}" if missing else "all populated")

    # --- vitals: extracted == ground truth (one check per field) -----------
    for field, label in VITAL_FIELDS.items():
        gt = fx["ground_truth"].get(field)
        if gt is None:
            continue
        got = summary.get(field)
        check(checks, f"{case_id}.VITAL.{field}", "REQ-EXT-VITALS",
              f"extracted {label}", num(got) == num(gt), gt, got)

    # --- demographics ------------------------------------------------------
    g_gt = fx["ground_truth"].get("gender")
    if g_gt:
        check(checks, f"{case_id}.GENDER", "REQ-EXT-DEMOG", "extracted gender",
              g_gt in str(summary.get("gender", "")).lower(), g_gt, summary.get("gender"))
    a_gt = fx["ground_truth"].get("avpu")
    if a_gt:
        check(checks, f"{case_id}.AVPU", "REQ-EXT-DEMOG", "extracted AVPU",
              a_gt.lower() in str(summary.get("avpu", "")).lower(), a_gt, summary.get("avpu"))

    # --- chief complaint reflects symptom ----------------------------------
    chief = f"{summary.get('chiefComplaint','')} {summary.get('chiefSymptom','')}".lower()
    hit = next((k for k in fx["expect_chief"] if k in chief), None)
    check(checks, f"{case_id}.CHIEF", "REQ-EXT-CHIEF", "chief complaint matches symptom",
          hit is not None, f"contains one of {fx['expect_chief']}",
          summary.get("chiefComplaint"))

    # --- i18n: non-English interview extracted into English summary --------
    if "REQ-I18N" in fx["requirements"]:
        hist = summary.get("history", "") or ""
        ok = len(hist) > 40 and latin_ratio(hist) > 0.9
        check(checks, f"{case_id}.I18N", "REQ-I18N",
              f"{fx['patient_lang']} extracted to English summary", ok,
              "English narrative present", f"latin={latin_ratio(hist):.2f}, len={len(hist)}")

    # --- PDF fields: structured values actually rendered -------------------
    pf = pdf_field_map(pdf_path)
    gt = fx["ground_truth"]
    pdf_specs = [
        ("heart_rate",    gt.get("circulation_pulse_per_min"),     "PDF heart rate", "eq"),
        ("temperature",   gt.get("expose_temperature_measured_mouth"), "PDF temperature", "eq"),
        ("resp_rate",     gt.get("breathing_num_breaths_per_min"), "PDF respiration", "eq"),
        ("spo2",          gt.get("breathing_oxygen_saturation"),   "PDF SpO2", "eq"),
        ("blood_pressure", f"{gt.get('circulation_systole')}/{gt.get('circulation_diastole')}", "PDF blood pressure", "bp"),
    ]
    for field, expected, label, kind in pdf_specs:
        got = pf.get(field)
        if kind == "eq":
            ok = got is not None and num(got) == num(expected)
        else:  # bp: both numbers present in the field value
            ok = got is not None and str(gt.get("circulation_systole")) in str(got) \
                 and str(gt.get("circulation_diastole")) in str(got)
        check(checks, f"{case_id}.PDF.{field}", "REQ-PDF-FIELDS", label,
              ok, expected, got if got not in (None, "") else "(empty)")
    # radios — resolved through /Opt (asserts the CORRECT option, not just "any")
    g_exp = (gt.get("gender") or "").lower()
    sex_sel = pdf_radio_selection(pdf_path, "sex")
    check(checks, f"{case_id}.PDF.sex", "REQ-PDF-FIELDS", "PDF sex selected",
          bool(g_exp) and (sex_sel or "").lower() == g_exp, g_exp or "selected", sex_sel)
    a_exp = (gt.get("avpu") or "").lower()
    avpu_sel = pdf_radio_selection(pdf_path, "consciousness")
    check(checks, f"{case_id}.PDF.consciousness", "REQ-PDF-FIELDS", "PDF AVPU selected",
          bool(a_exp) and (avpu_sel or "").lower() == a_exp, a_exp or "selected", avpu_sel)

    return {"case_id": case_id, "fixture": fx, "checks": checks, "dir": os.path.basename(d)}


def _json(p):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _is_pdf(p):
    try:
        with open(p, "rb") as f:
            return f.read(4) == b"%PDF"
    except Exception:
        return False

# ── provenance ───────────────────────────────────────────────────────────────

def provenance(reports_dir):
    def git(*a):
        try:
            return subprocess.run(["git", "-C", os.path.join(HERE, "..", ".."), *a],
                                  capture_output=True, text=True, timeout=10).stdout.strip()
        except Exception:
            return "unknown"
    env = {}
    try:
        with open(os.path.join(HERE, "..", "..", ".env")) as f:
            for line in f:
                if line.startswith("NEBIUS_MODEL="):
                    env["sim_model"] = line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return {
        "harness_version": HARNESS_VERSION,
        "run_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "api_git_sha": git("rev-parse", "HEAD"),
        "api_branch": git("rev-parse", "--abbrev-ref", "HEAD"),
        "api_dirty": bool(git("status", "--porcelain")),
        "simulator_model": env.get("sim_model", "unknown"),
        "mode": "assert-existing",
        "evidence_source": os.path.relpath(reports_dir, os.path.join(HERE, "..", "..")),
    }

# ── reporting ────────────────────────────────────────────────────────────────

def write_junit(path, cases, prov):
    total = sum(len(c["checks"]) for c in cases)
    fails = sum(1 for c in cases for k in c["checks"] if k["status"] == "FAIL")
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             f'<testsuites name="marina-audit" tests="{total}" failures="{fails}">']
    for c in cases:
        cf = sum(1 for k in c["checks"] if k["status"] == "FAIL")
        lines.append(f'  <testsuite name="{c["case_id"]}" tests="{len(c["checks"])}" failures="{cf}">')
        for k in c["checks"]:
            nm = sx.quoteattr(f'{k["name"]} [{k["requirement"]}]')
            cls = sx.quoteattr(k["requirement"])
            lines.append(f'    <testcase classname={cls} name={nm}>')
            if k["status"] == "FAIL":
                msg = sx.quoteattr(f'expected={k["expected"]} actual={k["actual"]}')
                lines.append(f'      <failure message={msg}>{sx.escape(k["detail"])}</failure>')
            lines.append('    </testcase>')
        lines.append('  </testsuite>')
    lines.append('</testsuites>')
    open(path, "w").write("\n".join(lines))


def write_traceability(path, cases):
    rollup = {r: {"pass": 0, "fail": 0, "cases_fail": set()} for r in REQUIREMENTS}
    for c in cases:
        for k in c["checks"]:
            r = k["requirement"]
            rollup.setdefault(r, {"pass": 0, "fail": 0, "cases_fail": set()})
            rollup[r]["pass" if k["status"] == "PASS" else "fail"] += 1
            if k["status"] == "FAIL":
                rollup[r]["cases_fail"].add(c["case_id"])
    L = ["# Requirement Traceability Matrix\n",
         "| Requirement | Description | Checks | Pass | Fail | Status | Failing cases |",
         "|---|---|---:|---:|---:|---|---|"]
    for r, desc in REQUIREMENTS.items():
        d = rollup.get(r, {"pass": 0, "fail": 0, "cases_fail": set()})
        tot = d["pass"] + d["fail"]
        st = "✅ PASS" if d["fail"] == 0 and tot > 0 else ("❌ FAIL" if d["fail"] else "— n/a")
        cf = ", ".join(sorted(d["cases_fail"])[:6]) + ("…" if len(d["cases_fail"]) > 6 else "")
        L.append(f"| {r} | {desc} | {tot} | {d['pass']} | {d['fail']} | {st} | {cf} |")
    open(path, "w").write("\n".join(L) + "\n")

# ── main ─────────────────────────────────────────────────────────────────────

def main():
    reports_dir = os.path.join(HERE, "..", "reports")
    if "--assert-existing" in sys.argv:
        i = sys.argv.index("--assert-existing")
        if i + 1 < len(sys.argv):
            reports_dir = sys.argv[i + 1]
    reports_dir = os.path.abspath(reports_dir)

    prov = provenance(reports_dir)
    run_id = "audit-" + prov["run_at_utc"].replace(":", "").replace("-", "")[:15]
    out_dir = os.path.join(HERE, "results", run_id)
    os.makedirs(out_dir, exist_ok=True)

    print(f"\n{BOLD}{BLUE}{'='*64}{NC}")
    print(f"{BOLD}{BLUE}  Marina — Audit Verification (harness v{HARNESS_VERSION}){NC}")
    print(f"{BOLD}{BLUE}{'='*64}{NC}")
    print(f"  API commit : {prov['api_git_sha'][:12]} ({prov['api_branch']}){' DIRTY' if prov['api_dirty'] else ''}")
    print(f"  Evidence   : {prov['evidence_source']}")
    print(f"  Simulator  : {prov['simulator_model']}")
    print(f"  Run id     : {run_id}\n")

    cases = [verify_case(fx, reports_dir) for fx in build_fixtures()]

    print(f"  {'Case':<12}{'Lang':<22}{'Checks':>8}{'Fail':>6}  Result")
    print(f"  {'-'*12}{'-'*22}{'-'*8}{'-'*6}  {'-'*18}")
    tot_checks = tot_fail = 0
    for c in cases:
        nf = sum(1 for k in c["checks"] if k["status"] == "FAIL")
        tot_checks += len(c["checks"]); tot_fail += nf
        lang = f"{c['fixture']['patient_lang']}->{c['fixture']['mo_lang']}"
        mark = f"{GREEN}PASS{NC}" if nf == 0 else f"{RED}{nf} FAIL{NC}"
        print(f"  {c['case_id']:<12}{lang:<22}{len(c['checks']):>8}{nf:>6}  {mark}")

    write_junit(os.path.join(out_dir, "junit.xml"), cases, prov)
    write_traceability(os.path.join(out_dir, "traceability.md"), cases)
    json.dump({"provenance": prov, "cases": cases},
              open(os.path.join(out_dir, "results.json"), "w"),
              ensure_ascii=False, indent=2, default=str)

    # per-requirement rollup to console
    rollup = {}
    for c in cases:
        for k in c["checks"]:
            r = rollup.setdefault(k["requirement"], [0, 0])
            r[0] += k["status"] == "PASS"; r[1] += k["status"] == "FAIL"
    print(f"\n  {BOLD}Requirement rollup:{NC}")
    for r, (p, fl) in rollup.items():
        st = f"{GREEN}PASS{NC}" if fl == 0 else f"{RED}FAIL ({fl}){NC}"
        print(f"    {r:<20} {p:>3} pass {fl:>3} fail   {st}")

    cases_pass = sum(1 for c in cases if all(k["status"] == "PASS" for k in c["checks"]))
    print(f"\n{BOLD}{BLUE}{'='*64}{NC}")
    print(f"  Cases fully passing: {cases_pass}/{len(cases)}   "
          f"Assertions: {tot_checks-tot_fail}/{tot_checks} pass, {tot_fail} fail")
    print(f"  Evidence written to: {os.path.relpath(out_dir, os.path.join(HERE,'..','..'))}/")
    print(f"    junit.xml · results.json · traceability.md\n")
    sys.exit(0 if tot_fail == 0 else 1)


if __name__ == "__main__":
    main()
