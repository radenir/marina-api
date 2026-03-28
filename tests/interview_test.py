#!/usr/bin/env python3
"""
Marina API — Full Interview Walkthrough Test
=============================================
Drives the /ai/interview/chat endpoint through all 9 stages using a Nebius
LLM to generate realistic patient / medical-officer responses, and reports
detailed per-turn diagnostics.

Usage:
    MARINA_TEST_EMAIL=... MARINA_TEST_PASSWORD=... \\
    NEBIUS_API_KEY=...                              \\
    python3 tests/interview_test.py [BASE_URL]

Required env vars:
    MARINA_TEST_EMAIL      verified account email
    MARINA_TEST_PASSWORD   account password
    NEBIUS_API_KEY         Nebius API key (same one used by the server)

Optional env vars:
    MARINA_SYMPTOM         patient's opening complaint (default: chest pain)
    MARINA_PATIENT_LANG    patient language (default: English)
    MARINA_MO_LANG         medical officer language (default: English)
    NEBIUS_BASE_URL        Nebius endpoint (default: https://api.studio.nebius.com/v1)
    NEBIUS_MODEL           model name (default: minimax/MiniMax-Text-01)

Exit codes:
    0  interview completed successfully
    1  interview failed (error, loop, or abort)
    2  missing credentials
"""

import sys
import os
import json
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timedelta

# ─── Config ──────────────────────────────────────────────────────────────────

BASE          = sys.argv[1] if len(sys.argv) > 1 else "https://api.marinahealth.eu"
EMAIL         = os.environ.get("MARINA_TEST_EMAIL", "")
PASSWD        = os.environ.get("MARINA_TEST_PASSWORD", "")
SYMPTOM       = os.environ.get("MARINA_SYMPTOM", "I have chest pain in the center of my chest, it started this morning")
P_LANG        = os.environ.get("MARINA_PATIENT_LANG", "English")
MO_LANG       = os.environ.get("MARINA_MO_LANG", "English")
NEBIUS_KEY    = os.environ.get("NEBIUS_API_KEY", "")
NEBIUS_URL    = os.environ.get("NEBIUS_BASE_URL", "https://api.studio.nebius.com/v1")
NEBIUS_MODEL  = os.environ.get("NEBIUS_MODEL", "minimax/MiniMax-Text-01")

MAX_TURNS_PER_STAGE = 40   # abort if stuck in same stage for this many turns
MAX_TURNS_TOTAL     = 300  # hard cap
TOKEN_REFRESH_SECS  = 12 * 60  # proactively refresh at 12 min (JWT expires at 15)
RESULTS_FILE        = os.path.join(os.path.dirname(__file__), "interview_results.txt")

# ANSI colours
RED    = "\033[0;31m"
GREEN  = "\033[0;32m"
YELLOW = "\033[1;33m"
BLUE   = "\033[0;34m"
BOLD   = "\033[1m"
NC     = "\033[0m"

# ─── State ───────────────────────────────────────────────────────────────────

lines = []

def log(msg=""):
    print(msg)
    lines.append(msg)

def save_results():
    with open(RESULTS_FILE, "w") as f:
        f.write("\n".join(lines) + "\n")

def hdr(title):
    bar = "═" * 52
    log(f"\n{BOLD}{BLUE}{bar}{NC}")
    log(f"{BOLD}{BLUE}  {title}{NC}")
    log(f"{BOLD}{BLUE}{bar}{NC}")

def sec(title):
    log(f"\n{BOLD}── {title} ──{NC}")

# ─── HTTP helpers ─────────────────────────────────────────────────────────────

def api(path, payload=None, token=None, *, method="POST"):
    url = BASE + path
    data = json.dumps(payload).encode() if payload is not None else b""
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        t0 = time.monotonic()
        with urllib.request.urlopen(req, timeout=60) as resp:
            elapsed = time.monotonic() - t0
            body = json.loads(resp.read().decode())
            return resp.status, body, elapsed
    except urllib.error.HTTPError as e:
        elapsed = time.monotonic() - t0
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {"error": str(e)}
        return e.code, body, elapsed
    except Exception as e:
        return 0, {"error": str(e)}, 0.0

# ─── Nebius LLM patient / medical-officer responder ──────────────────────────

# Stages 0–5: the LLM plays the patient.
# Stages 6–8: the LLM plays the medical officer reporting clinical findings.
_PATIENT_SYSTEM = f"""\
You are playing the role of a patient being interviewed on a maritime vessel.
Your background (stay consistent throughout):
- Male, 42 years old
- Chief complaint: {SYMPTOM}
- No known chronic conditions, no regular medications, no known allergies
- Quit smoking 5 years ago, drinks alcohol occasionally
- No previous surgeries or hospitalisations
- Vital signs (for the medical officer stages): O2 sat 98%, HR 78 bpm,
  BP 125/82 mmHg, RR 16, Temp 36.9°C, AVPU Alert

Rules:
- Reply in 1–2 short sentences maximum.
- Answer only the question asked — do not volunteer extra information.
- If asked to confirm a summary, say "yes, that is correct" or "yes, nothing to add".
- Never refuse to answer or break character.
- Do NOT add stage labels, parenthetical notes, or meta-commentary.\
"""

_MO_SYSTEM = f"""\
You are a medical officer on a maritime vessel reporting clinical findings
about your patient (male, 42, chest pain).
Fixed values to report when asked:
  Oxygen saturation: 98%
  Heart rate: 78 bpm
  Blood pressure: 125/82 mmHg
  Respiratory rate: 16 breaths/min
  Temperature: 36.9°C
  AVPU: Alert
  Capillary refill: 2 seconds
  General appearance: mild distress, slightly diaphoretic
  Lung sounds: equal bilaterally, no crackles
  No peripheral oedema, no leg swelling

Rules:
- Reply in 1–2 short sentences maximum.
- Give only the specific value or finding asked about.
- If asked whether you administered any medications: "No, no medications given."
- If asked whether you have anything to add: "No, nothing to add."
- Do NOT diagnose or interpret — just report observations.\
"""


def nebius_respond(stage: int, marina_question: str) -> str:
    """Call the Nebius LLM to generate a realistic short response."""
    system = _MO_SYSTEM if stage >= 6 else _PATIENT_SYSTEM
    payload = {
        "model": NEBIUS_MODEL,
        "max_tokens": 80,
        "temperature": 0.4,
        "messages": [
            {"role": "system",  "content": system},
            {"role": "user",    "content": marina_question},
        ],
    }
    data    = json.dumps(payload).encode()
    headers = {
        "Content-Type":  "application/json",
        "Authorization": f"Bearer {NEBIUS_KEY}",
    }
    req = urllib.request.Request(
        f"{NEBIUS_URL}/chat/completions",
        data=data, headers=headers, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode())
            return body["choices"][0]["message"]["content"].strip()
    except Exception as e:
        # Fall back to a safe generic answer so the interview doesn't abort
        return f"[Nebius error: {e}] no"

# ─── Token management ─────────────────────────────────────────────────────────

class TokenManager:
    def __init__(self, access_token, refresh_token):
        self.access_token  = access_token
        self.refresh_token = refresh_token
        self.issued_at     = time.monotonic()

    def age_seconds(self):
        return time.monotonic() - self.issued_at

    def should_refresh(self):
        return self.age_seconds() > TOKEN_REFRESH_SECS

    def refresh(self):
        code, body, elapsed = api("/auth/refresh", {"refresh_token": self.refresh_token})
        if code == 200:
            self.access_token  = body.get("access_token", self.access_token)
            self.refresh_token = body.get("refresh_token", self.refresh_token)
            self.issued_at     = time.monotonic()
            return True, elapsed
        return False, elapsed

# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    hdr(f"Marina API — Full Interview Test  ({datetime.now().strftime('%Y-%m-%d %H:%M:%S')})")
    log(f"BASE     : {BASE}")
    log(f"SYMPTOM  : {SYMPTOM}")
    log(f"LANG     : patient={P_LANG}  MO={MO_LANG}")
    log(f"MODEL    : {NEBIUS_MODEL}  (patient LLM)")
    log(f"Results  : {RESULTS_FILE}")

    if not EMAIL or not PASSWD:
        log(f"\n{RED}ERROR: Set MARINA_TEST_EMAIL and MARINA_TEST_PASSWORD env vars{NC}")
        save_results()
        sys.exit(2)
    if not NEBIUS_KEY:
        log(f"\n{RED}ERROR: Set NEBIUS_API_KEY env var{NC}")
        save_results()
        sys.exit(2)

    # ── Login ─────────────────────────────────────────────────────────────────
    sec("LOGIN")
    code, body, elapsed = api("/auth/login", {"email": EMAIL, "password": PASSWD})
    if code != 200:
        log(f"{RED}Login failed ({code}): {body}{NC}")
        save_results()
        sys.exit(1)

    tokens = TokenManager(
        access_token  = body["access_token"],
        refresh_token = body.get("refresh_token", ""),
    )
    log(f"  {GREEN}✓ Logged in as {EMAIL}  ({elapsed*1000:.0f}ms){NC}")
    log(f"    Token expires in ~15 min. Refresh threshold: {TOKEN_REFRESH_SECS//60} min.")

    # ── Start interview ────────────────────────────────────────────────────────
    sec("STAGE 0 — PATHWAY  (starting interview)")
    code, body, elapsed = api(
        "/ai/interview/chat",
        {"patientLanguage": P_LANG, "medicalOfficerLanguage": MO_LANG},
        tokens.access_token,
    )
    if code != 200:
        log(f"{RED}Failed to start interview ({code}): {body}{NC}")
        save_results()
        sys.exit(1)

    state   = body["state"]
    reply   = body.get("reply", "")
    log(f"  {GREEN}✓ Interview started{NC}  ({elapsed*1000:.0f}ms)")
    log(f"    Marina: {reply[:120]!r}{'...' if len(reply) > 120 else ''}")

    # ── Per-stage tracking ────────────────────────────────────────────────────
    stage_labels = [
        "Pathway AI", "History Taking AI", "Associated Symptoms AI",
        "Past Medical History AI", "Medications AI", "Allergies AI",
        "Vital Signs AI", "Investigations AI", "Physical Exam AI",
    ]

    total_turns       = 0
    prev_stage        = -1  # sentinel so first turn always resets turns_in_stage
    turns_in_stage    = 0
    stage_start_turn  = 0
    stage_stats       = {}  # stage → {turns, min_body, max_body, errors}

    # Print column header
    log("")
    log(f"  {'Turn':>4}  {'Stage':>5}  {'Label':<24}  {'BodyKB':>7}  {'ms':>6}  Message / Event")
    log("  " + "─"*90)

    def fmt_row(turn, stage, label, body_kb, ms, note):
        stage_col  = f"{stage:>5}"
        label_col  = f"{label:<24}"
        body_col   = f"{body_kb:>6.1f}K"
        ms_col     = f"{ms:>6.0f}"
        return f"  {turn:>4}  {stage_col}  {label_col}  {body_col}  {ms_col}  {note}"

    def body_size_kb(st) -> float:
        return len(json.dumps({"state": st, "message": "x"})) / 1024

    # Track max body size per stage for the summary
    max_body_kb = 0.0

    while total_turns < MAX_TURNS_TOTAL:
        total_turns += 1

        stage        = state.get("stage", 0)
        stage_label  = stage_labels[stage] if stage < len(stage_labels) else f"Stage {stage}"
        done         = state.get("done", False)

        # Detect stage change
        if stage != prev_stage:
            turns_in_stage = 0
            stage_start_turn = total_turns
            sec(f"STAGE {stage} — {stage_label.upper()}")
        else:
            turns_in_stage += 1

        # Record stage stats
        if stage not in stage_stats:
            stage_stats[stage] = {"turns": 0, "max_body_kb": 0.0, "errors": 0}
        stage_stats[stage]["turns"] += 1

        # ── Token refresh ─────────────────────────────────────────────────────
        if tokens.should_refresh():
            ok, rel = tokens.refresh()
            status = f"{GREEN}✓ refreshed{NC}" if ok else f"{RED}✗ FAILED{NC}"
            log(f"  {'':>4}  {'TOKEN':>5}  {'REFRESH':<24}  {'':>7}  {rel*1000:>6.0f}  Token {status} after {tokens.age_seconds()/60:.1f} min")
            if not ok:
                log(f"{RED}Token refresh failed — interview cannot continue{NC}")
                save_results()
                sys.exit(1)

        if done:
            log(fmt_row(total_turns, stage, "DONE", body_size_kb(state), 0, "Interview complete"))
            break

        # ── Build message via Nebius LLM ──────────────────────────────────────
        message = nebius_respond(stage, reply)

        # ── Payload size check ────────────────────────────────────────────────
        payload     = {"state": state, "message": message}
        payload_kb  = len(json.dumps(payload)) / 1024
        max_body_kb = max(max_body_kb, payload_kb)
        stage_stats[stage]["max_body_kb"] = max(stage_stats[stage].get("max_body_kb", 0), payload_kb)

        if payload_kb > 180:
            log(f"{RED}WARNING: payload {payload_kb:.1f}KB approaching 200KB limit!{NC}")
        if payload_kb > 200:
            log(f"{RED}ABORT: payload {payload_kb:.1f}KB exceeds 200KB body limit — would get 413{NC}")
            save_results()
            sys.exit(1)

        # ── API call ──────────────────────────────────────────────────────────
        code, resp_body, elapsed = api("/ai/interview/chat", payload, tokens.access_token)
        ms = elapsed * 1000

        if code != 200:
            stage_stats[stage]["errors"] += 1
            err_msg = resp_body.get("error", str(resp_body))
            log(fmt_row(total_turns, stage, stage_label, payload_kb, ms,
                        f"{RED}HTTP {code}: {err_msg}{NC}"))

            if code == 413:
                log(f"\n{RED}BODY TOO LARGE — payload was {payload_kb:.1f}KB{NC}")
            elif code == 429:
                log(f"\n{RED}RATE LIMIT HIT — too many requests{NC}")
                retry = resp_body.get("retryAfter", "?")
                log(f"  retryAfter: {retry}s")
            elif code == 401:
                log(f"\n{RED}UNAUTHORIZED — access token expired or invalid{NC}")
                log(f"  Token age at failure: {tokens.age_seconds()/60:.1f} min")
            elif code == 403:
                log(f"\n{RED}FORBIDDEN — email not verified or account inactive{NC}")
            elif code == 502:
                log(f"\n{YELLOW}Nebius API unavailable (502) — retrying might work{NC}")

            save_results()
            sys.exit(1)

        # ── Happy path ────────────────────────────────────────────────────────
        new_state  = resp_body.get("state", state)
        new_reply  = resp_body.get("reply", "")
        new_stage  = new_state.get("stage", stage)
        new_done   = resp_body.get("done", False)

        # Stage advancement indicator
        advance = ""
        if new_stage != stage:
            advance = f"  {GREEN}→ stage {new_stage} ({stage_labels[new_stage] if new_stage < len(stage_labels) else '?'}){NC}"

        # Truncate reply for log
        reply_preview = new_reply.replace("\n", " ")[:80]
        if len(new_reply) > 80:
            reply_preview += "..."

        log(fmt_row(total_turns, stage, stage_label, payload_kb, ms, f"{reply_preview!r}"))

        if advance:
            log(f"  {'':>4}  {'':>5}  {'':>24}  {'':>7}  {'':>6}  {advance}")

        # Detect stuck stage
        if turns_in_stage >= MAX_TURNS_PER_STAGE:
            log(f"\n{RED}STUCK in stage {stage} ({stage_label}) for {turns_in_stage} turns without advancing{NC}")
            log(f"  Last Marina reply  : {new_reply[:300]!r}")
            log(f"  Last patient answer: {message!r}")
            log(f"{YELLOW}Diagnosis: Marina is not calling completeStage — possible prompt/model loop{NC}")
            save_results()
            sys.exit(1)

        state  = new_state
        reply  = new_reply
        prev_stage = stage  # track the stage we were in this turn, so next turn detects the change

        if new_done:
            stage_stats[stage]["turns"] += 1
            log(fmt_row(total_turns + 1, new_stage, "DONE", payload_kb, 0, "Interview marked done"))
            if "report" in resp_body:
                log(f"\n{BOLD}── GENERATED REPORT ──{NC}")
                report = resp_body["report"]
                for line in report.split("\n")[:30]:
                    log(f"  {line}")
                if report.count("\n") > 30:
                    log(f"  ... ({report.count(chr(10))} lines total)")
            break

    else:
        log(f"\n{RED}ABORT: reached {MAX_TURNS_TOTAL} total turns without completing{NC}")
        save_results()
        sys.exit(1)

    # ── Summary ───────────────────────────────────────────────────────────────
    hdr("SUMMARY")
    log(f"  Total turns  : {total_turns}")
    log(f"  Max body size: {max_body_kb:.1f} KB  (limit: 200 KB)")
    log(f"  Token age    : {tokens.age_seconds()/60:.1f} min  (expires: 15 min)")
    log("")
    log(f"  {'Stage':>5}  {'Label':<24}  {'Turns':>6}  {'MaxKB':>7}  {'Errors':>7}")
    log("  " + "─"*60)
    for s in sorted(stage_stats):
        ss = stage_stats[s]
        label = stage_labels[s] if s < len(stage_labels) else f"Stage {s}"
        err_col = f"{RED}{ss['errors']}{NC}" if ss["errors"] else "0"
        log(f"  {s:>5}  {label:<24}  {ss['turns']:>6}  {ss['max_body_kb']:>6.1f}K  {err_col:>7}")
    log("")

    if state.get("done"):
        log(f"  {GREEN}{BOLD}RESULT: INTERVIEW COMPLETED SUCCESSFULLY{NC}")
        save_results()
        sys.exit(0)
    else:
        log(f"  {RED}{BOLD}RESULT: INTERVIEW DID NOT COMPLETE{NC}")
        save_results()
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log(f"\n{YELLOW}Interrupted by user{NC}")
        save_results()
        sys.exit(1)
