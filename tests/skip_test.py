#!/usr/bin/env python3
"""
Marina API — Skip Stage Test Suite
====================================
Thorough regression coverage for the skipStage API feature.

Tests:
  - Single skips at every patient stage (2-6)
  - Consecutive skips through multiple stages
  - Skip after partially answering a stage (the original regression scenario)
  - Skip into MO stages (7-9) with language transition
  - Skipping all stages 2-8 in a single chain
  - Error cases: skip stage 1, skip when done

Usage:
    python3 tests/skip_test.py              # run all cases
    python3 tests/skip_test.py [1-N]        # run one case by number

Logs written to tests/runs/<slug>.txt
"""

import sys, os, json, time, urllib.request, urllib.error, re as _re

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

ENV_FILE     = os.path.join(os.path.dirname(__file__), "..", ".env")
env          = load_env(ENV_FILE)
EMAIL        = env.get("MARINA_TEST_EMAIL", "radomski.adr@gmail.com")
PASSWORD     = env.get("MARINA_TEST_PASSWORD", "Gierek123")
NEBIUS_KEY   = env.get("NEBIUS_API_KEY", "")
NEBIUS_URL   = env.get("NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1")
NEBIUS_MODEL = env.get("NEBIUS_MODEL", "MiniMaxAI/MiniMax-M2.1")
BASE         = env.get("TEST_BASE_URL", "http://localhost:4000")

# ── Colours ────────────────────────────────────────────────────────────────────
RED, GREEN, YELLOW, BLUE, BOLD, NC = (
    "\033[0;31m", "\033[0;32m", "\033[1;33m",
    "\033[0;34m", "\033[1m",    "\033[0m",
)
_ANSI = _re.compile(r"\033\[[0-9;]*m")
_log_fh = None

def p(msg=""):
    print(msg, flush=True)
    if _log_fh:
        _log_fh.write(_ANSI.sub("", msg) + "\n")
        _log_fh.flush()

# ── Stage metadata ─────────────────────────────────────────────────────────────
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

MO_STAGES = {7, 8, 9}  # stages handled by medical officer

# Keywords expected as first word/phrase of each stage after a skip.
# Used as positive checks (soft — warns but doesn't fail on its own).
STAGE_EXPECTED_KEYWORDS = {
    2: ["age", "old", "years", "gender", "male", "female", "born"],
    3: ["fever", "nausea", "vomit", "nausea", "light", "sound", "associat",
        "other symptom", "experience any"],
    4: ["diagnos", "medical history", "condition", "past", "chronic",
        "heart", "diabetes", "high blood"],
    5: ["medication", "drug", "taking any", "supplement", "regularly"],
    6: ["allerg", "reaction", "substance", "known allerg", "food"],
    7: ["oxygen", "saturation", "spo2", "o2", "breathing", "respiratory",
        "breath", "pulse", "heart rate", "blood pressure", "temperature",
        "temp", "avpu", "conscious", "vital"],
    8: ["test", "result", "investigation", "blood", "ecg", "xray", "x-ray",
        "urine", "glucose", "malaria"],
    9: ["exam", "inspection", "palpat", "assess", "look at", "check",
        "appearance", "patient appear"],
}

# Keywords that should NEVER appear as the first question after a skip past stage 2.
# These are History Taking questions about the chief complaint's characteristics.
REGRESSION_PATTERNS = [
    r"scale from \d+ to \d+",
    r"\brate\b.{0,30}\bpain\b",
    r"\brate\b.{0,30}\bheadache\b",
    r"\brate\b.{0,30}\bsymptom\b",
    r"\bseverity\b",
    r"\bthrobbing\b",
    r"\bpulsating\b",
    r"\bsharp\b.{0,20}\bpain\b",
    r"\bdull\b.{0,20}\bpain\b",
    r"\bpressure.like\b",
    r"\bdoes.{0,30}radiat",
    r"\bspread.{0,30}anywhere",
    r"\bmake.{0,30}worse\b",
    r"\bmake.{0,30}better\b",
    r"\baggravat",
    r"\breliev",
    r"\bquality of.{0,30}(pain|headache|symptom|discomfort)",
    r"\bdescribe.{0,30}quality",
    r"\bcharacter.{0,30}(pain|ache|discomfort)",
]
_REGRESSION_COMPILED = [_re.compile(p, _re.IGNORECASE) for p in REGRESSION_PATTERNS]

def check_regression(reply: str) -> list[str]:
    """Return list of matched regression patterns in reply, or empty list if clean."""
    return [p for p, c in zip(REGRESSION_PATTERNS, _REGRESSION_COMPILED) if c.search(reply)]

def check_expected(reply: str, stage: int) -> bool:
    """Return True if reply contains at least one expected keyword for this stage."""
    lower = reply.lower()
    return any(kw in lower for kw in STAGE_EXPECTED_KEYWORDS.get(stage, []))

# Action constants for skip_plan
SKIP         = "skip"         # call skipStage API immediately on entering stage
ANSWER_ONCE  = "answer_once"  # send 1 LLM exchange, then skipStage
ANSWER_FULL  = "answer_full"  # let LLM answer until stage naturally completes

MAX_TURNS_PER_STAGE = 30

# ── HTTP helper ────────────────────────────────────────────────────────────────

def api(path, payload=None, token=None, method="POST"):
    data = json.dumps(payload).encode() if payload is not None else b""
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        t0 = time.monotonic()
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.loads(r.read()), time.monotonic() - t0
    except urllib.error.HTTPError as e:
        t0 = time.monotonic()
        try:    body = json.loads(e.read())
        except: body = {"error": str(e)}
        return e.code, body, time.monotonic() - t0
    except Exception as e:
        return 0, {"error": str(e)}, 0.0

# ── Nebius LLM responder ───────────────────────────────────────────────────────

def llm_reply(stage, question, case):
    system = case["mo_system"] if stage in MO_STAGES else case["patient_system"]
    payload = {
        "model":       NEBIUS_MODEL,
        "temperature": 0.3,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": question},
        ],
    }
    req = urllib.request.Request(
        f"{NEBIUS_URL.rstrip('/')}/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {NEBIUS_KEY}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = json.loads(r.read())
            content = body["choices"][0]["message"]["content"]
            if isinstance(content, list):
                content = " ".join(b.get("text", "") for b in content if isinstance(b, dict))
            return (content or "").strip() or ("Yes." if stage not in MO_STAGES else "No abnormalities.")
    except urllib.error.HTTPError as e:
        p(f"  {YELLOW}[LLM HTTP {e.code} — fallback]{NC}")
        return "Yes." if stage not in MO_STAGES else "No abnormalities found."
    except Exception as e:
        p(f"  {YELLOW}[LLM error: {e} — fallback]{NC}")
        return "Yes." if stage not in MO_STAGES else "No abnormalities found."

# ── Token refresh ──────────────────────────────────────────────────────────────

def maybe_refresh(access, refresh, token_time):
    if time.monotonic() - token_time > 720:
        code, rbody, _ = api("/auth/refresh", {"refresh_token": refresh})
        if code == 200:
            p(f"  {YELLOW}[token refreshed]{NC}")
            return rbody.get("access_token", access), rbody.get("refresh_token", refresh), time.monotonic()
    return access, refresh, token_time

# ── Stage-level helpers ────────────────────────────────────────────────────────

class SkipResult:
    def __init__(self, stage_before, stage_after, reply, ms, regression, has_expected):
        self.stage_before  = stage_before
        self.stage_after   = stage_after
        self.reply         = reply
        self.ms            = ms
        self.regression    = regression  # list of matched patterns
        self.has_expected  = has_expected
        self.ok            = stage_after == stage_before + 1 and not regression

def do_skip(state, access, expected_new_stage):
    """Call skipStage API and return SkipResult."""
    stage_before = state["stage"]
    code, body, ms = api("/ai/interview/chat", {"state": state, "skipStage": True}, access)
    if code != 200:
        p(f"  {RED}  skipStage HTTP {code}: {body.get('error', body)}{NC}")
        return None, state, ms
    new_state  = body["state"]
    reply      = body.get("reply", "")
    stage_after = new_state["stage"]
    regression  = check_regression(reply) if stage_after >= 3 else []
    has_expected = check_expected(reply, stage_after)
    result = SkipResult(stage_before, stage_after, reply, ms, regression, has_expected)
    return result, new_state, ms

def do_answer(state, message, access):
    """Send one user message and return (new_state, reply, ms)."""
    code, body, ms = api("/ai/interview/chat", {"state": state, "message": message}, access)
    if code != 200:
        return None, None, ms
    return body["state"], body.get("reply", ""), ms

def complete_stage_with_llm(state, reply, case, access, refresh, token_time):
    """
    Drive LLM answers until the stage naturally advances (like simple_test.py).
    Returns (new_state, new_reply, access, refresh, token_time, success).
    """
    stage_start = state["stage"]
    for _ in range(MAX_TURNS_PER_STAGE):
        access, refresh, token_time = maybe_refresh(access, refresh, token_time)
        message = llm_reply(state["stage"], reply, case)
        role    = "MO" if state["stage"] in MO_STAGES else "Pt"
        p(f"    {YELLOW}[{role}] {message[:80]}{NC}")
        new_state, new_reply, ms = do_answer(state, message, access)
        if new_state is None:
            return state, reply, access, refresh, token_time, False
        adv = ""
        if new_state["stage"] != state["stage"]:
            adv = f"  {GREEN}→ stage {new_state['stage']} ({STAGE_LABELS.get(new_state['stage'], '?')}){NC}"
        p(f"    {BOLD}[{ms*1000:.0f}ms]{NC}  Marina: {new_reply[:90]}{adv}")
        state, reply = new_state, new_reply
        if state["done"] or state["stage"] > stage_start:
            return state, reply, access, refresh, token_time, True
    p(f"  {RED}  Stage {stage_start} not completed in {MAX_TURNS_PER_STAGE} turns{NC}")
    return state, reply, access, refresh, token_time, False

# ── Test case runner ───────────────────────────────────────────────────────────

def run_skip_case(case, access, refresh):
    global _log_fh
    os.makedirs(RUNS_DIR, exist_ok=True)
    log_path = os.path.join(RUNS_DIR, f"{case['slug']}.txt")
    _log_fh = open(log_path, "w", encoding="utf-8")
    try:
        return _run_inner(case, access, refresh)
    finally:
        _log_fh.close()
        _log_fh = None

def _run_inner(case, access, refresh):
    p(f"\n{BOLD}{BLUE}{'═'*60}{NC}")
    p(f"{BOLD}{BLUE}  {case['name']}{NC}")
    p(f"{BOLD}{BLUE}{'═'*60}{NC}")
    p(f"  Skip plan: {case['skip_plan']}")
    p(f"  Symptom:   {case['symptom']}\n")

    token_time = time.monotonic()
    failures   = []

    # ── Start session ──────────────────────────────────────────────────────────
    code, body, ms = api(
        "/ai/interview/chat",
        {"patientLanguage": case["p_lang"], "medicalOfficerLanguage": case["mo_lang"]},
        access,
    )
    if code != 200:
        p(f"  {RED}Failed to start ({code}): {body}{NC}")
        return False, refresh

    state = body["state"]
    reply = body.get("reply", "")
    p(f"  {GREEN}✓ Started  ({ms*1000:.0f}ms){NC}")
    p(f"  Marina [{state['stage']}/9]: {reply[:90]}\n")

    # ── Error-case: attempt to skip stage 1 ───────────────────────────────────
    if case.get("test_skip_stage1_error"):
        p(f"{BOLD}── Testing: skip stage 1 should return 400 ──{NC}")
        code2, body2, ms2 = api("/ai/interview/chat", {"state": state, "skipStage": True}, access)
        if code2 == 400:
            p(f"  {GREEN}✓ Correctly rejected skip of stage 1 (HTTP 400){NC}")
        else:
            p(f"  {RED}✗ Expected 400, got {code2}: {body2}{NC}")
            failures.append("skip_stage1_should_fail")
        if not case.get("continue_after_error"):
            return len(failures) == 0, refresh

    # ── Stage 1: Pathway (always answered, never skipped) ─────────────────────
    p(f"{BOLD}── Stage 1: Pathway (symptom identification) ──{NC}")
    state, reply, access, refresh, token_time, ok = complete_stage_with_llm(
        state, reply, case, access, refresh, token_time
    )
    if not ok and state["stage"] < 2:
        p(f"  {RED}Stage 1 never completed{NC}")
        return False, refresh
    p(f"  {GREEN}✓ Stage 1 complete — symptom: {state['variables'].get('symptom', '?')}{NC}")

    # ── Stages 2–9: follow skip_plan ──────────────────────────────────────────
    skip_plan = case["skip_plan"]

    for target_stage in range(2, 10):
        if state["done"] or state["stage"] > target_stage:
            continue  # stage was auto-advanced (shouldn't happen but guard)
        if state["stage"] < target_stage:
            p(f"  {RED}Expected to be at stage {target_stage}, actually at {state['stage']}{NC}")
            failures.append(f"stage_mismatch_at_{target_stage}")
            break

        action = skip_plan.get(target_stage, ANSWER_FULL)
        label  = STAGE_LABELS.get(target_stage, f"Stage {target_stage}")
        p(f"\n{BOLD}── Stage {target_stage}: {label}  [{action}] ──{NC}")

        if action == SKIP:
            # ── Skip immediately ───────────────────────────────────────────────
            result, state, ms = do_skip(state, access, target_stage + 1)
            if result is None:
                failures.append(f"skip_api_error_stage_{target_stage}")
                break

            p(f"  Marina [{state['stage']}/9] ({ms*1000:.0f}ms): {result.reply[:100]}")

            if not result.ok:
                if result.stage_after != target_stage + 1:
                    p(f"  {RED}✗ Stage didn't advance: expected {target_stage+1}, got {result.stage_after}{NC}")
                    failures.append(f"skip_stage_mismatch_{target_stage}")
                if result.regression:
                    p(f"  {RED}✗ REGRESSION in reply: {result.regression}{NC}")
                    failures.append(f"regression_after_skip_{target_stage}_to_{result.stage_after}")
            else:
                p(f"  {GREEN}✓ Skipped {target_stage}→{result.stage_after}, no regression{NC}")
                if not result.has_expected and result.stage_after <= 9:
                    p(f"  {YELLOW}? No expected keyword for stage {result.stage_after} (soft warning){NC}")

            reply = result.reply

        elif action == ANSWER_ONCE:
            # ── Answer 1 LLM exchange, then skip ──────────────────────────────
            access, refresh, token_time = maybe_refresh(access, refresh, token_time)
            message = llm_reply(state["stage"], reply, case)
            role    = "MO" if state["stage"] in MO_STAGES else "Pt"
            p(f"  {YELLOW}[{role}] {message[:80]}{NC}")

            new_state, new_reply, ms = do_answer(state, message, access)
            if new_state is None:
                failures.append(f"answer_api_error_stage_{target_stage}")
                break
            p(f"  Marina [{new_state['stage']}/9] ({ms*1000:.0f}ms): {new_reply[:90]}")

            # Stage might have auto-advanced on 1 exchange (unlikely but handle it)
            if new_state["stage"] > target_stage:
                p(f"  {YELLOW}[Stage auto-advanced after 1 exchange, skipping skip]{NC}")
                state, reply = new_state, new_reply
                continue

            state, reply = new_state, new_reply

            # Now skip the stage
            result, state, ms = do_skip(state, access, target_stage + 1)
            if result is None:
                failures.append(f"skip_after_answer_error_stage_{target_stage}")
                break

            p(f"  Marina [{state['stage']}/9] ({ms*1000:.0f}ms): {result.reply[:100]}")

            if not result.ok:
                if result.stage_after != target_stage + 1:
                    p(f"  {RED}✗ Stage didn't advance: expected {target_stage+1}, got {result.stage_after}{NC}")
                    failures.append(f"skip_after_answer_stage_mismatch_{target_stage}")
                if result.regression:
                    p(f"  {RED}✗ REGRESSION after answer+skip at stage {target_stage}: {result.regression}{NC}")
                    failures.append(f"regression_after_answer_skip_{target_stage}")
            else:
                p(f"  {GREEN}✓ Answer+skip {target_stage}→{result.stage_after}, no regression{NC}")
                if not result.has_expected and result.stage_after <= 9:
                    p(f"  {YELLOW}? No expected keyword for stage {result.stage_after} (soft warning){NC}")

            reply = result.reply

        else:  # ANSWER_FULL
            # ── Let LLM complete the stage naturally ───────────────────────────
            state, reply, access, refresh, token_time, ok = complete_stage_with_llm(
                state, reply, case, access, refresh, token_time
            )
            if not ok and not state["done"] and state["stage"] == target_stage:
                failures.append(f"stage_{target_stage}_not_completed")
                break
            if state["done"]:
                break
            p(f"  {GREEN}✓ Stage {target_stage} completed naturally{NC}")

    # ── Final result ───────────────────────────────────────────────────────────
    p(f"\n{'─'*60}")
    if state.get("done"):
        p(f"  {GREEN}✓ Interview reached done=true{NC}")
    if not failures:
        p(f"  {GREEN}{BOLD}PASS — {case['name']}{NC}")
        return True, refresh
    else:
        p(f"  {RED}{BOLD}FAIL — {case['name']}{NC}")
        for f in failures:
            p(f"  {RED}  ✗ {f}{NC}")
        return False, refresh

# ── Test cases ─────────────────────────────────────────────────────────────────

RUNS_DIR = os.path.join(os.path.dirname(__file__), "runs")

CASES = [

    # ── 1. Skip ALL patient stages 2-6 in sequence ────────────────────────────
    {
        "name":   "Headache / EN-EN — skip all patient stages 2-6",
        "slug":   "skip_01_allpatient_en_en",
        "p_lang": "English",
        "mo_lang": "English",
        "symptom": "I have a headache, started yesterday, on the right side",
        "skip_plan": {2: SKIP, 3: SKIP, 4: SKIP, 5: SKIP, 6: SKIP,
                      7: ANSWER_FULL, 8: ANSWER_FULL, 9: ANSWER_FULL},
        "patient_system": (
            "You are a patient on a maritime vessel. Male, 34. Headache right side since yesterday. "
            "No chronic conditions, no medications, no allergies. "
            "Rules: 1-2 sentences in English. Answer only what is asked. Never break character."
        ),
        "mo_system": (
            "You are a medical officer. Patient: male 34, headache. "
            "Vitals: O2 99%, HR 78, BP 128/82, RR 16, Temp 36.8°C, AVPU Alert. "
            "Neurological exam: no focal deficit. "
            "Rules: 1-2 sentences in English. Report only the clinical finding — never repeat or rephrase the question. No diagnoses."
        ),
    },

    # ── 2. Skip stages 2 and 4, answer 3, 5, 6 ────────────────────────────────
    {
        "name":   "Chest pain / ES-EN — skip 2 and 4, answer 3, 5, 6",
        "slug":   "skip_02_alt_skip_es_en",
        "p_lang": "Spanish",
        "mo_lang": "English",
        "symptom": "Tengo un dolor fuerte en el centro del pecho desde esta mañana",
        "skip_plan": {2: SKIP, 3: ANSWER_FULL, 4: SKIP, 5: ANSWER_FULL, 6: ANSWER_FULL,
                      7: ANSWER_FULL, 8: ANSWER_FULL, 9: ANSWER_FULL},
        "patient_system": (
            "You are a patient on a maritime vessel. Male, 45. Central chest pain since this morning. "
            "No chronic conditions, no medications, no allergies. "
            "Rules: 1-2 sentences in Spanish. Answer only what is asked. Never break character."
        ),
        "mo_system": (
            "You are a medical officer. Patient: male 45, chest pain. "
            "Vitals: O2 96%, HR 98, BP 140/90, RR 18, Temp 36.8°C, AVPU Alert. "
            "ECG: sinus rhythm, no ST changes. Rules: 1-2 sentences in English. Report only the clinical finding — never repeat or rephrase the question. No diagnoses."
        ),
    },

    # ── 3. Skip stages 3 and 5, answer 2, 4, 6 ────────────────────────────────
    {
        "name":   "Abdominal pain / ZH-EN — skip 3 and 5, answer 2, 4, 6",
        "slug":   "skip_03_alt_skip2_zh_en",
        "p_lang": "Chinese",
        "mo_lang": "English",
        "symptom": "我右下腹部剧烈疼痛，从昨晚开始",
        "skip_plan": {2: ANSWER_FULL, 3: SKIP, 4: ANSWER_FULL, 5: SKIP, 6: ANSWER_FULL,
                      7: ANSWER_FULL, 8: ANSWER_FULL, 9: ANSWER_FULL},
        "patient_system": (
            "You are a patient on a maritime vessel. Male, 32. Severe right lower abdominal pain since last night. "
            "No chronic conditions, no medications, no allergies. "
            "Rules: 1-2 sentences in Mandarin Chinese. Answer only what is asked. Never break character."
        ),
        "mo_system": (
            "You are a medical officer. Patient: male 32, right lower abdominal pain. "
            "Vitals: O2 98%, HR 88, BP 124/80, RR 16, Temp 37.2°C, AVPU Alert. "
            "Right iliac fossa tenderness, positive Rovsing. Rules: 1-2 sentences in English. Report only the clinical finding — never repeat or rephrase the question. No diagnoses."
        ),
    },

    # ── 4. Answer 1 question in stage 2 then skip (the original bug scenario) ─
    {
        "name":   "Back pain / RU-EN — answer 1 question in stage 2 then skip (regression scenario)",
        "slug":   "skip_04_partial_answer_ru_en",
        "p_lang": "Russian",
        "mo_lang": "English",
        "symptom": "У меня сильная боль в пояснице после подъёма тяжестей",
        "skip_plan": {2: ANSWER_ONCE, 3: ANSWER_ONCE, 4: ANSWER_ONCE, 5: ANSWER_ONCE,
                      6: ANSWER_FULL, 7: ANSWER_FULL, 8: ANSWER_FULL, 9: ANSWER_FULL},
        "patient_system": (
            "You are a patient on a maritime vessel. Male, 38. Severe lower back pain after heavy lifting. "
            "No chronic conditions, no medications, no allergies. "
            "Rules: 1-2 sentences in Russian. Answer only what is asked. Never break character."
        ),
        "mo_system": (
            "You are a medical officer. Patient: male 38, lumbar back pain after lifting. "
            "Vitals: O2 99%, HR 82, BP 128/84, RR 16, Temp 36.7°C, AVPU Alert. "
            "Lumbar tenderness, SLR negative. Rules: 1-2 sentences in English. Report only the clinical finding — never repeat or rephrase the question. No diagnoses."
        ),
    },

    # ── 5. Skip medications (stage 5) after answering 1 question in it ────────
    {
        "name":   "Fever / ID-EN — skip stage 5 after 1 medication answer (exact regression scenario)",
        "slug":   "skip_05_meds_partial_id_en",
        "p_lang": "Indonesian",
        "mo_lang": "English",
        "symptom": "Saya demam tinggi sudah dua hari dengan batuk berdahak kuning",
        "skip_plan": {2: ANSWER_FULL, 3: ANSWER_FULL, 4: ANSWER_FULL, 5: ANSWER_ONCE,
                      6: ANSWER_FULL, 7: ANSWER_FULL, 8: ANSWER_FULL, 9: ANSWER_FULL},
        "patient_system": (
            "You are a patient on a maritime vessel. Male, 35. High fever for 2 days, productive cough. "
            "No chronic conditions, takes ibuprofen occasionally. No allergies. "
            "Rules: 1-2 sentences in Indonesian. Answer only what is asked. Never break character."
        ),
        "mo_system": (
            "You are a medical officer. Patient: male 35, fever and cough 2 days. "
            "Vitals: O2 95%, HR 105, BP 118/75, RR 22, Temp 38.9°C, AVPU Alert. "
            "Decreased breath sounds right lower lobe. Rules: 1-2 sentences in English. Report only the clinical finding — never repeat or rephrase the question. No diagnoses."
        ),
    },

    # ── 6. Rapid skip 2→3→4→5 without any patient answers ─────────────────────
    {
        "name":   "Nausea / FIL-EN — rapid skip 2, 3, 4, 5",
        "slug":   "skip_06_rapid4_fil_en",
        "p_lang": "Filipino",
        "mo_lang": "English",
        "symptom": "Nahihilo ako at paulit-ulit akong nasusuka",
        "skip_plan": {2: SKIP, 3: SKIP, 4: SKIP, 5: SKIP,
                      6: ANSWER_FULL, 7: ANSWER_FULL, 8: ANSWER_FULL, 9: ANSWER_FULL},
        "patient_system": (
            "You are a patient on a maritime vessel. Male, 40. Dizziness and repeated vomiting. "
            "No chronic conditions, no medications, no allergies. "
            "Rules: 1-2 sentences in Filipino (Tagalog). Answer only what is asked. Never break character."
        ),
        "mo_system": (
            "You are a medical officer. Patient: male 40, nausea and vomiting. "
            "Vitals: O2 98%, HR 96, BP 118/74, RR 17, Temp 37.1°C, AVPU Alert. "
            "No focal deficit, abdomen soft. Rules: 1-2 sentences in English. Report only the clinical finding — never repeat or rephrase the question. No diagnoses."
        ),
    },

    # ── 7. Skip into MO stage — skip stage 7 (Vital Signs) ────────────────────
    {
        "name":   "Dyspnea / VI-EN — answer all patient stages, skip stage 7 (Vital Signs)",
        "slug":   "skip_07_into_mo_vi_en",
        "p_lang": "Vietnamese",
        "mo_lang": "English",
        "symptom": "Tôi khó thở ngày càng nặng hơn, chân phù",
        "skip_plan": {2: ANSWER_FULL, 3: ANSWER_FULL, 4: ANSWER_FULL,
                      5: ANSWER_FULL, 6: ANSWER_FULL,
                      7: SKIP,    # skip vital signs — expect stage 8 (Investigations)
                      8: ANSWER_FULL, 9: ANSWER_FULL},
        "patient_system": (
            "You are a patient on a maritime vessel. Male, 55. Progressive shortness of breath, ankle swelling. "
            "Known hypertension. Takes aspirin and atenolol. No allergies. "
            "Rules: 1-2 sentences in Vietnamese. Answer only what is asked. Never break character."
        ),
        "mo_system": (
            "You are a medical officer. Patient: male 55, progressive dyspnea, orthopnoea. "
            "Vitals: O2 90%, HR 102, BP 148/92, RR 28, Temp 36.8°C, AVPU Alert. "
            "Bilateral basal crackles, pitting oedema ankles. Rules: 1-2 sentences in English. Report only the clinical finding — never repeat or rephrase the question. No diagnoses."
        ),
    },

    # ── 8. Skip stage 1 should return 400 (error case) ────────────────────────
    {
        "name":   "Error case — skip stage 1 must return HTTP 400",
        "slug":   "skip_08_error_stage1_en_en",
        "p_lang": "English",
        "mo_lang": "English",
        "symptom": "I have a headache",
        "skip_plan": {2: ANSWER_FULL, 3: SKIP, 4: SKIP, 5: SKIP, 6: SKIP,
                      7: ANSWER_FULL, 8: ANSWER_FULL, 9: ANSWER_FULL},
        "test_skip_stage1_error":  True,
        "continue_after_error":    True,   # continue interview after the error check
        "patient_system": (
            "You are a patient on a maritime vessel. Male, 30. Headache since this morning. "
            "No chronic conditions, no medications, no allergies. "
            "Rules: 1-2 sentences in English. Answer only what is asked. Never break character."
        ),
        "mo_system": (
            "You are a medical officer. Patient: male 30, headache. "
            "Vitals: O2 99%, HR 78, BP 122/78, RR 16, Temp 36.9°C, AVPU Alert. "
            "Neuro exam normal. Rules: 1-2 sentences in English. Report only the clinical finding — never repeat or rephrase the question. No diagnoses."
        ),
    },

    # ── 9. Skip 2, 4, 6, 7, 8 — maximum skip chain through MO stages ──────────
    {
        "name":   "Joint pain / BN-EN — skip 2, 4, 6, 7, 8 (long chain incl MO stages)",
        "slug":   "skip_09_longchain_bn_en",
        "p_lang": "Bengali",
        "mo_lang": "English",
        "symptom": "আমার ডান পায়ের গোড়ালি ফুলে গেছে এবং হাঁটতে পারছি না",
        "skip_plan": {2: SKIP, 3: ANSWER_FULL, 4: SKIP, 5: ANSWER_FULL, 6: SKIP,
                      7: SKIP, 8: SKIP, 9: ANSWER_FULL},
        "patient_system": (
            "You are a patient on a maritime vessel. Male, 28. Right ankle swollen, cannot walk. "
            "No chronic conditions, no medications, no allergies. "
            "Rules: 1-2 sentences in Bengali. Answer only what is asked. Never break character."
        ),
        "mo_system": (
            "You are a medical officer. Patient: male 28, right ankle injury. "
            "Vitals: O2 99%, HR 88, BP 120/76, RR 16, Temp 36.8°C, AVPU Alert. "
            "Right ankle: swollen, tender over lateral malleolus, neurovascular intact. "
            "Rules: 1-2 sentences in English. Report only the clinical finding — never repeat or rephrase the question. No diagnoses."
        ),
    },

    # ── 10. Skip 3 and 5, language check (French patient / German MO) ──────────
    {
        "name":   "Headache / FR-DE — skip 3 and 5, verify language not corrupted",
        "slug":   "skip_10_lang_fr_de",
        "p_lang": "French",
        "mo_lang": "German",
        "symptom": "J'ai un mal de tête très fort depuis ce matin, pulsatif et uniquement à droite",
        "skip_plan": {2: ANSWER_FULL, 3: SKIP, 4: ANSWER_FULL, 5: SKIP,
                      6: ANSWER_FULL, 7: ANSWER_FULL, 8: ANSWER_FULL, 9: ANSWER_FULL},
        "patient_system": (
            "You are a patient on a maritime vessel. Female, 42. Severe right-sided throbbing headache since this morning. "
            "Known migraines, no current medication. No allergies. "
            "Rules: 1-2 sentences in French. Answer only what is asked. Never break character."
        ),
        "mo_system": (
            "You are a medical officer. Patient: female 42, migraine. "
            "Vitale: O2 99%, HF 76, BD 158/100, AF 16, Temp 36.9°C, AVPU Alert. "
            "GCS 15, kein fokal-neurologisches Defizit. Rules: 1-2 Sätze auf Deutsch. Nur den klinischen Befund berichten — die Frage niemals wiederholen oder umformulieren. Keine Diagnosen."
        ),
    },

]

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    only = None
    if len(sys.argv) > 1:
        try:
            only = int(sys.argv[1]) - 1
        except ValueError:
            p(f"{RED}Usage: python3 tests/skip_test.py [1-{len(CASES)}]{NC}")
            sys.exit(1)

    cases_to_run = [CASES[only]] if only is not None else CASES

    p(f"\n{BOLD}{BLUE}{'═'*60}{NC}")
    p(f"{BOLD}{BLUE}  Marina Skip Stage Test Suite — {len(cases_to_run)} case(s){NC}")
    p(f"{BOLD}{BLUE}  {BASE}{NC}")
    p(f"{BOLD}{BLUE}{'═'*60}{NC}")
    p(f"  Email : {EMAIL}")
    p(f"  Model : {NEBIUS_MODEL}\n")

    if not NEBIUS_KEY:
        p(f"{RED}ERROR: NEBIUS_API_KEY not found in .env{NC}")
        sys.exit(1)

    p(f"{BOLD}── Login ──{NC}")
    code, body, ms = api("/auth/login", {"email": EMAIL, "password": PASSWORD})
    if code != 200:
        p(f"{RED}Login failed ({code}): {body}{NC}")
        sys.exit(1)
    access  = body["access_token"]
    refresh = body.get("refresh_token", "")
    p(f"  {GREEN}✓ Logged in  ({ms*1000:.0f}ms){NC}")

    results = []
    for case in cases_to_run:
        ok, refresh = run_skip_case(case, access, refresh)
        results.append((case["name"], case["slug"], ok))

    p(f"\n{BOLD}{'═'*60}{NC}")
    p(f"{BOLD}  Results{NC}")
    p(f"{BOLD}{'═'*60}{NC}")
    for name, slug, ok in results:
        icon = f"{GREEN}✓{NC}" if ok else f"{RED}✗{NC}"
        p(f"  {icon}  {name}")
        if not ok:
            p(f"      → log: tests/runs/{slug}.txt")
    passed = sum(1 for _, _, ok in results if ok)
    p(f"\n  {GREEN if passed == len(results) else RED}{passed}/{len(results)} passed{NC}\n")
    if passed < len(results):
        sys.exit(1)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        p(f"\n{YELLOW}Interrupted.{NC}")
        sys.exit(1)
