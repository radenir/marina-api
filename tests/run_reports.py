#!/usr/bin/env python3
"""
Marina API — Batch Interview -> Extract -> Seafarer PDF Report Runner
====================================================================
Runs N Marina-mode interviews across languages against a target API, then for
each one calls /ai/extract and /ai/generate-pdf (template='marina') and saves
the filled Marina seafarer PDF plus the structured summary.

Pipeline per scenario (all real HTTP calls to the API):
    1. POST /ai/interview/chat   (no state)  -> greeting + state
    2. loop: Nebius LLM plays patient (stages 1-6) / medical officer (7-9)
             POST /ai/interview/chat (state, message) until done
    3. POST /ai/extract          (conversation) -> summary  (flat seafarer keys)
    4. POST /ai/generate-pdf      (summary, template='marina') -> PDF bytes

Scenarios are reused from run_simple.py (40 multilingual cases); the first N
are run.

Usage:
    python3 tests/run_reports.py [N] [CONCURRENCY]
        N            number of scenarios to run   (default 30)
        CONCURRENCY  parallel interviews          (default 6)

Env (read from ../.env, overridable in shell):
    MARINA_TEST_EMAIL / MARINA_TEST_PASSWORD   login for the API
    NEBIUS_API_KEY                             drives simulated patient + MO
    NEBIUS_BASE_URL / NEBIUS_MODEL             optional Nebius overrides
    TEST_BASE_URL                              API base (default PRODUCTION below)

Output:
    tests/reports/<NN_slug>/report.pdf      filled Marina seafarer PDF
    tests/reports/<NN_slug>/summary.json    /ai/extract summary
    tests/reports/<NN_slug>/transcript.txt  full interview transcript
    tests/reports/manifest.json + .csv      one row per scenario

NOTE: /ai/extract and /ai/generate-pdf are rate-limited to 50/hour per user.
30 runs fit in one batch; re-running within the hour may hit the limit.
"""

import sys, os, json, time, csv, urllib.request, urllib.error, threading
from concurrent.futures import ThreadPoolExecutor, as_completed

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
from run_simple import SCENARIOS  # 40 multilingual Marina scenarios

# ── .env ─────────────────────────────────────────────────────────────────────

def load_env(path):
    cfg = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                cfg[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return cfg

env = {**load_env(os.path.join(SCRIPT_DIR, "..", ".env")), **os.environ}

EMAIL        = env.get("MARINA_TEST_EMAIL", "radomski.adr@gmail.com")
PASSWORD     = env.get("MARINA_TEST_PASSWORD", "Gierek123")
NEBIUS_KEY   = env.get("NEBIUS_API_KEY", "")
NEBIUS_URL   = env.get("NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1")
NEBIUS_MODEL = env.get("NEBIUS_MODEL", "MiniMaxAI/MiniMax-M2.1")
BASE         = env.get("TEST_BASE_URL", "https://api.marinahealth.eu")

REPORTS_DIR  = os.path.join(SCRIPT_DIR, "reports")
MAX_TURNS    = 90          # safety cap per interview
STALL_TURNS  = 30          # bail if stage hasn't advanced in this many turns

RED, GREEN, YELLOW, BLUE, BOLD, NC = (
    "\033[0;31m", "\033[0;32m", "\033[1;33m", "\033[0;34m", "\033[1m", "\033[0m",
)

STAGE_LABELS = {
    1: "Pathway", 2: "History Taking", 3: "Associated Symptoms",
    4: "Past Medical History", 5: "Medications", 6: "Allergies",
    7: "Vital Signs", 8: "Investigations", 9: "Physical Exam",
}

print_lock = threading.Lock()

def log(msg=""):
    with print_lock:
        print(msg, flush=True)

# ── HTTP ─────────────────────────────────────────────────────────────────────

def api_json(path, payload=None, token=None, timeout=120):
    """POST JSON, return (status, parsed_body, seconds)."""
    data = json.dumps(payload).encode() if payload is not None else b""
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method="POST")
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read()), time.monotonic() - t0
    except urllib.error.HTTPError as e:
        try:    body = json.loads(e.read())
        except Exception: body = {"error": str(e)}
        return e.code, body, time.monotonic() - t0
    except Exception as e:
        return 0, {"error": str(e)}, time.monotonic() - t0

def api_pdf(path, payload, token, timeout=180):
    """POST JSON, return (status, pdf_bytes_or_errtext, seconds)."""
    data = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method="POST")
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(), time.monotonic() - t0
    except urllib.error.HTTPError as e:
        return e.code, e.read(), time.monotonic() - t0
    except Exception as e:
        return 0, str(e).encode(), time.monotonic() - t0

# ── Nebius patient / medical-officer responder ───────────────────────────────

def llm_reply(stage, question, scenario):
    # stages 1-6 = patient speaks; stages 7-9 = medical officer speaks
    system = scenario["mo_prompt"] if stage >= 7 else scenario["patient_prompt"]
    payload = {
        "model": NEBIUS_MODEL,
        "temperature": 0.4,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": question},
        ],
    }
    req = urllib.request.Request(
        f"{NEBIUS_URL.rstrip('/')}/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {NEBIUS_KEY}"},
        method="POST",
    )
    fallback = "Yes." if stage < 7 else "No abnormalities found."
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            body = json.loads(r.read())
            content = body["choices"][0]["message"]["content"]
            if isinstance(content, list):
                content = " ".join(b.get("text", "") for b in content if isinstance(b, dict))
            return content.strip() if content else fallback
    except Exception:
        return fallback

# ── Summary -> generate-pdf compatible payload ───────────────────────────────

def coerce_summary(summary):
    """generate-pdf only accepts string|boolean|null values. Stringify numbers,
    drop nested objects/arrays so the request always validates."""
    out = {}
    for k, v in (summary or {}).items():
        if v is None or isinstance(v, (str, bool)):
            out[k] = v
        elif isinstance(v, (int, float)):
            out[k] = str(v)
        # objects/lists are not part of the flat seafarer shape -> skip
    return out

# ── One scenario, end to end ─────────────────────────────────────────────────

def run_one(idx, scenario, token):
    slug    = scenario["name"]
    out_dir = os.path.join(REPORTS_DIR, f"{idx:02d}_{slug}")
    os.makedirs(out_dir, exist_ok=True)
    transcript = []

    def t(line):
        transcript.append(line)

    result = {
        "index": idx, "scenario": slug,
        "patient_language": scenario["p_lang"], "mo_language": scenario["mo_lang"],
        "symptom": scenario["symptom"],
        "completed": False, "turns": 0, "conversationId": None,
        "extract_ok": False, "pdf_ok": False, "pdf_bytes": 0,
        "status": "started", "error": "",
        "dir": os.path.relpath(out_dir, SCRIPT_DIR),
    }

    t(f"# {slug}  ({scenario['p_lang']} patient / {scenario['mo_lang']} MO)")
    t(f"Symptom: {scenario['symptom']}\n")

    # 1. start interview
    code, body, _ = api_json(
        "/ai/interview/chat",
        {"patientLanguage": scenario["p_lang"], "medicalOfficerLanguage": scenario["mo_lang"]},
        token,
    )
    if code != 200:
        result["status"] = f"start_failed_{code}"
        result["error"] = str(body)[:200]
        _flush(out_dir, transcript, result, None)
        return result

    state = body["state"]
    reply = body.get("reply", "")
    t(f"Marina: {reply}")

    # 2. drive to completion
    turn, prev_stage, stall = 0, -1, 0
    while turn < MAX_TURNS:
        turn += 1
        stage = state.get("stage", 1)
        if state.get("done"):
            break
        if stage != prev_stage:
            t(f"\n-- Stage {stage}: {STAGE_LABELS.get(stage, stage)} --")
            prev_stage, stall = stage, 0
        else:
            stall += 1
            if stall > STALL_TURNS:
                result["status"] = "stalled"
                break

        message = llm_reply(stage, reply, scenario)
        role = "MO" if stage >= 7 else "Pt"
        t(f"[{role}] {message}")

        code, resp, _ = api_json("/ai/interview/chat", {"state": state, "message": message}, token)
        if code != 200:
            result["status"] = f"chat_failed_{code}"
            result["error"] = str(resp.get("error", resp))[:200]
            _flush(out_dir, transcript, result, None)
            return result

        state = resp.get("state", state)
        reply = resp.get("reply", "")
        t(f"Marina: {reply}")
        if resp.get("done"):
            state["done"] = True
            break

    result["turns"] = turn
    result["completed"] = bool(state.get("done"))
    if not result["completed"] and result["status"] == "started":
        result["status"] = "incomplete_max_turns"

    # 3. extract  (from interview conversation history -> flat seafarer summary)
    raw = state.get("conversationHistory", [])
    conversation = [
        {"role": m["role"], "content": m["content"]}
        for m in raw
        if m.get("role") in ("user", "assistant")
        and isinstance(m.get("content"), str) and m.get("content")
    ]
    code, body, _ = api_json("/ai/extract", {"conversation": conversation}, token, timeout=180)
    summary = None
    if code == 200:
        summary = body.get("summary", {})
        result["extract_ok"] = True
        result["conversationId"] = body.get("conversationId")
        with open(os.path.join(out_dir, "summary.json"), "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
    else:
        result["status"] = f"extract_failed_{code}"
        result["error"] = str(body)[:200]
        _flush(out_dir, transcript, result, None)
        return result

    # 4. generate Marina seafarer PDF
    code, payload, _ = api_pdf(
        "/ai/generate-pdf",
        {"summary": coerce_summary(summary), "template": "marina"},
        token,
    )
    if code == 200 and payload[:4] == b"%PDF":
        pdf_path = os.path.join(out_dir, "report.pdf")
        with open(pdf_path, "wb") as f:
            f.write(payload)
        result["pdf_ok"] = True
        result["pdf_bytes"] = len(payload)
        result["status"] = "ok" if result["completed"] else "ok_incomplete_interview"
    else:
        result["status"] = f"pdf_failed_{code}"
        result["error"] = payload[:200].decode("utf-8", "replace") if isinstance(payload, bytes) else str(payload)

    _flush(out_dir, transcript, result, summary)
    return result

def _flush(out_dir, transcript, result, summary):
    with open(os.path.join(out_dir, "transcript.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(transcript))
    with open(os.path.join(out_dir, "result.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    # consolidate inputs + outputs into a single plain-text record
    try:
        from consolidate_reports import consolidate
        consolidate(out_dir)
    except Exception:
        pass

# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    n           = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    concurrency = int(sys.argv[2]) if len(sys.argv) > 2 else 6
    n           = min(n, len(SCENARIOS))
    scenarios   = SCENARIOS[:n]
    os.makedirs(REPORTS_DIR, exist_ok=True)

    log(f"\n{BOLD}{BLUE}{'='*60}{NC}")
    log(f"{BOLD}{BLUE}  Marina — Batch Report Runner{NC}")
    log(f"{BOLD}{BLUE}  {n} scenarios · concurrency={concurrency}{NC}")
    log(f"{BOLD}{BLUE}  Target: {BASE}{NC}")
    log(f"{BOLD}{BLUE}{'='*60}{NC}\n")

    if not NEBIUS_KEY:
        log(f"{RED}ERROR: NEBIUS_API_KEY not set (needed to simulate patient/MO).{NC}")
        sys.exit(1)
    if "marinahealth.eu" in BASE:
        log(f"{YELLOW}⚠  Hitting PRODUCTION. extract & generate-pdf are 50/hour each.{NC}\n")

    # login once; the JWT is shared across worker threads
    code, body, _ = api_json("/auth/login", {"email": EMAIL, "password": PASSWORD})
    if code != 200:
        log(f"{RED}Login failed ({code}): {body}{NC}")
        sys.exit(1)
    token = body["access_token"]
    log(f"{GREEN}✓ Logged in as {EMAIL}{NC}\n")

    results = []
    t0 = time.monotonic()
    with ThreadPoolExecutor(max_workers=concurrency) as ex:
        futures = {
            ex.submit(run_one, i + 1, s, token): s["name"]
            for i, s in enumerate(scenarios)
        }
        log(f"  {'#':>2}  {'Scenario':<24}  {'Interview':<11}  {'PDF':<8}  Status")
        log(f"  {'-'*2}  {'-'*24}  {'-'*11}  {'-'*8}  {'-'*20}")
        for fut in as_completed(futures):
            r = fut.result()
            results.append(r)
            iv = f"{GREEN}done{NC}" if r["completed"] else f"{YELLOW}{r['turns']}t{NC}"
            pdf = f"{GREEN}{r['pdf_bytes']//1024}KB{NC}" if r["pdf_ok"] else f"{RED}—{NC}"
            ok = r["pdf_ok"] and r["extract_ok"]
            mark = f"{GREEN}✓{NC}" if ok else f"{RED}✗{NC}"
            log(f"  {r['index']:>2}  {r['scenario']:<24}  {iv:<20}  {pdf:<17}  {mark} {r['status']}")

    results.sort(key=lambda r: r["index"])
    elapsed = time.monotonic() - t0

    # manifest
    with open(os.path.join(REPORTS_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    cols = ["index", "scenario", "patient_language", "mo_language", "completed",
            "turns", "extract_ok", "pdf_ok", "pdf_bytes", "conversationId",
            "status", "dir"]
    with open(os.path.join(REPORTS_DIR, "manifest.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for r in results:
            w.writerow(r)

    pdfs = sum(1 for r in results if r["pdf_ok"])
    done = sum(1 for r in results if r["completed"])
    log(f"\n{BOLD}{BLUE}{'='*60}{NC}")
    log(f"  Interviews completed: {done}/{n}   PDFs generated: {pdfs}/{n}   ({elapsed:.0f}s)")
    log(f"  Reports: tests/reports/<NN_slug>/report.pdf")
    log(f"  Manifest: tests/reports/manifest.csv\n")
    sys.exit(0 if pdfs == n else 1)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log(f"\n{YELLOW}Interrupted.{NC}")
        sys.exit(1)
