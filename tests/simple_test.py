#!/usr/bin/env python3
"""
Marina API — Simple Single-Scenario Interview Test
====================================================
Reads credentials from ../.env automatically. No env vars required.

Usage:
    python3 tests/simple_test.py

Scenario: chest pain, Khmer patient, English medical officer (khmer_chest_kh_en)
"""

import sys, os, json, time, urllib.request, urllib.error

# ── Load .env ──────────────────────────────────────────────────────────────────

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

ENV_FILE = os.path.join(os.path.dirname(__file__), "..", ".env")
env = load_env(ENV_FILE)

EMAIL        = env.get("MARINA_TEST_EMAIL", "radomski.adr@gmail.com")
PASSWORD     = env.get("MARINA_TEST_PASSWORD", "Gierek123")
NEBIUS_KEY   = env.get("NEBIUS_API_KEY", "")
NEBIUS_URL   = env.get("NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1")
NEBIUS_MODEL = env.get("NEBIUS_MODEL", "MiniMaxAI/MiniMax-M2.1")
BASE         = "https://api.marinahealth.eu"

# ── Scenario (override via MARINA_SCENARIO env var as JSON) ───────────────────
_sc_json = os.environ.get("MARINA_SCENARIO", "")
if _sc_json:
    _sc            = json.loads(_sc_json)
    SYMPTOM        = _sc["symptom"]
    P_LANG         = _sc["p_lang"]
    MO_LANG        = _sc["mo_lang"]
    PATIENT_PROMPT = _sc["patient_prompt"]
    MO_PROMPT      = _sc["mo_prompt"]
    SCENARIO_NAME  = _sc.get("name", "custom")
else:
    SYMPTOM       = "ខ្ញុំមានការឈឺចាប់ខ្លាំងនៅក្នុងទ្រូង និងពិបាកដកដង្ហើម តាំងពីព្រឹកនេះ"
    P_LANG        = "Khmer"
    MO_LANG       = "English"
    SCENARIO_NAME = "khmer_chest_kh_en"
    PATIENT_PROMPT = f"""You are a patient on a maritime vessel.
Male, 42 years old. Chief complaint: {SYMPTOM}
No chronic conditions, no medications, no allergies. Non-smoker.
Vital signs: O2 96%, HR 98, BP 140/90, RR 18, Temp 36.8°C, AVPU Alert.
Rules: reply in 1-2 short sentences in Khmer. Answer only what is asked. Never break character."""
    MO_PROMPT = """You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 42, chest pain and difficulty breathing since morning.
Fixed values to report when asked:
  O2 saturation: 96%, HR: 98 bpm, BP: 140/90 mmHg, RR: 18 breaths/min, Temp: 36.8°C, AVPU: Alert
  General appearance: alert, mild distress, clutching chest, breath sounds reduced at left base.
Rules: reply in 1-2 short sentences in English. Give only the specific value or finding asked. No diagnoses."""

MAX_TURNS = 150

# ── Colours ────────────────────────────────────────────────────────────────────
RED, GREEN, YELLOW, BLUE, BOLD, NC = (
    "\033[0;31m", "\033[0;32m", "\033[1;33m",
    "\033[0;34m", "\033[1m",    "\033[0m",
)

def p(msg=""):
    print(msg, flush=True)

# ── Stage labels (state.stage is 1–9; maps to STAGES[stage-1]) ─────────────────
# stage 1  = Pathway          (patient)
# stage 2  = History Taking   (patient)
# stage 3  = Associated Symptoms (patient)
# stage 4  = Past Medical History (patient)
# stage 5  = Medications      (patient)
# stage 6  = Allergies        (patient)
# stage 7  = Vital Signs      (medical officer)
# stage 8  = Investigations   (medical officer)
# stage 9  = Physical Exam    (medical officer)
STAGE_LABELS = {
    1: "Pathway",
    2: "History Taking",
    3: "Associated Symptoms",
    4: "Past Medical History",
    5: "Medications",
    6: "Allergies",
    7: "Vital Signs",
    8: "Investigations",
    9: "Physical Exam",
}

# ── HTTP helper ────────────────────────────────────────────────────────────────

def api(path, payload=None, token=None):
    data = json.dumps(payload).encode() if payload is not None else b""
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method="POST")
    try:
        t0 = time.monotonic()
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read()), time.monotonic() - t0
    except urllib.error.HTTPError as e:
        t0 = time.monotonic()
        try:    body = json.loads(e.read())
        except: body = {"error": str(e)}
        return e.code, body, time.monotonic() - t0
    except Exception as e:
        return 0, {"error": str(e)}, 0.0

# ── Nebius LLM responder ───────────────────────────────────────────────────────

def llm_reply(stage, question):
    # Stages 1-6 = patient; stages 7-9 = medical officer
    system = MO_PROMPT if stage >= 7 else PATIENT_PROMPT
    payload = {
        "model": NEBIUS_MODEL,
        "temperature": 0.4,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": [{"type": "text", "text": question}]},
        ],
    }
    req = urllib.request.Request(
        f"{NEBIUS_URL}/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {NEBIUS_KEY}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = json.loads(r.read())
            content = body["choices"][0]["message"]["content"]
            if isinstance(content, list):
                content = " ".join(b.get("text", "") for b in content if isinstance(b, dict))
            if not content:
                finish = body["choices"][0].get("finish_reason", "unknown")
                p(f"  {YELLOW}[LLM empty content, finish_reason={finish} — using fallback]{NC}")
                return "Yes." if stage < 7 else "No abnormalities found."
            return content.strip()
    except urllib.error.HTTPError as e:
        p(f"  {YELLOW}[LLM HTTP {e.code} — using fallback]{NC}")
        return "Yes." if stage < 7 else "No abnormalities found."
    except Exception as e:
        p(f"  {YELLOW}[LLM error: {e} — using fallback]{NC}")
        return "Yes." if stage < 7 else "No abnormalities found."

# ── Extract ────────────────────────────────────────────────────────────────────

def run_extract(state, token):
    raw = state.get("conversationHistory", [])
    conversation = [
        {"role": m["role"], "content": m["content"]}
        for m in raw
        if m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str)
    ]
    p(f"\n{BOLD}{BLUE}── Extract ──{NC}")
    p(f"  Calling /ai/extract with {len(conversation)} messages (filtered from {len(raw)})...")

    code, body, ms = api("/ai/extract", {"conversation": conversation}, token)

    if code != 200:
        p(f"  {RED}Extract failed ({code}): {body}{NC}")
        return

    summary = body.get("summary", {})
    p(f"  {GREEN}✓ Done  ({ms*1000:.0f}ms){NC}\n")

    for key, val in summary.items():
        if val not in (None, "", False, []):
            p(f"  {BOLD}{key}{NC}: {val}")

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    p(f"\n{BOLD}{BLUE}{'═'*60}{NC}")
    p(f"{BOLD}{BLUE}  Marina Interview Test — {P_LANG} patient / {MO_LANG} MO{NC}")
    p(f"{BOLD}{BLUE}  {BASE}{NC}")
    p(f"{BOLD}{BLUE}{'═'*60}{NC}\n")
    p(f"  Scenario: {SCENARIO_NAME}")
    p(f"  Email  : {EMAIL}")
    p(f"  Model  : {NEBIUS_MODEL}")
    p(f"  Symptom: {SYMPTOM}\n")

    if not NEBIUS_KEY:
        p(f"{RED}ERROR: NEBIUS_API_KEY not found in .env{NC}")
        sys.exit(1)

    # ── Login ────────────────────────────────────────────────────────────────
    p(f"{BOLD}── Login ──{NC}")
    code, body, ms = api("/auth/login", {"email": EMAIL, "password": PASSWORD})
    if code != 200:
        p(f"{RED}Login failed ({code}): {body}{NC}")
        sys.exit(1)
    access  = body["access_token"]
    refresh = body.get("refresh_token", "")
    p(f"  {GREEN}✓ Logged in  ({ms*1000:.0f}ms){NC}")

    # ── Start interview (= Stage 1: Pathway) ─────────────────────────────────
    code, body, ms = api(
        "/ai/interview/chat",
        {"patientLanguage": P_LANG, "medicalOfficerLanguage": MO_LANG},
        access,
    )
    if code != 200:
        p(f"{RED}Failed to start ({code}): {body}{NC}")
        sys.exit(1)

    state   = body["state"]
    reply   = body.get("reply", "")
    p(f"  {GREEN}✓ Ready  ({ms*1000:.0f}ms){NC}\n")

    turn       = 0
    prev_stage = -1
    token_time = time.monotonic()

    while turn < MAX_TURNS:
        turn += 1
        stage = state.get("stage", 1)
        done  = state.get("done", False)
        label = STAGE_LABELS.get(stage, f"Stage {stage}")

        if stage != prev_stage:
            p(f"\n{BOLD}{BLUE}── Stage {stage}: {label} ──{NC}")
            # On first stage, show the greeting before the patient speaks
            if prev_stage == -1:
                p(f"  Marina: {reply}")
            prev_stage = stage

        if done:
            p(f"\n  {GREEN}{BOLD}Interview complete after {turn - 1} turns.{NC}")
            break

        # Proactive token refresh at 12 min
        if time.monotonic() - token_time > 720:
            code, rbody, rms = api("/auth/refresh", {"refresh_token": refresh})
            if code == 200:
                access      = rbody.get("access_token", access)
                refresh     = rbody.get("refresh_token", refresh)
                token_time  = time.monotonic()
                p(f"  {YELLOW}[token refreshed]{NC}")
            else:
                p(f"{RED}Token refresh failed{NC}")
                sys.exit(1)

        # Generate patient / MO response via LLM
        message = llm_reply(stage, reply)

        # Show patient/MO message FIRST, then call API, then show Marina's reply
        role = "MO" if stage >= 7 else "Pt"
        p(f"  {YELLOW}[{role}] {message}{NC}")

        # Call the API
        code, resp, ms = api("/ai/interview/chat", {"state": state, "message": message}, access)

        if code != 200:
            p(f"  {RED}HTTP {code}: {resp.get('error', resp)}{NC}")
            if 'details' in resp:
                p(f"  {RED}Details: {json.dumps(resp['details'], indent=2)}{NC}")
            sys.exit(1)

        new_state = resp.get("state", state)
        new_reply = resp.get("reply", "")
        new_stage = new_state.get("stage", stage)
        new_done  = resp.get("done", False)

        adv = f"  {GREEN}→ stage {new_stage} ({STAGE_LABELS.get(new_stage, '?')}){NC}" if new_stage != stage else ""

        p(f"  {BOLD}[{turn}] {ms*1000:.0f}ms{NC}  Marina: {new_reply}{adv}")

        state = new_state
        reply = new_reply

        if new_done:
            p(f"\n  {GREEN}{BOLD}Interview complete after {turn} turns.{NC}")
            run_extract(new_state, access)
            break
    else:
        p(f"{RED}Reached {MAX_TURNS} turns without completing.{NC}")
        sys.exit(1)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        p(f"\n{YELLOW}Interrupted.{NC}")
        sys.exit(1)
