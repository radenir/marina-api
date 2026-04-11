#!/usr/bin/env python3
"""
Marina API — Multi-Scenario Interview Test
==========================================
Reads credentials from ../.env automatically. No env vars required.

Usage:
    python3 tests/simple_test.py [case_number]   # run specific case (1-5)
    python3 tests/simple_test.py                  # run all 5 cases
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

# ── Test cases (see tests/cases_index.md for full reference) ───────────────────
CASES = [
    # 1 — Dizziness/Vertigo
    {
        "name": "Filipino patient / English MO — Dizziness/Vertigo",
        "slug": "vertigo_fil_en",
        "p_lang": "Filipino",
        "mo_lang": "English",
        "symptom": "Biglang nagikot-ikot ang paningin ko at pakiramdam ko ay gumagalaw ang lupa, kasama ang pagduduwal, nagsimula mga dalawang oras na ang nakakaraan",
        "patient_system": "You are a patient on a maritime vessel. Male, 32 years old. Chief complaint: sudden severe rotational vertigo and nausea for 2 hours. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 78, BP 118/76, RR 16, Temp 36.8°C, AVPU Alert. Rules: reply in 1-2 short sentences in Filipino (Tagalog). Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 32, sudden severe rotational vertigo and nausea x2 hours. Fixed values: O2 99%, HR 78 bpm, BP 118/76 mmHg, RR 16, Temp 36.8°C, AVPU Alert. Horizontal nystagmus present, Dix-Hallpike positive right side, no hearing loss, no focal neuro deficit. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 2 — Skin Infections/Rash
    {
        "name": "Chinese patient / Russian MO — Skin Infection (cellulitis)",
        "slug": "skin_zh_ru",
        "p_lang": "Chinese",
        "mo_lang": "Russian",
        "symptom": "我的左腿有一个伤口，周围皮肤越来越红，又热又痛，已经三天了，红肿还在扩散",
        "patient_system": "You are a patient on a maritime vessel. Male, 28 years old. Chief complaint: infected wound left lower leg with spreading redness, warmth and pain for 3 days. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 98%, HR 96, BP 122/78, RR 17, Temp 38.2°C, AVPU Alert. Rules: reply in 1-2 short sentences in Mandarin Chinese. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 28, cellulitis left lower leg spreading x3 days. Fixed values: O2 98%, HR 96 bpm, BP 122/78 mmHg, RR 17, Temp 38.2°C, AVPU Alert. Left lower leg: 10x8cm erythema, warm, tender, no fluctuance, no lymphangitis. Rules: reply in 1-2 short sentences in Russian. Give only the specific finding asked. No diagnoses.",
    },
    # 3 — Dental Pain
    {
        "name": "Indonesian patient / English MO — Dental Abscess",
        "slug": "dental_id_en",
        "p_lang": "Indonesian",
        "mo_lang": "English",
        "symptom": "Gigi geraham bawah kanan saya sakit sekali sudah dua hari, pipi kanan bengkak dan saya juga demam",
        "patient_system": "You are a patient on a maritime vessel. Male, 25 years old. Chief complaint: severe right lower molar pain with right cheek swelling and fever for 2 days. No chronic conditions, no medications. Allergic to penicillin. Non-smoker. Vital signs: O2 99%, HR 92, BP 126/78, RR 16, Temp 38.3°C, AVPU Alert. Rules: reply in 1-2 short sentences in Indonesian. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 25, dental abscess lower right molar with facial swelling and fever. Penicillin allergy. Fixed values: O2 99%, HR 92 bpm, BP 126/78 mmHg, RR 16, Temp 38.3°C, AVPU Alert. Right lower molar: periapical abscess, cheek swelling, no trismus, mouth opening adequate. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 4 — Laceration or Open Wounds
    {
        "name": "Ukrainian patient / Polish MO — Forearm Laceration (machinery)",
        "slug": "laceration_ua_pl",
        "p_lang": "Ukrainian",
        "mo_lang": "Polish",
        "symptom": "Я порізав передпліччя об гострий металевий край, рана глибока і дуже кровить, і я не можу нормально рухати пальцями",
        "patient_system": "You are a patient on a maritime vessel. Male, 35 years old. Chief complaint: deep left forearm laceration from metal edge, actively bleeding, difficulty moving fingers. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 102, BP 124/80, RR 17, Temp 36.9°C, AVPU Alert. Rules: reply in 1-2 short sentences in Ukrainian. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 35, deep left forearm laceration from metal. Fixed values: O2 99%, HR 102 bpm, BP 124/80 mmHg, RR 17, Temp 36.9°C, AVPU Alert. 6cm laceration left forearm, deep, partial flexor tendon visible, bleeding controlled with pressure, distal neurovascular intact. Rules: reply in 1-2 short sentences in Polish. Give only the specific finding asked. No diagnoses.",
    },
    # 5 — Burns and Chemical Injuries
    {
        "name": "Hindi patient / English MO — Chemical Splash (face and eyes)",
        "slug": "chemical_hi_en",
        "p_lang": "Hindi",
        "mo_lang": "English",
        "symptom": "सफाई के दौरान केमिकल मेरी आँखों और चेहरे पर गिर गया, बहुत तेज जलन हो रही है और आँखें खुली नहीं रह पाती",
        "patient_system": "You are a patient on a maritime vessel. Male, 40 years old. Chief complaint: acid-based cleaning agent splashed onto face and eyes 20 minutes ago, severe burning pain, cannot keep eyes open. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 98%, HR 108, BP 130/84, RR 18, Temp 37.0°C, AVPU Alert. Rules: reply in 1-2 short sentences in Hindi. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 40, chemical splash (acid cleaner) to face and both eyes x20 minutes. Fixed values: O2 98%, HR 108 bpm, BP 130/84 mmHg, RR 18, Temp 37.0°C, AVPU Alert. Bilateral conjunctival injection, copious tearing, facial erythema, continuous irrigation initiated, no corneal ulceration visible yet. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 6 — Eye Pain
    {
        "name": "Greek patient / English MO — Acute Angle-Closure Glaucoma",
        "slug": "eyepain_gr_en",
        "p_lang": "Greek",
        "mo_lang": "English",
        "symptom": "Το δεξί μου μάτι πονά πάρα πολύ από το πρωί, έχω φωτοφοβία και βλέπω θολά με φωτοστέφανα γύρω από τα φώτα",
        "patient_system": "You are a patient on a maritime vessel. Male, 44 years old. Chief complaint: severe right eye pain since this morning, photophobia, blurred vision with halos around lights. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 84, BP 128/82, RR 16, Temp 37.1°C, AVPU Alert. Rules: reply in 1-2 short sentences in Greek. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 44, severe right eye pain with halos and blurred vision. Fixed values: O2 99%, HR 84 bpm, BP 128/82 mmHg, RR 16, Temp 37.1°C, AVPU Alert. Right eye: severe photophobia, ciliary injection, corneal haze, mid-dilated fixed pupil, globe feels hard on gentle palpation. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 7 — Ear Pain or Hearing Problems
    {
        "name": "Russian patient / Ukrainian MO — Sudden Hearing Loss after blast",
        "slug": "ear_ru_ua",
        "p_lang": "Russian",
        "mo_lang": "Ukrainian",
        "symptom": "После взрыва в машинном отделении я внезапно почти потерял слух на правое ухо и слышу сильный постоянный звон",
        "patient_system": "You are a patient on a maritime vessel. Male, 38 years old. Chief complaint: sudden right-sided hearing loss and loud tinnitus after explosion in engine room. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 86, BP 122/80, RR 16, Temp 36.9°C, AVPU Alert. Rules: reply in 1-2 short sentences in Russian. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 38, sudden right sensorineural hearing loss and tinnitus after blast. Fixed values: O2 99%, HR 86 bpm, BP 122/80 mmHg, RR 16, Temp 36.9°C, AVPU Alert. Right ear: tympanic membrane intact, Rinne AC>BC both sides but reduced right, Weber lateralises to left, no discharge, no vertigo. Rules: reply in 1-2 short sentences in Ukrainian. Give only the specific finding asked. No diagnoses.",
    },
    # 8 — Urinary Symptoms
    {
        "name": "Burmese patient / English MO — Pyelonephritis",
        "slug": "urinary_my_en",
        "p_lang": "Burmese",
        "mo_lang": "English",
        "symptom": "နှစ်ရက်ကတည်းက ဆီးသွားတိုင်း အလွန်နာကျင်ပြီး မကြာခဏ ဆီးသွားနေရတယ်၊ ကျောကပ်ဘက်မှာ နာကျင်ပြီး ဖျားနာနေတယ်",
        "patient_system": "You are a patient on a maritime vessel. Male, 29 years old. Chief complaint: dysuria and urinary frequency for 2 days with right flank pain and fever. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 98%, HR 98, BP 118/76, RR 18, Temp 38.6°C, AVPU Alert. Rules: reply in 1-2 short sentences in Burmese (Myanmar language). Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 29, dysuria, frequency, right flank pain and fever x2 days — pyelonephritis suspected. Fixed values: O2 98%, HR 98 bpm, BP 118/76 mmHg, RR 18, Temp 38.6°C, AVPU Alert. Right costovertebral angle tenderness, suprapubic tenderness, no urethral discharge. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 9 — Shortness of Breath
    {
        "name": "Vietnamese patient / English MO — Acute Heart Failure",
        "slug": "dyspnea_vi_en",
        "p_lang": "Vietnamese",
        "mo_lang": "English",
        "symptom": "Tôi khó thở ngày càng nặng hơn trong ba ngày qua, đặc biệt khi nằm xuống, và chân tôi bị phù",
        "patient_system": "You are a patient on a maritime vessel. Male, 55 years old. Chief complaint: progressive shortness of breath over 3 days, orthopnoea, ankle swelling. Known hypertension and ischaemic heart disease, takes aspirin and atenolol. No allergies. Non-smoker. Vital signs: O2 90%, HR 102, BP 148/92, RR 28, Temp 36.8°C, AVPU Alert. Rules: reply in 1-2 short sentences in Vietnamese. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 55, progressive SOB x3 days with orthopnoea. Known IHD and hypertension. Fixed values: O2 90%, HR 102 bpm, BP 148/92 mmHg, RR 28, Temp 36.8°C, AVPU Alert. Bilateral basal crackles, elevated JVP, pitting oedema both ankles, no acute chest pain. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 10 — Joint Pain or Swelling
    {
        "name": "Bengali patient / English MO — Acute Gout",
        "slug": "joint_bn_en",
        "p_lang": "Bengali",
        "mo_lang": "English",
        "symptom": "আমার ডান পায়ের বুড়ো আঙুলের গোড়া হঠাৎ ভয়ংকর ব্যথা করছে, ফুলে লাল হয়ে গেছে, হাঁটতে পারছি না",
        "patient_system": "You are a patient on a maritime vessel. Male, 42 years old. Chief complaint: sudden severe pain, swelling and redness of right big toe joint, cannot walk. No medications, no allergies. Non-smoker. History of similar episodes. Vital signs: O2 99%, HR 88, BP 132/86, RR 16, Temp 37.4°C, AVPU Alert. Rules: reply in 1-2 short sentences in Bengali. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 42, acute gout flare right first MTP joint. Fixed values: O2 99%, HR 88 bpm, BP 132/86 mmHg, RR 16, Temp 37.4°C, AVPU Alert. Right first MTP: severely swollen, erythematous, hot, exquisitely tender, no trauma, similar past episodes. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 11 — Fatigue or Exhaustion
    {
        "name": "Tamil patient / English MO — Chronic Fatigue (TB suspicion)",
        "slug": "fatigue_ta_en",
        "p_lang": "Tamil",
        "mo_lang": "English",
        "symptom": "ஆறு வாரங்களாக மிகவும் சோர்வாக இருக்கிறேன், எடை குறைந்துவிட்டது, இரவில் வியர்க்கிறது, தொடர் இருமல் இருக்கிறது",
        "patient_system": "You are a patient on a maritime vessel. Male, 50 years old. Chief complaint: progressive fatigue, weight loss ~6kg, night sweats and persistent productive cough for 6 weeks. Smoker. No medications, no allergies. Vital signs: O2 95%, HR 92, BP 118/74, RR 20, Temp 38.1°C, AVPU Alert. Rules: reply in 1-2 short sentences in Tamil. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 50, fatigue, weight loss, night sweats and productive cough x6 weeks. Smoker. Fixed values: O2 95%, HR 92 bpm, BP 118/74 mmHg, RR 20, Temp 38.1°C, AVPU Alert. Cachexia, bilateral upper lobe crepitations, mild cervical lymphadenopathy. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 12 — Diarrhea
    {
        "name": "Urdu patient / English MO — Severe Gastroenteritis with Dehydration",
        "slug": "diarrhea_ur_en",
        "p_lang": "Urdu",
        "mo_lang": "English",
        "symptom": "تین دن سے بہت زیادہ پانی جیسے دست آ رہے ہیں، الٹیاں بھی ہو رہی ہیں اور بہت کمزوری محسوس ہو رہی ہے",
        "patient_system": "You are a patient on a maritime vessel. Male, 33 years old. Chief complaint: profuse watery diarrhea for 3 days with vomiting and severe weakness after port stop in Southeast Asia. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 97%, HR 116, BP 96/60, RR 20, Temp 37.8°C, AVPU Alert. Rules: reply in 1-2 short sentences in Urdu. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 33, profuse watery diarrhea x3 days with vomiting, severe dehydration. Fixed values: O2 97%, HR 116 bpm, BP 96/60 mmHg, RR 20, Temp 37.8°C, AVPU Alert. Dry mucous membranes, sunken eyes, skin turgor markedly reduced, no blood in stool. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 13 — Psychological Stress or Anxiety
    {
        "name": "Polish patient / German MO — Panic Disorder",
        "slug": "anxiety_pl_de",
        "p_lang": "Polish",
        "mo_lang": "German",
        "symptom": "Od tygodnia mam silne ataki paniki, nie mogę pracować, czuję bicie serca, ucisk w klatce piersiowej i strach, że umrę",
        "patient_system": "You are a patient on a maritime vessel. Male, 36 years old. Chief complaint: severe panic attacks for 1 week, unable to work, palpitations, chest tightness, fear of dying. No cardiac history, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 118, BP 134/88, RR 26, Temp 36.9°C, AVPU Alert. Rules: reply in 1-2 short sentences in Polish. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 36, panic disorder — panic attacks x1 week. Fixed values: O2 99%, HR 118 bpm, BP 134/88 mmHg, RR 26, Temp 36.9°C, AVPU Alert. Hyperventilating, tremulous hands, regular cardiac rhythm, no wheeze, tingling in hands and perioral area, no structural cardiac abnormality. Rules: reply in 1-2 short sentences in German. Give only the specific finding asked. No diagnoses.",
    },
    # 14 — Unspecific Symptoms
    {
        "name": "Romanian patient / French MO — Constitutional Symptoms (TB/HIV suspicion)",
        "slug": "unspecific_ro_fr",
        "p_lang": "Romanian",
        "mo_lang": "French",
        "symptom": "De aproape o lună am o stare generală proastă, oboseală mare, am slăbit vreo 5 kilograme, transpir noaptea și am febră mică din când în când",
        "patient_system": "You are a patient on a maritime vessel. Male, 45 years old. Chief complaint: vague malaise, profound fatigue, weight loss ~5kg, night sweats and intermittent low-grade fever for 4 weeks. Smoker. No medications, no allergies. Vital signs: O2 97%, HR 88, BP 116/72, RR 17, Temp 37.6°C, AVPU Alert. Rules: reply in 1-2 short sentences in Romanian. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 45, constitutional symptoms — weight loss, night sweats, low fever x4 weeks. Smoker. Fixed values: O2 97%, HR 88 bpm, BP 116/72 mmHg, RR 17, Temp 37.6°C, AVPU Alert. Mild pallor, bilateral cervical lymphadenopathy, no organomegaly palpable, no focal chest findings. Rules: reply in 1-2 short sentences in French. Give only the specific finding asked. No diagnoses.",
    },
    # 15 — Anaphylaxis and Allergic Reactions
    {
        "name": "Croatian patient / Italian MO — Anaphylaxis (shellfish)",
        "slug": "anaphylaxis_hr_it",
        "p_lang": "Croatian",
        "mo_lang": "Italian",
        "symptom": "Pojeo sam školjke na ručku i odmah mi se pojavio osip po cijelu tijelu, grlo mi se steglo i sve teže mi je disati",
        "patient_system": "You are a patient on a maritime vessel. Male, 27 years old. Chief complaint: anaphylaxis after eating shellfish at crew meal — generalised urticaria, throat tightening, worsening difficulty breathing. No prior known allergies. No medications. Non-smoker. Vital signs: O2 93%, HR 128, BP 88/56, RR 28, Temp 37.0°C, AVPU Alert. Rules: reply in 1-2 short sentences in Croatian. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 27, severe anaphylaxis after shellfish ingestion. Fixed values: O2 93%, HR 128 bpm, BP 88/56 mmHg, RR 28, Temp 37.0°C, AVPU Alert. Generalised urticaria, angioedema lips and tongue, audible stridor, bilateral bronchospasm, hypotensive — epinephrine given. Rules: reply in 1-2 short sentences in Italian. Give only the specific finding asked. No diagnoses.",
    },
    # 16 — Palpitations or Irregular Heartbeat
    {
        "name": "Turkish patient / English MO — New-onset Atrial Fibrillation",
        "slug": "palpitation_tr_en",
        "p_lang": "Turkish",
        "mo_lang": "English",
        "symptom": "Üç saatten beri kalbim çok hızlı ve düzensiz çarpıyor, göğsümde hafif bir rahatsızlık var ve biraz nefes darlığı hissediyorum",
        "patient_system": "You are a patient on a maritime vessel. Male, 52 years old. Chief complaint: rapid irregular heartbeat for 3 hours with mild chest discomfort and dyspnoea. No cardiac history, no regular medications, no allergies. Non-smoker. Vital signs: O2 97%, HR 138 (irregular), BP 132/84, RR 18, Temp 36.9°C, AVPU Alert. Rules: reply in 1-2 short sentences in Turkish. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 52, new-onset rapid irregular heartbeat x3 hours. Fixed values: O2 97%, HR 138 bpm (irregularly irregular), BP 132/84 mmHg, RR 18, Temp 36.9°C, AVPU Alert. Irregularly irregular pulse, no murmurs, no signs of heart failure, mild dyspnoea on exertion. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 17 — Altered Consciousness or Confusion
    {
        "name": "Arabic patient / English MO — Acute Stroke (FAST positive)",
        "slug": "confusion_ar_en",
        "p_lang": "Arabic",
        "mo_lang": "English",
        "symptom": "لم أكن أعرف أين أنا، كلامي كان مشوشاً وأحد جانبي كان ضعيفاً، زملائي وجدوني على هذه الحال",
        "patient_system": "You are a patient on a maritime vessel. Male, 48 years old. Chief complaint: sudden confusion, slurred speech and right-sided weakness — found by colleagues. Known hypertension, not on medication. No allergies. Non-smoker. Vital signs: O2 94%, HR 96, BP 188/114, RR 18, Temp 37.2°C, AVPU Voice. Rules: reply in 1-2 short sentences in Arabic, short confused answers, some difficulty speaking. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 48, acute stroke — FAST positive. Fixed values: O2 94%, HR 96 bpm, BP 188/114 mmHg, RR 18, Temp 37.2°C, AVPU Voice. GCS 12, slurred speech, right facial droop, right arm and leg weakness, onset approximately 45 minutes ago. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 18 — Mental Health Crisis
    {
        "name": "Spanish patient / English MO — Suicidal Ideation",
        "slug": "mental_es_en",
        "p_lang": "Spanish",
        "mo_lang": "English",
        "symptom": "He estado pensando en quitarme la vida. Llevo tres días sin comer y ya no quiero seguir. No encuentro sentido a nada",
        "patient_system": "You are a patient on a maritime vessel. Male, 30 years old. Chief complaint: active suicidal ideation, not eating for 3 days, social withdrawal, hopelessness. Known depression, on no current medication. No allergies. Non-smoker. Vital signs: O2 99%, HR 74, BP 112/70, RR 14, Temp 36.5°C, AVPU Alert. Rules: reply in 1-2 short sentences in Spanish, flat and subdued tone. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 30, active suicidal ideation and mental health crisis. Fixed values: O2 99%, HR 74 bpm, BP 112/70 mmHg, RR 14, Temp 36.5°C, AVPU Alert. Flat affect, poor eye contact, actively expresses suicidal intent, no means identified onboard, no self-harm injuries, not eating x3 days. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 19 — Syncope or Presyncope
    {
        "name": "Norwegian patient / English MO — Witnessed Collapse (cardiac)",
        "slug": "syncope_no_en",
        "p_lang": "Norwegian",
        "mo_lang": "English",
        "symptom": "Jeg besvimte plutselig på dekk uten forvarsel og kollegaene mine sier jeg var bevisstløs i omtrent ett minutt",
        "patient_system": "You are a patient on a maritime vessel. Male, 62 years old. Chief complaint: sudden loss of consciousness on deck without warning, brief LOC ~1 minute, now recovered. Known ischaemic heart disease, takes bisoprolol and aspirin. No allergies. Non-smoker. Vital signs: O2 97%, HR 46, BP 96/60, RR 16, Temp 36.7°C, AVPU Alert. Rules: reply in 1-2 short sentences in Norwegian. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 62, witnessed syncope on deck, now GCS 15. Known IHD on bisoprolol. Fixed values: O2 97%, HR 46 bpm, BP 96/60 mmHg, RR 16, Temp 36.7°C, AVPU Alert. Bradycardia, no head injury, no chest pain now, no focal neuro deficit, GCS 15. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 20 — Trauma
    {
        "name": "German patient / English MO — Blunt Chest Trauma (heavy door)",
        "slug": "trauma_de_en",
        "p_lang": "German",
        "mo_lang": "English",
        "symptom": "Eine schwere Tür hat mich gegen die Rippen getroffen als das Schiff rollte. Die linke Seite schmerzt stark und ich kann kaum tief einatmen",
        "patient_system": "You are a patient on a maritime vessel. Male, 47 years old. Chief complaint: blunt left chest trauma from heavy door in heavy seas, severe rib pain and difficulty breathing deeply. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 95%, HR 104, BP 130/84, RR 22, Temp 37.0°C, AVPU Alert. Rules: reply in 1-2 short sentences in German. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 47, blunt left chest trauma. Fixed values: O2 95%, HR 104 bpm, BP 130/84 mmHg, RR 22, Temp 37.0°C, AVPU Alert. Left chest wall bruising, point tenderness ribs 4-6 left lateral, reduced breath sounds left base, trachea central, no paradoxical movement. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 21 — Cold Exposure/Hypothermia
    {
        "name": "Italian patient / English MO — MOB Hypothermia",
        "slug": "cold_it_en",
        "p_lang": "Italian",
        "mo_lang": "English",
        "symptom": "Sono caduto in mare, l'acqua era gelida. Sono stato salvato dopo circa venti minuti e ora tremo fortissimo e sono confuso",
        "patient_system": "You are a patient on a maritime vessel. Male, 39 years old. Chief complaint: man-overboard recovery, cold water immersion ~20 minutes, now shivering violently and confused. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 94%, HR 44, BP 100/64, RR 10, Temp 32.5°C, AVPU Voice. Rules: reply in 1-2 short sentences in Italian, confused and shivering. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 39, MOB hypothermia after cold water immersion x20 minutes. Fixed values: O2 94%, HR 44 bpm (bradycardia), BP 100/64 mmHg, RR 10, Temp 32.5°C, AVPU Voice. GCS 12, violent shivering, cold clammy skin, wet clothing removed, passive rewarming initiated. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 22 — Heat Stroke/Heat Exhaustion
    {
        "name": "Korean patient / English MO — Heat Stroke (engine room)",
        "slug": "heatstroke_ko_en",
        "p_lang": "Korean",
        "mo_lang": "English",
        "symptom": "엔진실에서 작업 중 쓰러졌습니다. 매우 뜨겁고 땀이 전혀 나지 않으며, 동료들이 저를 발견했을 때 의식이 거의 없었다고 합니다",
        "patient_system": "You are a patient on a maritime vessel. Male, 31 years old. Chief complaint: collapsed in engine room during shift — extremely hot, stopped sweating, near-loss of consciousness when found by colleagues. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 96%, HR 128, BP 100/62, RR 24, Temp 40.8°C, AVPU Pain. Rules: reply very briefly in Korean, confused and disoriented. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 31, heat stroke — engine room collapse. Fixed values: O2 96%, HR 128 bpm, BP 100/62 mmHg, RR 24, Temp 40.8°C, AVPU Pain. GCS 10, hot dry skin, no sweating, confused, hypotensive, active cooling initiated. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 23 — Tropical Disease
    {
        "name": "Malay patient / English MO — Suspected Malaria (post West Africa)",
        "slug": "tropical_ms_en",
        "p_lang": "Malay",
        "mo_lang": "English",
        "symptom": "Saya ada demam tinggi dengan menggigil teruk yang datang setiap dua hari, sakit kepala teruk dan badan sangat sakit, baru balik dari Afrika Barat 10 hari lepas",
        "patient_system": "You are a patient on a maritime vessel. Male, 36 years old. Chief complaint: cyclical high fever with rigors every 48 hours, severe headache and myalgia, returned from West Africa 10 days ago. No chronic conditions, no regular medications, no allergies. Non-smoker. Vital signs: O2 96%, HR 118, BP 108/68, RR 22, Temp 39.8°C, AVPU Alert. Rules: reply in 1-2 short sentences in Malay. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 36, suspected malaria — cyclical fever with rigors, returned West Africa 10 days ago. Fixed values: O2 96%, HR 118 bpm, BP 108/68 mmHg, RR 22, Temp 39.8°C, AVPU Alert. Febrile, mild splenomegaly on palpation, pallor, mild jaundice, no meningism. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 24 — Poisoning/Overdose
    {
        "name": "Latvian patient / English MO — Medication Overdose (tricyclic)",
        "slug": "poison_lv_en",
        "p_lang": "Latvian",
        "mo_lang": "English",
        "symptom": "Es izdzēru daudzas tabletes no flakona. Es nezinu, cik daudz. Man ir ļoti slikti un es nevaru domāt skaidri",
        "patient_system": "You are a patient on a maritime vessel. Male, 28 years old. Chief complaint: ingested unknown quantity of tricyclic antidepressant tablets found in cabin, now drowsy and confused. Known depression, prescribed amitriptyline. No other allergies. Non-smoker. Vital signs: O2 92%, HR 124, BP 98/60, RR 12, Temp 37.3°C, AVPU Voice. Rules: reply in 1-2 very brief confused sentences in Latvian. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 28, tricyclic antidepressant overdose. Known depression on amitriptyline. Fixed values: O2 92%, HR 124 bpm, BP 98/60 mmHg, RR 12, Temp 37.3°C, AVPU Voice. GCS 11, dilated pupils, dry mouth, tachycardia, hypotension, empty medication bottle found. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 25 — Musculoskeletal injuries
    {
        "name": "Japanese patient / English MO — Acute Lumbar Disc Prolapse",
        "slug": "muscle_ja_en",
        "p_lang": "Japanese",
        "mo_lang": "English",
        "symptom": "重い荷物を持ち上げた瞬間に腰に激痛が走り、右足にしびれと激痛が広がっています。まっすぐ立てません",
        "patient_system": "You are a patient on a maritime vessel. Male, 34 years old. Chief complaint: acute severe low back pain radiating down right leg with numbness after lifting heavy equipment, cannot stand straight. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 90, BP 126/80, RR 16, Temp 36.8°C, AVPU Alert. Rules: reply in 1-2 short sentences in Japanese. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 34, acute lumbar disc prolapse after lifting. Fixed values: O2 99%, HR 90 bpm, BP 126/80 mmHg, RR 16, Temp 36.8°C, AVPU Alert. Antalgic posture leaning left, limited lumbar flexion, SLR positive right at 40°, reduced sensation dorsum right foot, ankle reflex reduced right. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 26 — Eye Foreign Body
    {
        "name": "Thai patient / English MO — Metallic Corneal Foreign Body",
        "slug": "eyefb_th_en",
        "p_lang": "Thai",
        "mo_lang": "English",
        "symptom": "ขณะที่กำลังเจียรโลหะโดยไม่ใส่แว่นตา เศษโลหะกระเด็นเข้าตาซ้าย เจ็บมากและน้ำตาไหลตลอดเวลา มองแสงไม่ได้",
        "patient_system": "You are a patient on a maritime vessel. Male, 26 years old. Chief complaint: metal fragment entered left eye while angle-grinding without goggles — severe pain, tearing, photophobia. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 94, BP 122/78, RR 16, Temp 36.8°C, AVPU Alert. Rules: reply in 1-2 short sentences in Thai. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 26, metallic corneal foreign body left eye. Fixed values: O2 99%, HR 94 bpm, BP 122/78 mmHg, RR 16, Temp 36.8°C, AVPU Alert. Left eye: metallic FB visible on cornea, conjunctival injection, photophobia, fluorescein positive around FB, no signs of globe perforation. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 27 — Nosebleed
    {
        "name": "Danish patient / English MO — Epistaxis (hypertensive, anticoagulated)",
        "slug": "epistaxis_da_en",
        "p_lang": "Danish",
        "mo_lang": "English",
        "symptom": "Næsen har blødt kraftigt i tredive minutter og vil ikke stoppe trods tryk. Jeg tager blodfortyndende og blodtryksmedicin",
        "patient_system": "You are a patient on a maritime vessel. Male, 53 years old. Chief complaint: heavy nosebleed for 30 minutes not stopping despite sustained pressure. Known hypertension and AF on warfarin and amlodipine. No allergies. Non-smoker. Vital signs: O2 98%, HR 94, BP 172/104, RR 17, Temp 36.9°C, AVPU Alert. Rules: reply in 1-2 short sentences in Danish. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 53, anterior epistaxis x30 minutes, on warfarin and amlodipine. Fixed values: O2 98%, HR 94 bpm, BP 172/104 mmHg, RR 17, Temp 36.9°C, AVPU Alert. Active bleeding left anterior nostril, profuse, BP markedly elevated, INR unknown onboard, no posterior bleed signs. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 28 — Sexually Transmitted Diseases
    {
        "name": "Dutch patient / English MO — Urethral Discharge (STI)",
        "slug": "std_nl_en",
        "p_lang": "Dutch",
        "mo_lang": "English",
        "symptom": "Na een havenbezoek een week geleden heb ik pijn bij het plassen en een gele afscheiding uit mijn penis. Ik schaam me maar het wordt erger",
        "patient_system": "You are a patient on a maritime vessel. Male, 29 years old. Chief complaint: dysuria and mucopurulent urethral discharge for 1 week after port visit. No chronic conditions, no medications. Allergic to penicillin. Non-smoker. Vital signs: O2 99%, HR 76, BP 118/74, RR 16, Temp 37.2°C, AVPU Alert. Rules: reply in 1-2 short sentences in Dutch. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 29, urethral discharge and dysuria after port. Penicillin allergy. Fixed values: O2 99%, HR 76 bpm, BP 118/74 mmHg, RR 16, Temp 37.2°C, AVPU Alert. Mucopurulent urethral discharge, meatal erythema, no testicular tenderness, no inguinal lymphadenopathy. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 29 — Female Health
    {
        "name": "Swedish patient / English MO — Suspected Ectopic Pregnancy",
        "slug": "female_sv_en",
        "p_lang": "Swedish",
        "mo_lang": "English",
        "symptom": "Jag har inte haft mens på sex veckor, har stark smärta i nedre högra delen av magen, lite vaginalt blödning och känner mig yr och svag",
        "patient_system": "You are a patient on a maritime vessel. Female, 28 years old. Chief complaint: 6 weeks amenorrhoea, severe right lower abdominal pain, vaginal spotting and dizziness. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 98%, HR 112, BP 100/62, RR 20, Temp 37.1°C, AVPU Alert. Rules: reply in 1-2 short sentences in Swedish. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: female, 28, suspected ectopic pregnancy. Fixed values: O2 98%, HR 112 bpm, BP 100/62 mmHg, RR 20, Temp 37.1°C, AVPU Alert. Urine pregnancy test positive, right iliac fossa tenderness and guarding, cervical excitation on bimanual, no shoulder tip pain. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 30 — Diabetic Complications
    {
        "name": "English patient / Hindi MO — Infected Diabetic Foot",
        "slug": "diabetes_en_hi",
        "p_lang": "English",
        "mo_lang": "Hindi",
        "symptom": "I have a wound on my left foot that has been there for two weeks. It is getting worse, turning red and smelling bad, and now I have a fever",
        "patient_system": "You are a patient on a maritime vessel. Male, 58 years old. Chief complaint: non-healing infected left foot ulcer for 2 weeks with spreading redness and fever. Known type 2 diabetes on metformin and insulin. No drug allergies. Non-smoker. Vital signs: O2 97%, HR 98, BP 138/88, RR 18, Temp 38.4°C, AVPU Alert. Rules: reply in 1-2 short sentences in English. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 58, infected diabetic foot ulcer. Known T2DM on metformin and insulin. Fixed values: O2 97%, HR 98 bpm, BP 138/88 mmHg, RR 18, Temp 38.4°C, AVPU Alert. Left foot plantar ulcer 3cm, surrounding cellulitis, crepitus on palpation (gas), foul odour, blood glucose 18.2 mmol/L. Rules: reply in 1-2 short sentences in Hindi. Give only the specific finding asked. No diagnoses.",
    },

    # 31
    {
        "name": "Filipino patient / Ukrainian MO — ankle sprain after fall",
        "slug": "ankle_fil_ua",
        "p_lang": "Filipino",
        "mo_lang": "Ukrainian",
        "symptom": "Nahulog ako sa deck at namamaga na ang bukung-bukong ko, hindi ko na matapakan",
        "patient_system": "You are a patient on a maritime vessel. Male, 24 years old. Chief complaint: ankle sprain after falling on deck, swollen and cannot bear weight. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 88, BP 120/76, RR 16, Temp 36.8°C, AVPU Alert. Rules: reply in 1-2 short sentences in Filipino (Tagalog). Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 24, right ankle sprain after fall. Fixed values: O2 99%, HR 88 bpm, BP 120/76 mmHg, RR 16, Temp 36.8°C, AVPU Alert. Right ankle: swollen, tender over lateral malleolus, no crepitus, neurovascular intact. Rules: reply in 1-2 short sentences in Ukrainian. Give only the specific finding asked. No diagnoses.",
    },
    # 32
    {
        "name": "Hindi patient / German MO — shoulder pain + limited movement",
        "slug": "shoulder_hi_de",
        "p_lang": "Hindi",
        "mo_lang": "German",
        "symptom": "मेरे कंधे में बहुत तेज दर्द है और मैं अपना हाथ ऊपर नहीं उठा पा रहा",
        "patient_system": "You are a patient on a maritime vessel. Male, 39 years old. Chief complaint: severe right shoulder pain and inability to raise arm. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 84, BP 126/80, RR 16, Temp 36.9°C, AVPU Alert. Rules: reply in 1-2 short sentences in Hindi. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 39, right shoulder pain, cannot abduct arm. Fixed values: O2 99%, HR 84 bpm, BP 126/80 mmHg, RR 16, Temp 36.9°C, AVPU Alert. Right shoulder: tenderness over greater tuberosity, abduction restricted to 60°, neurovascular intact. Rules: reply in 1-2 short sentences in German. Give only the specific finding asked. No diagnoses.",
    },
    # 33
    {
        "name": "Chinese patient / Russian MO — nosebleed (hypertensive)",
        "slug": "epistaxis_zh_ru",
        "p_lang": "Chinese",
        "mo_lang": "Russian",
        "symptom": "我的鼻子一直在流血，已经流了二十分钟了，压迫也止不住",
        "patient_system": "You are a patient on a maritime vessel. Male, 46 years old. Chief complaint: nosebleed not stopping for 20 minutes despite pressure. Known hypertension, takes lisinopril. No allergies. Non-smoker. Vital signs: O2 98%, HR 90, BP 162/98, RR 17, Temp 36.9°C, AVPU Alert. Rules: reply in 1-2 short sentences in Mandarin Chinese. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 46, epistaxis not controlled after 20 minutes. Known hypertension on lisinopril. Fixed values: O2 98%, HR 90 bpm, BP 162/98 mmHg, RR 17, Temp 36.9°C, AVPU Alert. Active bleeding from left nostril, anterior source, no posterior bleed signs. Rules: reply in 1-2 short sentences in Russian. Give only the specific finding asked. No diagnoses.",
    },
    # 34
    {
        "name": "Portuguese patient / English MO — steam burn to hand",
        "slug": "burn_pt_en",
        "p_lang": "Portuguese",
        "mo_lang": "English",
        "symptom": "Queimei a mão com vapor na cozinha, está com muita dor e estão a aparecer bolhas",
        "patient_system": "You are a patient on a maritime vessel. Male, 32 years old. Chief complaint: steam burn to right hand, severe pain and blisters forming. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 98, BP 128/80, RR 17, Temp 36.9°C, AVPU Alert. Rules: reply in 1-2 short sentences in Portuguese. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 32, steam burn to right hand. Fixed values: O2 99%, HR 98 bpm, BP 128/80 mmHg, RR 17, Temp 36.9°C, AVPU Alert. Right hand: partial thickness burn dorsum and fingers, blisters intact, estimated 4% BSA, no circumferential involvement. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 35
    {
        "name": "Dutch patient / English MO — severe seasickness",
        "slug": "seasick_nl_en",
        "p_lang": "Dutch",
        "mo_lang": "English",
        "symptom": "Ik voel me heel misselijk door de hoge golven en heb al meerdere keren overgegeven",
        "patient_system": "You are a patient on a maritime vessel. Female, 27 years old. Chief complaint: severe seasickness, nausea, repeated vomiting in heavy seas. No chronic conditions, no regular medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 96, BP 108/68, RR 18, Temp 36.7°C, AVPU Alert. Rules: reply in 1-2 short sentences in Dutch. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: female, 27, severe motion sickness and vomiting. Fixed values: O2 99%, HR 96 bpm, BP 108/68 mmHg, RR 18, Temp 36.7°C, AVPU Alert. Mildly dehydrated, no focal neuro signs, abdomen soft. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 36
    {
        "name": "Norwegian patient / English MO — palpitations + chest discomfort (AF)",
        "slug": "palpitation_no_en",
        "p_lang": "Norwegian",
        "mo_lang": "English",
        "symptom": "Hjertet mitt banker veldig uregelmessig og jeg føler ubehag i brystet siden i morges",
        "patient_system": "You are a patient on a maritime vessel. Male, 54 years old. Chief complaint: irregular heartbeat and chest discomfort since this morning. Known atrial fibrillation, takes warfarin. No allergies. Non-smoker. Vital signs: O2 97%, HR 132 (irregular), BP 136/84, RR 18, Temp 36.8°C, AVPU Alert. Rules: reply in 1-2 short sentences in Norwegian. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 54, palpitations and chest discomfort. Known AF on warfarin. Fixed values: O2 97%, HR 132 bpm (irregularly irregular), BP 136/84 mmHg, RR 18, Temp 36.8°C, AVPU Alert. Pulse: irregular, no signs of heart failure. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 37
    {
        "name": "Croatian patient / English MO — finger laceration",
        "slug": "laceration_hr_en",
        "p_lang": "Croatian",
        "mo_lang": "English",
        "symptom": "Porezao sam prst na limariji, rana jako krvari i ne mogu je zaustaviti",
        "patient_system": "You are a patient on a maritime vessel. Male, 30 years old. Chief complaint: deep finger laceration from sheet metal, actively bleeding. No chronic conditions, no medications. No known drug allergies. Non-smoker. Vital signs: O2 99%, HR 94, BP 122/78, RR 16, Temp 36.7°C, AVPU Alert. Rules: reply in 1-2 short sentences in Croatian. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 30, right index finger laceration. Fixed values: O2 99%, HR 94 bpm, BP 122/78 mmHg, RR 16, Temp 36.7°C, AVPU Alert. 2cm deep laceration distal phalanx, bleeding controlled with pressure, tendon intact, sensation intact. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 38
    {
        "name": "Serbian patient / English MO — sore throat + difficulty swallowing",
        "slug": "throat_sr_en",
        "p_lang": "Serbian",
        "mo_lang": "English",
        "symptom": "Imam jaku bol u grlu i teško mi je da gutam već dva dana, i temperatura mi je visoka",
        "patient_system": "You are a patient on a maritime vessel. Male, 21 years old. Chief complaint: severe sore throat, difficulty swallowing, high fever for two days. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 100, BP 118/74, RR 17, Temp 38.8°C, AVPU Alert. Rules: reply in 1-2 short sentences in Serbian. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 21, severe sore throat and dysphagia for 2 days. Fixed values: O2 99%, HR 100 bpm, BP 118/74 mmHg, RR 17, Temp 38.8°C, AVPU Alert. Oropharynx: bilateral tonsillar enlargement with exudate, uvula midline, no trismus, no stridor. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 39
    {
        "name": "Romanian patient / French MO — allergic reaction",
        "slug": "allergy_ro_fr",
        "p_lang": "Romanian",
        "mo_lang": "French",
        "symptom": "Am mâncat ceva și acum am urticarie pe tot corpul, buzele mi se umflă și respir mai greu",
        "patient_system": "You are a patient on a maritime vessel. Female, 26 years old. Chief complaint: generalised urticaria, lip swelling and breathing difficulty after eating. No known prior allergies. No regular medications. Non-smoker. Vital signs: O2 95%, HR 118, BP 102/64, RR 22, Temp 37.0°C, AVPU Alert. Rules: reply in 1-2 short sentences in Romanian. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: female, 26, allergic reaction after eating. Fixed values: O2 95%, HR 118 bpm, BP 102/64 mmHg, RR 22, Temp 37.0°C, AVPU Alert. Diffuse urticaria, angioedema of lips and tongue, mild stridor, no full airway compromise. Rules: reply in 1-2 short sentences in French. Give only the specific finding asked. No diagnoses.",
    },
    # 40
    {
        "name": "Turkish patient / Russian MO — heat exhaustion",
        "slug": "heat_tr_ru",
        "p_lang": "Turkish",
        "mo_lang": "Russian",
        "symptom": "Güverte üzerinde çok sıcak hava altında çalıştım, başım dönüyor ve bulantım var",
        "patient_system": "You are a patient on a maritime vessel. Male, 28 years old. Chief complaint: dizziness and nausea after working in extreme heat on deck. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 98%, HR 116, BP 100/62, RR 20, Temp 39.8°C, AVPU Alert. Rules: reply in 1-2 short sentences in Turkish. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 28, heat exhaustion after prolonged deck work in heat. Fixed values: O2 98%, HR 116 bpm, BP 100/62 mmHg, RR 20, Temp 39.8°C, AVPU Alert. Skin hot and dry, profuse sweating, no confusion. Rules: reply in 1-2 short sentences in Russian. Give only the specific finding asked. No diagnoses.",
    },
    # 41
    {
        "name": "Arabic patient / French MO — post-ictal state after seizure",
        "slug": "seizure_ar_fr",
        "p_lang": "Arabic",
        "mo_lang": "French",
        "symptom": "أُخبرت أنني أصبت بنوبة تشنجية وفقدت الوعي، وأنا الآن مرتبك جداً ومتعب",
        "patient_system": "You are a patient on a maritime vessel. Male, 35 years old. Chief complaint: witnessed tonic-clonic seizure, now post-ictal and confused. Known epilepsy, takes levetiracetam but missed doses. No allergies. Non-smoker. Vital signs: O2 97%, HR 98, BP 128/82, RR 18, Temp 37.1°C, AVPU Voice. Rules: reply in 1-2 short sentences in Arabic. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 35, post-ictal after witnessed seizure. Known epilepsy on levetiracetam, missed doses. Fixed values: O2 97%, HR 98 bpm, BP 128/82 mmHg, RR 18, Temp 37.1°C, AVPU Voice. GCS 13, no head injury, tongue laceration noted, no focal neuro deficit. Rules: reply in 1-2 short sentences in French. Give only the specific finding asked. No diagnoses.",
    },
    # 42
    {
        "name": "Persian patient / English MO — constipation + abdominal bloating",
        "slug": "constipation_fa_en",
        "p_lang": "Persian",
        "mo_lang": "English",
        "symptom": "چند روزه که نتوانستم به دستشویی بروم و شکمم خیلی باد کرده و درد دارم",
        "patient_system": "You are a patient on a maritime vessel. Male, 45 years old. Chief complaint: no bowel movement for 4 days, abdominal bloating and pain. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 78, BP 124/80, RR 16, Temp 37.0°C, AVPU Alert. Rules: reply in 1-2 short sentences in Persian (Farsi). Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 45, constipation for 4 days with bloating. Fixed values: O2 99%, HR 78 bpm, BP 124/80 mmHg, RR 16, Temp 37.0°C, AVPU Alert. Abdomen: distended, diffuse mild tenderness, bowel sounds reduced, no rebound or guarding. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 43
    {
        "name": "Swahili patient / English MO — jellyfish sting",
        "slug": "sting_sw_en",
        "p_lang": "Swahili",
        "mo_lang": "English",
        "symptom": "Nilichomwa na ubiyubee wakati nilikuwa nikifanya kazi, ngozi yangu inawaka moto na inauma sana",
        "patient_system": "You are a patient on a maritime vessel. Male, 22 years old. Chief complaint: jellyfish sting to forearm while working, burning pain and skin reaction. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 92, BP 120/76, RR 16, Temp 37.0°C, AVPU Alert. Rules: reply in 1-2 short sentences in Swahili. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 22, jellyfish sting to left forearm. Fixed values: O2 99%, HR 92 bpm, BP 120/76 mmHg, RR 16, Temp 37.0°C, AVPU Alert. Left forearm: linear wheal marks, erythema, no systemic anaphylaxis signs, no hypotension. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 44
    {
        "name": "Filipino patient / Spanish MO — elbow pain after impact",
        "slug": "elbow_fil_es",
        "p_lang": "Filipino",
        "mo_lang": "Spanish",
        "symptom": "Nabangga ang siko ko sa makinarya at hindi ko na maituwid ang braso, masakit na masakit",
        "patient_system": "You are a patient on a maritime vessel. Male, 33 years old. Chief complaint: elbow injury after impact with machinery, cannot extend arm. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 90, BP 124/78, RR 16, Temp 36.8°C, AVPU Alert. Rules: reply in 1-2 short sentences in Filipino (Tagalog). Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 33, left elbow injury from machinery impact. Fixed values: O2 99%, HR 90 bpm, BP 124/78 mmHg, RR 16, Temp 36.8°C, AVPU Alert. Left elbow: swollen, tender over olecranon, extension limited to 30°, neurovascular intact distally. Rules: reply in 1-2 short sentences in Spanish. Give only the specific finding asked. No diagnoses.",
    },
    # 45
    {
        "name": "Indonesian patient / French MO — shoulder dislocation",
        "slug": "shoulder_id_fr",
        "p_lang": "Indonesian",
        "mo_lang": "French",
        "symptom": "Bahu saya terasa lepas setelah jatuh dan bentuknya aneh, tidak bisa digerakkan sama sekali",
        "patient_system": "You are a patient on a maritime vessel. Male, 26 years old. Chief complaint: left shoulder dislocation after fall, abnormal shape and unable to move. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 104, BP 126/80, RR 17, Temp 36.9°C, AVPU Alert. Rules: reply in 1-2 short sentences in Indonesian. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 26, suspected left shoulder dislocation. Fixed values: O2 99%, HR 104 bpm, BP 126/80 mmHg, RR 17, Temp 36.9°C, AVPU Alert. Left shoulder: flattened deltoid contour, arm held in abduction and external rotation, distal neurovascular intact. Rules: reply in 1-2 short sentences in French. Give only the specific finding asked. No diagnoses.",
    },
    # 46
    {
        "name": "Malay patient / Dutch MO — ankle fracture",
        "slug": "ankle_ms_nl",
        "p_lang": "Malay",
        "mo_lang": "Dutch",
        "symptom": "Saya tergelincir pada tangga dan buku lali saya bengkak teruk, tidak boleh berjalan langsung",
        "patient_system": "You are a patient on a maritime vessel. Female, 35 years old. Chief complaint: slipped on stairs, right ankle very swollen and unable to walk. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 96, BP 118/74, RR 17, Temp 36.8°C, AVPU Alert. Rules: reply in 1-2 short sentences in Malay. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: female, 35, right ankle injury after stair fall. Fixed values: O2 99%, HR 96 bpm, BP 118/74 mmHg, RR 17, Temp 36.8°C, AVPU Alert. Right ankle: significant swelling, bony tenderness over distal fibula, Ottawa rules positive, neurovascular intact. Rules: reply in 1-2 short sentences in Dutch. Give only the specific finding asked. No diagnoses.",
    },
    # 47
    {
        "name": "Thai patient / English MO — blunt abdominal trauma",
        "slug": "trauma_th_en",
        "p_lang": "Thai",
        "mo_lang": "English",
        "symptom": "ฉันถูกของหนักกระแทกที่ท้อง ปวดมากและหายใจลำบาก",
        "patient_system": "You are a patient on a maritime vessel. Male, 37 years old. Chief complaint: blunt abdominal trauma from falling cargo, severe pain and difficulty breathing. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 96%, HR 110, BP 108/70, RR 24, Temp 37.0°C, AVPU Alert. Rules: reply in 1-2 short sentences in Thai. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 37, blunt abdominal trauma from cargo. Fixed values: O2 96%, HR 110 bpm, BP 108/70 mmHg, RR 24, Temp 37.0°C, AVPU Alert. Abdomen: bruising left upper quadrant, guarding, no rigidity, breath sounds equal bilaterally. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 48
    {
        "name": "Vietnamese patient / Spanish MO — corneal abrasion",
        "slug": "cornea_vi_es",
        "p_lang": "Vietnamese",
        "mo_lang": "Spanish",
        "symptom": "Có gì đó bay vào mắt tôi và bây giờ mắt đau dữ dội, chảy nước mắt và nhìn mờ",
        "patient_system": "You are a patient on a maritime vessel. Male, 29 years old. Chief complaint: foreign object flew into right eye, severe pain, tearing and blurred vision. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 86, BP 120/76, RR 16, Temp 36.7°C, AVPU Alert. Rules: reply in 1-2 short sentences in Vietnamese. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 29, right eye injury. Fixed values: O2 99%, HR 86 bpm, BP 120/76 mmHg, RR 16, Temp 36.7°C, AVPU Alert. Right eye: photophobia, tearing, fluorescein staining shows corneal abrasion, no penetrating injury, no foreign body retained. Rules: reply in 1-2 short sentences in Spanish. Give only the specific finding asked. No diagnoses.",
    },
    # 49
    {
        "name": "Japanese patient / French MO — hypoglycaemia",
        "slug": "hypoglycemia_ja_fr",
        "p_lang": "Japanese",
        "mo_lang": "French",
        "symptom": "ひどく震えて、冷や汗をかいていて、頭がぼーっとして立っていられません",
        "patient_system": "You are a patient on a maritime vessel. Male, 60 years old. Chief complaint: trembling, cold sweat and confusion, cannot stand. Known type 1 diabetes, takes insulin. No allergies. Non-smoker. Vital signs: O2 99%, HR 108, BP 118/72, RR 17, Temp 36.5°C, AVPU Voice. Rules: reply in 1-2 short sentences in Japanese. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 60, hypoglycaemia episode. Known T1DM on insulin. Fixed values: O2 99%, HR 108 bpm, BP 118/72 mmHg, RR 17, Temp 36.5°C, AVPU Voice. Blood glucose 2.4 mmol/L. Diaphoretic, tremulous, GCS 13, no focal neuro signs. Rules: reply in 1-2 short sentences in French. Give only the specific finding asked. No diagnoses.",
    },
    # 50
    {
        "name": "Korean patient / German MO — panic attack",
        "slug": "panic_ko_de",
        "p_lang": "Korean",
        "mo_lang": "German",
        "symptom": "갑자기 심장이 엄청 빠르게 뛰고 숨을 못 쉬겠고 죽을 것 같은 느낌이 들어요",
        "patient_system": "You are a patient on a maritime vessel. Female, 23 years old. Chief complaint: sudden rapid heartbeat, cannot breathe, feeling of impending doom. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 126, BP 130/86, RR 26, Temp 36.9°C, AVPU Alert. Rules: reply in 1-2 short sentences in Korean. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: female, 23, acute anxiety and palpitations. Fixed values: O2 99%, HR 126 bpm, BP 130/86 mmHg, RR 26, Temp 36.9°C, AVPU Alert. Regular rhythm, no wheeze, lung fields clear, no chest wall tenderness, tingling in hands. Rules: reply in 1-2 short sentences in German. Give only the specific finding asked. No diagnoses.",
    },
    # 51
    {
        "name": "Chinese patient / Spanish MO — rib pain after impact",
        "slug": "rib_zh_es",
        "p_lang": "Chinese",
        "mo_lang": "Spanish",
        "symptom": "我被货物砸到了肋骨，呼吸的时候非常痛，深呼吸根本做不到",
        "patient_system": "You are a patient on a maritime vessel. Male, 41 years old. Chief complaint: rib injury from falling cargo, severe pain on breathing, cannot take deep breath. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 96%, HR 100, BP 130/84, RR 22, Temp 37.0°C, AVPU Alert. Rules: reply in 1-2 short sentences in Mandarin Chinese. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 41, left rib injury from cargo impact. Fixed values: O2 96%, HR 100 bpm, BP 130/84 mmHg, RR 22, Temp 37.0°C, AVPU Alert. Point tenderness ribs 5-7 left lateral chest, decreased breath sounds left base, no paradoxical movement. Rules: reply in 1-2 short sentences in Spanish. Give only the specific finding asked. No diagnoses.",
    },
    # 52
    {
        "name": "Bengali patient / French MO — hand crush injury",
        "slug": "crush_bn_fr",
        "p_lang": "Bengali",
        "mo_lang": "French",
        "symptom": "আমার হাত মেশিনের মধ্যে আটকে গিয়েছিল, এখন অনেক ফুলে গেছে এবং নাড়াতে পারছি না",
        "patient_system": "You are a patient on a maritime vessel. Male, 27 years old. Chief complaint: right hand caught in machinery, severely swollen, cannot move fingers. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 108, BP 128/82, RR 18, Temp 37.0°C, AVPU Alert. Rules: reply in 1-2 short sentences in Bengali. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 27, right hand crush injury. Fixed values: O2 99%, HR 108 bpm, BP 128/82 mmHg, RR 18, Temp 37.0°C, AVPU Alert. Right hand: diffuse swelling, multiple lacerations, reduced grip, capillary refill 3 seconds, sensation reduced in index and middle fingers. Rules: reply in 1-2 short sentences in French. Give only the specific finding asked. No diagnoses.",
    },
    # 53
    {
        "name": "Hindi patient / Russian MO — neck stiffness + fever (meningism)",
        "slug": "neck_hi_ru",
        "p_lang": "Hindi",
        "mo_lang": "Russian",
        "symptom": "मेरी गर्दन में बहुत तेज दर्द है और गर्दन बिल्कुल नहीं घुमा पा रहा, साथ में बुखार भी है",
        "patient_system": "You are a patient on a maritime vessel. Male, 36 years old. Chief complaint: severe neck pain and rigidity, cannot rotate head, with fever. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 86, BP 122/78, RR 16, Temp 38.3°C, AVPU Alert. Rules: reply in 1-2 short sentences in Hindi. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 36, severe neck stiffness and fever — meningism suspected. Fixed values: O2 99%, HR 86 bpm, BP 122/78 mmHg, RR 16, Temp 38.3°C, AVPU Alert. Neck rigidity present, Kernig sign positive, no rash, GCS 15, photophobia reported. Rules: reply in 1-2 short sentences in Russian. Give only the specific finding asked. No diagnoses.",
    },
    # 54
    {
        "name": "Urdu patient / English MO — hypertensive crisis",
        "slug": "hypertension_ur_en",
        "p_lang": "Urdu",
        "mo_lang": "English",
        "symptom": "میرے سر میں بہت تیز درد ہے اور آنکھوں کے سامنے اندھیرا آ رہا ہے، دل بھی بہت تیز دھڑک رہا ہے",
        "patient_system": "You are a patient on a maritime vessel. Male, 57 years old. Chief complaint: severe headache, visual disturbance and palpitations. Known hypertension, ran out of amlodipine 3 days ago. No allergies. Non-smoker. Vital signs: O2 97%, HR 98, BP 196/118, RR 18, Temp 37.1°C, AVPU Alert. Rules: reply in 1-2 short sentences in Urdu. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 57, hypertensive crisis, out of amlodipine. Fixed values: O2 97%, HR 98 bpm, BP 196/118 mmHg, RR 18, Temp 37.1°C, AVPU Alert. GCS 15, no focal neuro deficit, no papilloedema assessment available, chest clear. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 55
    {
        "name": "Tamil patient / English MO — rapid tachycardia + near-syncope",
        "slug": "palpitation_ta_en",
        "p_lang": "Tamil",
        "mo_lang": "English",
        "symptom": "என் இதயம் மிக வேகமாக துடிக்கிறது, தலை சுற்றுகிறது, கிட்டத்தட்ட மயக்கமாகிவிட்டேன்",
        "patient_system": "You are a patient on a maritime vessel. Male, 44 years old. Chief complaint: rapid palpitations, dizziness and near-fainting episode. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 98%, HR 148 (regular), BP 110/68, RR 20, Temp 37.0°C, AVPU Alert. Rules: reply in 1-2 short sentences in Tamil. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 44, rapid palpitations and near-syncope. Fixed values: O2 98%, HR 148 bpm (regular), BP 110/68 mmHg, RR 20, Temp 37.0°C, AVPU Alert. Regular narrow-complex tachycardia, no murmurs, no signs of heart failure. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 56
    {
        "name": "Georgian patient / English MO — lymphadenopathy + fever",
        "slug": "lymph_ka_en",
        "p_lang": "Georgian",
        "mo_lang": "English",
        "symptom": "კისერზე და იღლიაში ლიმფური კვანძები გამიდიდა, ტემპერატურაც მაქვს და ძალიან დამდგა",
        "patient_system": "You are a patient on a maritime vessel. Male, 31 years old. Chief complaint: swollen lymph nodes in neck and armpits, fever and fatigue for one week. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 98%, HR 94, BP 118/74, RR 17, Temp 38.5°C, AVPU Alert. Rules: reply in 1-2 short sentences in Georgian. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 31, generalised lymphadenopathy and fever for one week. Fixed values: O2 98%, HR 94 bpm, BP 118/74 mmHg, RR 17, Temp 38.5°C, AVPU Alert. Cervical and axillary lymphadenopathy bilateral, nodes mobile and tender, no splenomegaly on palpation. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 57
    {
        "name": "Kazakh patient / Russian MO — hypothermia",
        "slug": "hypothermia_kk_ru",
        "p_lang": "Kazakh",
        "mo_lang": "Russian",
        "symptom": "Мен палубада суыққа ұзақ уақыт тұрдым, қалтырап жатырмын және ойлау қиын болды",
        "patient_system": "You are a patient on a maritime vessel. Male, 34 years old. Chief complaint: prolonged cold exposure on deck, severe shivering and confusion. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 96%, HR 52, BP 102/66, RR 12, Temp 33.8°C, AVPU Voice. Rules: reply in 1-2 short sentences in Kazakh. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 34, hypothermia after cold exposure. Fixed values: O2 96%, HR 52 bpm, BP 102/66 mmHg, RR 12, Temp 33.8°C, AVPU Voice. Severe shivering, confused (GCS 13), skin cold and pale, no frostbite visible. Rules: reply in 1-2 short sentences in Russian. Give only the specific finding asked. No diagnoses.",
    },
    # 58
    {
        "name": "Azerbaijani patient / English MO — fish hook embedded in finger",
        "slug": "fishhook_az_en",
        "p_lang": "Azerbaijani",
        "mo_lang": "English",
        "symptom": "Balıq ovlayarkən çəngəl barmağıma batdı, çıxara bilmirəm, çox ağrıyır",
        "patient_system": "You are a patient on a maritime vessel. Male, 29 years old. Chief complaint: fish hook embedded in right index finger, unable to remove, severe pain. No chronic conditions, no medications. Allergic to iodine. Non-smoker. Vital signs: O2 99%, HR 88, BP 122/78, RR 16, Temp 36.8°C, AVPU Alert. Rules: reply in 1-2 short sentences in Azerbaijani. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 29, fish hook in right index finger. Iodine allergy. Fixed values: O2 99%, HR 88 bpm, BP 122/78 mmHg, RR 16, Temp 36.8°C, AVPU Alert. Hook barb embedded in dorsum of right index finger, no tendon involvement visible, neurovascular intact, no signs of infection. Rules: reply in 1-2 short sentences in English. Give only the specific finding asked. No diagnoses.",
    },
    # 59
    {
        "name": "Polish patient / German MO — migraine with aura",
        "slug": "headache_pl_de",
        "p_lang": "Polish",
        "mo_lang": "German",
        "symptom": "Mam bardzo silny ból głowy od rana, pulsujący, i widzę jakby migające światła",
        "patient_system": "You are a patient on a maritime vessel. Female, 48 years old. Chief complaint: severe throbbing headache since morning with visual aura (flashing lights). Known migraines, usually takes sumatriptan but has none left. No other conditions. Vital signs: O2 99%, HR 76, BP 158/100, RR 16, Temp 36.9°C, AVPU Alert. Rules: reply in 1-2 short sentences in Polish. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: female, 48, severe throbbing headache with visual aura. Known migraine, no sumatriptan available. Fixed values: O2 99%, HR 76 bpm, BP 158/100 mmHg, RR 16, Temp 36.9°C, AVPU Alert. GCS 15, no focal deficit, neck supple, photophobia present. Rules: reply in 1-2 short sentences in German. Give only the specific finding asked. No diagnoses.",
    },
    # 60
    {
        "name": "Greek patient / Italian MO — ankle sprain + suspected fracture",
        "slug": "ankle_gr_it",
        "p_lang": "Greek",
        "mo_lang": "Italian",
        "symptom": "Στράβωσα τον αστράγαλο μου πατώντας άσχημα και τώρα είναι πολύ πρησμένος και δεν μπορώ να περπατήσω",
        "patient_system": "You are a patient on a maritime vessel. Male, 38 years old. Chief complaint: right ankle twisted, now very swollen, cannot walk. No chronic conditions, no medications, no allergies. Non-smoker. Vital signs: O2 99%, HR 90, BP 126/80, RR 16, Temp 36.8°C, AVPU Alert. Rules: reply in 1-2 short sentences in Greek. Answer only what is asked. Never break character.",
        "mo_system": "You are a medical officer on a maritime vessel reporting clinical findings. Patient: male, 38, right ankle injury. Fixed values: O2 99%, HR 90 bpm, BP 126/80 mmHg, RR 16, Temp 36.8°C, AVPU Alert. Right ankle: marked swelling, bony tenderness posterior edge of lateral malleolus, unable to bear weight, Ottawa rules positive for X-ray. Rules: reply in 1-2 short sentences in Italian. Give only the specific finding asked. No diagnoses.",
    },
]

MAX_TURNS = 150

RUNS_DIR = os.path.join(os.path.dirname(__file__), "runs")

# ── Colours ────────────────────────────────────────────────────────────────────
RED, GREEN, YELLOW, BLUE, BOLD, NC = (
    "\033[0;31m", "\033[0;32m", "\033[1;33m",
    "\033[0;34m", "\033[1m",    "\033[0m",
)

# ANSI escape stripper for log files
import re as _re
_ANSI = _re.compile(r"\033\[[0-9;]*m")

_log_fh = None  # set per case

def p(msg=""):
    print(msg, flush=True)
    if _log_fh:
        _log_fh.write(_ANSI.sub("", msg) + "\n")
        _log_fh.flush()

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
    # Stages 1-6 = patient; stages 7-9 = medical officer
    system = case["mo_system"] if stage >= 7 else case["patient_system"]
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
        if m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str) and m.get("content")
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

# ── Run one case ───────────────────────────────────────────────────────────────

def run_case(case, access, refresh):
    global _log_fh
    log_path = os.path.join(RUNS_DIR, f"{case['slug']}.txt")
    _log_fh = open(log_path, "w", encoding="utf-8")
    try:
        return _run_case_inner(case, access, refresh)
    finally:
        _log_fh.close()
        _log_fh = None

def _run_case_inner(case, access, refresh):
    p(f"\n{BOLD}{BLUE}{'═'*60}{NC}")
    p(f"{BOLD}{BLUE}  {case['name']}{NC}")
    p(f"{BOLD}{BLUE}{'═'*60}{NC}")
    p(f"  Symptom: {case['symptom']}\n")

    # Start interview
    code, body, ms = api(
        "/ai/interview/chat",
        {"patientLanguage": case["p_lang"], "medicalOfficerLanguage": case["mo_lang"]},
        access,
    )
    if code != 200:
        p(f"  {RED}Failed to start ({code}): {body}{NC}")
        return False, refresh

    state   = body["state"]
    reply   = body.get("reply", "")
    p(f"  {GREEN}✓ Started  ({ms*1000:.0f}ms){NC}\n")

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
            if prev_stage == -1:
                p(f"  Marina: {reply}")
            prev_stage = stage

        if done:
            p(f"\n  {GREEN}{BOLD}Interview complete after {turn - 1} turns.{NC}")
            return True, refresh

        # Proactive token refresh at 12 min
        if time.monotonic() - token_time > 720:
            code, rbody, rms = api("/auth/refresh", {"refresh_token": refresh})
            if code == 200:
                access     = rbody.get("access_token", access)
                refresh    = rbody.get("refresh_token", refresh)
                token_time = time.monotonic()
                p(f"  {YELLOW}[token refreshed]{NC}")
            else:
                p(f"  {RED}Token refresh failed{NC}")
                return False, refresh

        message = llm_reply(stage, reply, case)

        role = "MO" if stage >= 7 else "Pt"
        p(f"  {YELLOW}[{role}] {message}{NC}")

        code, resp, ms = api("/ai/interview/chat", {"state": state, "message": message}, access)

        if code != 200:
            p(f"  {RED}HTTP {code}: {resp.get('error', resp)}{NC}")
            if "details" in resp:
                p(f"  {RED}Details: {json.dumps(resp['details'], indent=2)}{NC}")
            return False, refresh

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
            return True, refresh

    p(f"  {RED}Reached {MAX_TURNS} turns without completing.{NC}")
    return False, refresh

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    # Optional: run a single case by number (1-based)
    only = None
    if len(sys.argv) > 1:
        try:
            only = int(sys.argv[1]) - 1
        except ValueError:
            p(f"{RED}Usage: python3 tests/simple_test.py [1-{len(CASES)}]{NC}")
            sys.exit(1)

    cases_to_run = [CASES[only]] if only is not None else CASES

    p(f"\n{BOLD}{BLUE}Marina Interview Test — {len(cases_to_run)} case(s){NC}")
    p(f"{BOLD}{BLUE}{BASE}{NC}")
    p(f"  Email : {EMAIL}")
    p(f"  Model : {NEBIUS_MODEL}\n")

    if not NEBIUS_KEY:
        p(f"{RED}ERROR: NEBIUS_API_KEY not found in .env{NC}")
        sys.exit(1)

    # ── Login (once for all cases) ────────────────────────────────────────────
    p(f"{BOLD}── Login ──{NC}")
    code, body, ms = api("/auth/login", {"email": EMAIL, "password": PASSWORD})
    if code != 200:
        p(f"{RED}Login failed ({code}): {body}{NC}")
        sys.exit(1)
    access  = body["access_token"]
    refresh = body.get("refresh_token", "")
    p(f"  {GREEN}✓ Logged in  ({ms*1000:.0f}ms){NC}")

    results = []
    for i, case in enumerate(cases_to_run):
        ok, refresh = run_case(case, access, refresh)
        results.append((case["name"], ok))

    # ── Summary ───────────────────────────────────────────────────────────────
    p(f"\n{BOLD}{'═'*60}{NC}")
    p(f"{BOLD}  Results{NC}")
    p(f"{BOLD}{'═'*60}{NC}")
    for name, ok in results:
        icon = f"{GREEN}✓{NC}" if ok else f"{RED}✗{NC}"
        p(f"  {icon}  {name}")
    passed = sum(1 for _, ok in results if ok)
    p(f"\n  {passed}/{len(results)} passed\n")
    if passed < len(results):
        sys.exit(1)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        p(f"\n{YELLOW}Interrupted.{NC}")
        sys.exit(1)
