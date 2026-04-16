#!/usr/bin/env python3
"""
Marina API — Concurrent Simple-Test Runner
==========================================
Runs multiple scenarios in parallel using simple_test.py.

Usage:
    python3 tests/run_simple.py [CONCURRENCY]

Default concurrency: 30
Results written to tests/runs/<name>.txt
"""

import sys, os, json, subprocess, time, threading
from concurrent.futures import ThreadPoolExecutor, as_completed

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
RUNS_DIR    = os.environ.get("MARINA_RUNS_DIR") or os.path.join(SCRIPT_DIR, "runs")
SIMPLE_TEST = os.path.join(SCRIPT_DIR, "simple_test.py")

RED, GREEN, YELLOW, BLUE, BOLD, NC = (
    "\033[0;31m", "\033[0;32m", "\033[1;33m",
    "\033[0;34m", "\033[1m",    "\033[0m",
)

# ── Scenario builder ──────────────────────────────────────────────────────────

def sc(name, symptom, p_lang, mo_lang, patient_desc, mo_desc, vitals):
    patient_prompt = (
        f"You are a patient on a maritime vessel.\n"
        f"{patient_desc}. Chief complaint: {symptom}\n"
        f"No chronic conditions, no medications, no allergies. Non-smoker.\n"
        f"Vital signs: {vitals}.\n"
        f"Rules: reply in 1-2 short sentences in {p_lang}. Answer only what is asked. Never break character."
    )
    mo_prompt = (
        f"You are a medical officer on a maritime vessel reporting clinical findings. {mo_desc}.\n"
        f"Fixed values to report when asked:\n"
        f"  {vitals}.\n"
        f"  General appearance: alert, mild distress.\n"
        f"Rules: reply in 1-2 short sentences in {mo_lang}. Give only the specific value or finding asked. No diagnoses."
    )
    return {"name": name, "symptom": symptom, "p_lang": p_lang, "mo_lang": mo_lang,
            "patient_prompt": patient_prompt, "mo_prompt": mo_prompt}

# ── Scenario list (mirrors run_all_scenarios.sh) ──────────────────────────────

SCENARIOS = [
    sc("01_chest_en_en",   "I have chest pain in the center of my chest, it started this morning",
       "English",    "English",   "Male, 45", "Patient: male, 45, chest pain since morning",
       "O2 96%, HR 98, BP 140/90, RR 18, Temp 36.8°C, AVPU Alert"),
    sc("01_chest_fil_en",  "Masakit ang dibdib ko, parang may pumipiga, nagsimula kahapon",
       "Filipino",   "English",   "Male, 38", "Patient: male, 38, chest pain since yesterday",
       "O2 97%, HR 92, BP 135/85, RR 17, Temp 36.7°C, AVPU Alert"),
    sc("01_chest_fil_fil", "Masakit ang dibdib ko, parang may pumipiga, nagsimula kahapon",
       "Filipino",   "Filipino",  "Male, 38", "Patient: male, 38, chest pain since yesterday",
       "O2 97%, HR 92, BP 135/85, RR 17, Temp 36.7°C, AVPU Alert"),
    sc("02_abdomen_es_en", "Tengo un dolor abdominal muy fuerte en la parte inferior derecha desde ayer",
       "Spanish",    "English",   "Male, 42", "Patient: male, 42, right lower abdominal pain since yesterday",
       "O2 98%, HR 85, BP 128/80, RR 16, Temp 37.2°C, AVPU Alert"),
    sc("02_fever_id_en",   "Saya demam tinggi sudah dua hari dan batuk tidak berhenti dengan dahak kuning",
       "Indonesian", "English",   "Male, 35", "Patient: male, 35, high fever and productive cough for 2 days",
       "O2 95%, HR 105, BP 118/75, RR 22, Temp 38.9°C, AVPU Alert"),
    sc("02_fever_id_no",   "Saya demam tinggi sudah tiga hari dan batuk berdahak kuning",
       "Indonesian", "Norwegian", "Male, 35", "Patient: male, 35, high fever and cough for 3 days",
       "O2 95%, HR 105, BP 118/75, RR 22, Temp 39.1°C, AVPU Alert"),
    sc("03_headache_fr_fr","J'ai une tres forte migraine, la pire de ma vie, elle a commence il y a deux heures",
       "French",     "French",    "Male, 40", "Patient: male, 40, severe headache for 2 hours",
       "O2 99%, HR 88, BP 150/95, RR 16, Temp 36.9°C, AVPU Alert"),
    sc("03_headache_hi_da","Mujhe bahut tej sar dard ho raha hai aur aankhon ke saamne andhera aa raha hai",
       "Hindi",      "Danish",    "Male, 32", "Patient: male, 32, severe headache with visual disturbance",
       "O2 99%, HR 90, BP 148/92, RR 16, Temp 36.7°C, AVPU Alert"),
    sc("03_headache_hi_en","Mujhe bahut tej sar dard ho raha hai aur aankhon ke saamne andhera aa raha hai",
       "Hindi",      "English",   "Male, 32", "Patient: male, 32, severe headache with visual disturbance",
       "O2 99%, HR 90, BP 148/92, RR 16, Temp 36.7°C, AVPU Alert"),
    sc("04_abdomen_zh_en", "我的腹部右下方非常疼痛，从昨晚开始，走路也很困难",
       "Chinese",    "English",   "Male, 42", "Patient: male, 42, right lower abdominal pain since last night",
       "O2 98%, HR 88, BP 126/82, RR 16, Temp 36.9°C, AVPU Alert"),
    sc("04_abdomen_zh_sv", "我右下腹部剧烈疼痛，从昨晚开始，走路很困难",
       "Chinese",    "Swedish",   "Male, 42", "Patient: male, 42, right lower abdominal pain since last night",
       "O2 98%, HR 88, BP 126/82, RR 16, Temp 36.9°C, AVPU Alert"),
    sc("04_fever_pt_en",   "Tenho febre de 39 graus ha dois dias com tosse produtiva e muco amarelo",
       "Portuguese", "English",   "Male, 48", "Patient: male, 48, fever 39°C for 2 days with productive cough",
       "O2 94%, HR 108, BP 120/76, RR 24, Temp 39.1°C, AVPU Alert"),
    sc("05_backpain_pl_pl","Mam ostry bol w dolnej czesci plecow po podniesieniu ciezkiego sprzetu",
       "Polish",     "Polish",    "Male, 38", "Patient: male, 38, lower back pain after lifting heavy equipment",
       "O2 99%, HR 82, BP 128/84, RR 16, Temp 36.7°C, AVPU Alert"),
    sc("05_backpain_ua_pl","У мене сильний біль у попереку після того як я підняв важке обладнання",
       "Ukrainian",  "Polish",    "Male, 38", "Patient: male, 38, lower back pain after lifting heavy equipment",
       "O2 99%, HR 82, BP 128/84, RR 16, Temp 36.7°C, AVPU Alert"),
    sc("05_backpain_ua_ua","У мене сильний біль у попереку після того, як я підняв важке обладнання",
       "Ukrainian",  "Ukrainian", "Male, 38", "Patient: male, 38, lower back pain after lifting heavy equipment",
       "O2 99%, HR 82, BP 128/84, RR 16, Temp 36.7°C, AVPU Alert"),
    sc("06_chest_ro_en",   "Am durere puternică în piept și mă simt foarte slăbit de dimineață",
       "Romanian",   "English",   "Male, 45", "Patient: male, 45, chest pain and weakness since morning",
       "O2 96%, HR 95, BP 138/90, RR 18, Temp 36.8°C, AVPU Alert"),
    sc("06_dizzy_ro_fr",   "Am amețeli severe și greață, mă simt că se învârte totul în jurul meu",
       "Romanian",   "French",    "Male, 52", "Patient: male, 52, severe dizziness and nausea",
       "O2 97%, HR 88, BP 130/85, RR 17, Temp 36.6°C, AVPU Alert"),
    sc("06_dyspnea_de_de", "Ich habe seit einer Stunde starke Atemnot, die sich beim Hinlegen verschlimmert",
       "German",     "German",    "Male, 50", "Patient: male, 50, severe dyspnea worsening when lying down",
       "O2 93%, HR 102, BP 145/92, RR 22, Temp 36.9°C, AVPU Alert"),
    sc("07_knee_gr_en",    "Έχω έντονο πόνο στο γόνατο μετά από πτώση στο κατάστρωμα πριν από μία ώρα",
       "Greek",      "English",   "Male, 33", "Patient: male, 33, knee pain after falling on deck",
       "O2 99%, HR 90, BP 122/78, RR 16, Temp 36.7°C, AVPU Alert"),
    sc("07_knee_gr_it",    "Έπεσα στο κατάστρωμα και έχω έντονο πόνο στο γόνατο",
       "Greek",      "Italian",   "Male, 33", "Patient: male, 33, knee pain after falling on deck",
       "O2 99%, HR 90, BP 122/78, RR 16, Temp 36.7°C, AVPU Alert"),
    sc("07_nausea_it_en",  "Ho vomitato per 6 ore e mi sento molto nauseato, non riesco a tenere niente nello stomaco",
       "Italian",    "English",   "Male, 55", "Patient: male, 55, vomiting for 6 hours",
       "O2 98%, HR 96, BP 118/74, RR 17, Temp 37.1°C, AVPU Alert"),
    sc("08_redeye_en_ar",  "I have a very red and painful eye with discharge since this morning, I can barely open it",
       "English",    "Arabic",    "Male, 30", "Patient: male, 30, red painful eye with discharge since morning",
       "O2 99%, HR 78, BP 122/80, RR 15, Temp 36.8°C, AVPU Alert"),
    sc("08_redeye_tr_en",  "Sabahtan beri sol gözüm çok kırmızı ve yanıyor, göremiyorum iyi",
       "Turkish",    "English",   "Male, 30", "Patient: male, 30, red painful left eye since morning",
       "O2 99%, HR 78, BP 122/80, RR 15, Temp 36.8°C, AVPU Alert"),
    sc("08_redeye_tr_nl",  "Sol gözüm sabahtan beri çok kırmızı ve yanıyor, göremiyorum iyi",
       "Turkish",    "Dutch",     "Male, 30", "Patient: male, 30, red painful left eye since morning",
       "O2 99%, HR 78, BP 122/80, RR 15, Temp 36.8°C, AVPU Alert"),
    sc("09_breath_bn_ru",  "আমার বুকে ব্যথা এবং শ্বাস নিতে অনেক কষ্ট হচ্ছে",
       "Bengali",    "Russian",   "Male, 44", "Patient: male, 44, chest pain and difficulty breathing",
       "O2 94%, HR 100, BP 138/88, RR 22, Temp 36.9°C, AVPU Alert"),
    sc("09_chest_bn_en",   "আমার বুকে খুব ব্যথা করছে এবং শ্বাস নিতে কষ্ট হচ্ছে",
       "Bengali",    "English",   "Male, 44", "Patient: male, 44, severe chest pain and breathing difficulty",
       "O2 94%, HR 100, BP 138/88, RR 22, Temp 36.9°C, AVPU Alert"),
    sc("09_trauma_en_ru",  "My knee is very swollen and painful after I slipped and fell on the wet deck an hour ago",
       "English",    "Russian",   "Male, 28", "Patient: male, 28, knee trauma after slipping on wet deck",
       "O2 99%, HR 88, BP 120/78, RR 16, Temp 36.7°C, AVPU Alert"),
    sc("10_abdomen_my_en", "ငါ့ဗိုက်ထဲမှာ အရမ်းနာတယ်၊ အော့အန်နေတယ်",
       "Burmese",    "English",   "Male, 40", "Patient: male, 40, severe abdominal pain and vomiting",
       "O2 97%, HR 95, BP 122/78, RR 18, Temp 37.3°C, AVPU Alert"),
    sc("10_fever_fil_en",  "Mayroon akong matinding sakit ng ulo at nanginginig ako, malamig ang katawan ko ngayon",
       "Filipino",   "English",   "Male, 35", "Patient: male, 35, severe headache with chills",
       "O2 97%, HR 102, BP 115/72, RR 20, Temp 38.8°C, AVPU Alert"),
    sc("10_nausea_my_de",  "ငါ့ဗိုက်ထဲမှာ အရမ်းနာတယ်၊ အော့အန်နေတယ်",
       "Burmese",    "German",    "Male, 40", "Patient: male, 40, severe abdominal pain and vomiting",
       "O2 97%, HR 95, BP 122/78, RR 18, Temp 37.3°C, AVPU Alert"),
    sc("11_cough_vi_ms",   "Tôi ho rất nhiều và khó thở đặc biệt về đêm",
       "Vietnamese", "Malay",     "Male, 38", "Patient: male, 38, cough and shortness of breath especially at night",
       "O2 95%, HR 96, BP 122/78, RR 20, Temp 37.8°C, AVPU Alert"),
    sc("12_syncope_ar_es", "أشعر بدوار شديد وأغمي علي مرتين اليوم",
       "Arabic",     "Spanish",   "Male, 48", "Patient: male, 48, severe dizziness with 2 syncopal episodes today",
       "O2 98%, HR 55, BP 100/65, RR 16, Temp 36.6°C, AVPU Alert"),
    sc("13_urinary_pt_hr", "Estou com dor ao urinar e urina com sangue há dois dias",
       "Portuguese", "Croatian",  "Male, 35", "Patient: male, 35, painful urination with haematuria for 2 days",
       "O2 99%, HR 84, BP 125/80, RR 16, Temp 37.6°C, AVPU Alert"),
    sc("14_rash_es_pt",    "Tengo sarpullido con ampollas en el brazo desde ayer",
       "Spanish",    "Portuguese","Male, 32", "Patient: male, 32, blistering rash on arm since yesterday",
       "O2 99%, HR 80, BP 122/78, RR 15, Temp 37.4°C, AVPU Alert"),
    sc("15_ear_pl_ua",     "Mam bardzo silny ból ucha i gorączkę od wczoraj wieczoru",
       "Polish",     "Ukrainian", "Male, 30", "Patient: male, 30, severe ear pain and fever since last night",
       "O2 99%, HR 90, BP 120/78, RR 16, Temp 38.4°C, AVPU Alert"),
    sc("16_dental_ru_fil", "У меня очень сильная зубная боль справа, не могу жевать уже два дня",
       "Russian",    "Filipino",  "Male, 28", "Patient: male, 28, severe right-sided tooth pain for 2 days",
       "O2 99%, HR 82, BP 122/80, RR 15, Temp 37.2°C, AVPU Alert"),
    sc("17_diarrhea_th_ro","ฉันท้องเสียมากตั้งแต่เมื่อคืน อุจจาระเป็นน้ำ ปวดท้องมาก",
       "Thai",       "Romanian",  "Male, 36", "Patient: male, 36, severe watery diarrhoea and abdominal pain since last night",
       "O2 98%, HR 100, BP 112/70, RR 18, Temp 37.5°C, AVPU Alert"),
    sc("18_fatigue_ka_el", "ვგრძნობ უკიდურეს დაღლილობას და სიცხეს უკვე სამი დღეა",
       "Georgian",   "Greek",     "Male, 42", "Patient: male, 42, extreme fatigue and fever for 3 days",
       "O2 97%, HR 98, BP 118/74, RR 18, Temp 38.6°C, AVPU Alert"),
    sc("19_wrist_hr_tr",   "Imam jaku bol u zapešću nakon pada na palubi, ne mogu pomicati ruku",
       "Croatian",   "Turkish",   "Male, 30", "Patient: male, 30, wrist pain after falling on deck, unable to move hand",
       "O2 99%, HR 88, BP 122/80, RR 16, Temp 36.7°C, AVPU Alert"),
    sc("20_fever_de_hi",   "Ich habe seit gestern Abend hohes Fieber und Schüttelfrost",
       "German",     "Hindi",     "Male, 44", "Patient: male, 44, high fever and chills since last night",
       "O2 97%, HR 104, BP 116/72, RR 20, Temp 39.3°C, AVPU Alert"),
]

# ── Runners ────────────────────────────────────────────────────────────────────

print_lock = threading.Lock()

def run_scenario(scenario):
    """Run silently, capture output to file."""
    name     = scenario["name"]
    out_path = os.path.join(RUNS_DIR, f"{name}.txt")
    env_vars = os.environ.copy()
    env_vars["MARINA_SCENARIO"] = json.dumps(scenario)

    t0 = time.monotonic()
    try:
        result  = subprocess.run(
            [sys.executable, SIMPLE_TEST],
            env=env_vars, capture_output=True, text=True, timeout=900,
        )
        output   = result.stdout + (result.stderr or "")
        success  = result.returncode == 0 and "Interview complete" in output
        err_hint = ""
        if not success:
            for line in output.splitlines():
                if "HTTP " in line or "Error" in line or "error" in line:
                    err_hint = line.strip()[:80]
                    break
    except subprocess.TimeoutExpired:
        output, success, err_hint = "TIMEOUT after 900s\n", False, "timeout"

    elapsed = time.monotonic() - t0
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(output)
    return name, success, elapsed, err_hint


def run_scenario_live(scenario):
    """Run one scenario, streaming its output to stdout in real time."""
    name     = scenario["name"]
    out_path = os.path.join(RUNS_DIR, f"{name}.txt")
    env_vars = os.environ.copy()
    env_vars["MARINA_SCENARIO"] = json.dumps(scenario)

    print(f"{BOLD}{BLUE}── Live: {name} ──{NC}\n", flush=True)

    t0      = time.monotonic()
    lines   = []
    success = False
    err_hint = ""
    try:
        proc = subprocess.Popen(
            [sys.executable, SIMPLE_TEST],
            env=env_vars, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
        )
        with open(out_path, "w", encoding="utf-8") as f:
            for line in proc.stdout:
                print(line, end="", flush=True)
                f.write(line)
                lines.append(line)
        proc.wait()
        output   = "".join(lines)
        success  = proc.returncode == 0 and "Interview complete" in output
        if not success:
            for line in lines:
                if "HTTP " in line or "Error" in line:
                    err_hint = line.strip()[:80]
                    break
    except subprocess.TimeoutExpired:
        proc.kill()
        err_hint = "timeout"

    elapsed = time.monotonic() - t0
    print(f"\n{BOLD}{BLUE}── End live ──{NC}\n", flush=True)
    return name, success, elapsed, err_hint


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    concurrency = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    os.makedirs(RUNS_DIR, exist_ok=True)

    total = len(SCENARIOS)
    print(f"\n{BOLD}{BLUE}{'═'*56}{NC}")
    print(f"{BOLD}{BLUE}  Marina — Concurrent Interview Runner{NC}")
    print(f"{BOLD}{BLUE}  {total} scenarios · concurrency={concurrency}{NC}")
    print(f"{BOLD}{BLUE}{'═'*56}{NC}\n")

    live      = SCENARIOS[0]
    rest      = SCENARIOS[1:]
    passed, failed = [], []

    # Start background scenarios immediately
    with ThreadPoolExecutor(max_workers=max(1, concurrency - 1)) as ex:
        futures = {ex.submit(run_scenario, s): s["name"] for s in rest}

        # Stream live scenario in the main thread
        name, success, elapsed, err_hint = run_scenario_live(live)
        if success:
            passed.append(name)
        else:
            failed.append((name, err_hint))

        # Print header for background results
        print(f"  {'Scenario':<32}  Result    Time")
        print(f"  {'─'*32}  {'─'*8}  {'─'*6}")

        # Report live result first
        if success:
            print(f"  {name:<32}  {GREEN}PASS{NC}      {elapsed:5.0f}s")
        else:
            print(f"  {name:<32}  {RED}FAIL{NC}      {elapsed:5.0f}s  ({err_hint})")

        # Collect background results as they finish
        for future in as_completed(futures):
            name, success, elapsed, err_hint = future.result()
            if success:
                passed.append(name)
                print(f"  {name:<32}  {GREEN}PASS{NC}      {elapsed:5.0f}s")
            else:
                failed.append((name, err_hint))
                print(f"  {name:<32}  {RED}FAIL{NC}      {elapsed:5.0f}s  ({err_hint})")

    print(f"\n{BOLD}{BLUE}{'═'*56}{NC}")
    print(f"  {GREEN}Passed: {len(passed)}/{total}{NC}   {RED}Failed: {len(failed)}/{total}{NC}")
    if failed:
        print(f"\n  {BOLD}Failed scenarios:{NC}")
        for name, hint in failed:
            hint_str = f"  — {hint}" if hint else ""
            print(f"    {RED}✗{NC} {name}{hint_str}")
        print(f"\n  Logs: tests/runs/<name>.txt")
    print()
    sys.exit(0 if not failed else 1)

if __name__ == "__main__":
    main()
