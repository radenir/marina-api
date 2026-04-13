"""
Test scenarios for POST /ai/interview/extract.
Each scenario defines a conversationHistory and what the output must / must not contain.
"""

from dataclasses import dataclass, field


@dataclass
class Scenario:
    id: int
    name: str
    conversation: list[dict]
    # ── expectations ──────────────────────────────────────────────────────────
    expect_pathway: str = ""
    # vital fields that MUST be non-empty
    expect_vitals_present: list[str] = field(default_factory=list)
    # all numeric vital fields must be empty (vitals not taken)
    expect_empty_vitals: bool = False
    expect_avpu: str = ""                   # exact value or "" to skip
    expect_supplemental_oxygen: str = ""    # "Yes", "No", or "" to skip
    # top-level fields expected to contain "Not assessed"
    expect_not_assessed: list[str] = field(default_factory=list)
    expect_no_investigations: bool = False
    expect_no_exam: bool = False
    # strings that must NOT appear anywhere in the JSON output
    forbidden_strings: list[str] = field(default_factory=list)
    # strings that MUST appear somewhere in the JSON output (positive content checks)
    require_strings: list[str] = field(default_factory=list)
    notes: str = ""


SCENARIOS: list[Scenario] = [

    # ── 1. Unconscious patient — all history narrated by MO ──────────────────
    # Patient cannot respond. MO narrates the entire scenario including PMH from
    # a cabin mate. All patient-stage responses come from the MO.
    Scenario(
        id=1,
        name="Unconscious patient — MO narrates entire history, no patient responses",
        conversation=[
            {"role": "assistant", "content": "What is the main complaint?"},
            {"role": "user",      "content": "Patient is completely unconscious — found on the floor of his cabin 15 minutes ago. He is not responding to anything."},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Altered Consciousness or Confusion. Do you confirm?"},
            {"role": "user",      "content": "Yes, confirmed."},
            {"role": "assistant", "content": "Any known medical history?"},
            {"role": "user",      "content": "His cabin mate says he is diabetic and takes insulin. He was found next to an empty bottle of alcohol."},
            {"role": "assistant", "content": "Any known medications?"},
            {"role": "user",      "content": "Insulin — type and dose unknown. No other medications found in the cabin."},
            {"role": "assistant", "content": "Any known allergies?"},
            {"role": "user",      "content": "Unknown — patient cannot respond and the cabin mate does not know."},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "82"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "56"},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "100/62"},
            {"role": "assistant", "content": "Respiratory rate?"},
            {"role": "user",      "content": "8"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "36.0"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Unresponsive"},
            {"role": "assistant", "content": "Is the patient on supplemental oxygen?"},
            {"role": "user",      "content": "Yes, I've placed a mask on him."},
        ],
        expect_pathway="Altered Consciousness or Confusion",
        expect_avpu="Unresponsive",
        expect_supplemental_oxygen="Yes",
        expect_vitals_present=["heartRate", "oxygenSaturation", "bloodPressureSystolic", "bodyTemperature", "respirationRate"],
        require_strings=["insulin", "diabet", "alcohol"],
        notes="MO-narrated scenario. Insulin and diabetes from cabin mate, alcohol context, all must be captured.",
    ),

    # ── 2. MO remeasures BP — use second corrected reading ───────────────────
    # MO gives first BP (190/115), then says patient moved, remeasures (152/94).
    # bloodPressureSystolic must be "152", bloodPressureDiastolic must be "94".
    Scenario(
        id=2,
        name="MO remeasures BP — use corrected second reading (152/94), not first (190/115)",
        conversation=[
            {"role": "user",      "content": "I have a severe headache"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Headache. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, blood pressure?"},
            {"role": "user",      "content": "190/115 — wait, he moved his arm mid-reading. Let me redo this properly. 152/94."},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "88"},
            {"role": "assistant", "content": "Oxygen saturation?"},
            {"role": "user",      "content": "97"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "37.3"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Alert"},
        ],
        expect_pathway="Headache",
        expect_avpu="Alert",
        expect_vitals_present=["bloodPressureSystolic", "bloodPressureDiastolic", "heartRate"],
        require_strings=["152", "94"],
        forbidden_strings=['"bloodPressureSystolic": "190"', '"bloodPressureDiastolic": "115"'],
        notes="MO remeasured — use corrected 152/94. First invalidated reading (190/115) must NOT be in vitalSigns.",
    ),

    # ── 3. Pregnancy disclosed during allergies stage ─────────────────────────
    # Patient reveals 12-week pregnancy while answering the allergies question.
    # Must be captured (in pastMedicalHistory, currentHistoryTaking, or additionalNotes).
    # allergies must be "No known allergies."
    Scenario(
        id=3,
        name="Pregnancy disclosed during allergies stage — must be captured, not lost",
        conversation=[
            {"role": "user",      "content": "I have severe nausea and vomiting"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Nausea and Vomiting. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "28, female"},
            {"role": "assistant", "content": "When did the nausea start?"},
            {"role": "user",      "content": "Two days ago, it has been constant"},
            {"role": "assistant", "content": "Have you vomited?"},
            {"role": "user",      "content": "Yes, several times a day"},
            {"role": "assistant", "content": "Any previous illnesses?"},
            {"role": "user",      "content": "No"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "Folic acid 5mg daily"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "No allergies. Oh — I should mention, I am 12 weeks pregnant."},
        ],
        expect_pathway="Nausea and Vomiting",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["pregnant", "12 weeks", "folic acid"],
        notes="Pregnancy disclosed during allergies stage must appear in the output. Prompt rule: capture PMH wherever disclosed.",
    ),

    # ── 4. Recreational drug use disclosed during medications ─────────────────
    # Patient admits to cannabis and cocaine use during the medications stage.
    # Must be documented verbatim — no editorial omission or judgement.
    Scenario(
        id=4,
        name="Recreational drug use disclosed — cannabis and cocaine must be documented as stated",
        conversation=[
            {"role": "user",      "content": "I have chest pain and palpitations"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Palpitations or Irregular Heartbeat. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "32, male"},
            {"role": "assistant", "content": "Any previous illnesses?"},
            {"role": "user",      "content": "No"},
            {"role": "assistant", "content": "Any medications or substances you take regularly?"},
            {"role": "user",      "content": "No prescribed medications. But I smoke cannabis most evenings, and last night I took about a gram of cocaine."},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "No"},
        ],
        expect_pathway="Palpitations or Irregular Heartbeat",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["cannabis", "cocaine"],
        notes="Recreational drugs must be documented without omission or editorial. Cannabis (regular) and cocaine (last night, ~1 gram) must both appear.",
    ),

    # ── 5. ECG sinus rhythm findings — verbatim capture, no 'normal ECG' label ─
    # MO reports detailed ECG findings. Model must capture verbatim.
    # Must NOT summarise as "normal ECG" or "unremarkable ECG".
    Scenario(
        id=5,
        name="ECG with detailed sinus rhythm findings — verbatim capture, no 'normal ECG' summary label",
        conversation=[
            {"role": "user",      "content": "I have chest pain"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Chest pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, ECG result?"},
            {"role": "user",      "content": "ECG shows sinus rhythm, rate 78, no ST-segment changes, no Q waves, PR interval appears normal, QRS narrow."},
            {"role": "assistant", "content": "Any other investigations?"},
            {"role": "user",      "content": "No"},
        ],
        expect_pathway="Chest pain",
        expect_empty_vitals=True,
        expect_no_exam=True,
        require_strings=["sinus rhythm", "st", "q wave"],
        forbidden_strings=["normal ecg", "ecg: normal", "unremarkable ecg", "ecg normal"],
        notes="Full ECG finding must appear verbatim. Must NOT add 'normal ECG' as a label — that is clinical interpretation.",
    ),

    # ── 6. Patient corrects wrong initial pathway confirmation ────────────────
    # Marina first proposes "Fever". Patient initially confirms, then immediately
    # retracts and says it is more like dizziness. Marina re-confirms correctly
    # as "Dizziness/Vertigo". Final pathway must be Dizziness/Vertigo.
    Scenario(
        id=6,
        name="Patient corrects initial pathway confirmation — final confirmed pathway is Dizziness/Vertigo",
        conversation=[
            {"role": "user",      "content": "I feel sick and dizzy"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Fever. Do you confirm?"},
            {"role": "user",      "content": "Yes — actually no, it is more like everything is spinning. Dizziness mostly."},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Dizziness/Vertigo. Do you confirm?"},
            {"role": "user",      "content": "Yes, exactly that"},
            {"role": "assistant", "content": "How long have you had this?"},
            {"role": "user",      "content": "Since this morning, about 6 hours"},
            {"role": "assistant", "content": "Any nausea?"},
            {"role": "user",      "content": "Yes, very nauseous"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "No"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "No"},
        ],
        expect_pathway="Dizziness",   # substring match covers "Dizziness/Vertigo"
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["spinning", "6 hours", "nausea"],
        forbidden_strings=['"pathway": "Fever"', '"pathway": "fever"'],
        notes="Pathway must be Dizziness/Vertigo (final confirmed). First incorrectly confirmed pathway (Fever) must not appear as pathway.",
    ),

    # ── 7. SpO2 as spoken words 'ninety-seven percent' ────────────────────────
    # MO reports oxygen saturation verbally. Must be extracted as "97".
    Scenario(
        id=7,
        name="SpO2 as 'ninety-seven percent' spoken — extract to plain number '97'",
        conversation=[
            {"role": "user",      "content": "I have shortness of breath"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Shortness of Breath. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "Ninety-seven percent"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "82"},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "128/78"},
            {"role": "assistant", "content": "Respiratory rate?"},
            {"role": "user",      "content": "20"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "37.4"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Alert"},
        ],
        expect_pathway="Shortness of Breath",
        expect_avpu="Alert",
        expect_vitals_present=["oxygenSaturation", "heartRate", "bloodPressureSystolic"],
        require_strings=["97"],
        forbidden_strings=["ninety", "percent", "\"97%\""],
        notes="oxygenSaturation must be '97' — verbal form converted to number, percent sign stripped.",
    ),

    # ── 8. Korean patient — full interview, all output in English ─────────────
    Scenario(
        id=8,
        name="Korean patient — full interview, all output in English",
        conversation=[
            {"role": "user",      "content": "복부 통증이 심합니다"},
            {"role": "assistant", "content": "주요 불편 사항이 복통인 것으로 이해합니다. 확인해 주시겠어요?"},
            {"role": "user",      "content": "네"},
            {"role": "assistant", "content": "나이가 어떻게 되세요?"},
            {"role": "user",      "content": "45세, 남성"},
            {"role": "assistant", "content": "통증은 언제 시작했나요?"},
            {"role": "user",      "content": "어제부터 시작했어요, 약 20시간 전"},
            {"role": "assistant", "content": "어디가 가장 아프세요?"},
            {"role": "user",      "content": "배꼽 주위에서 오른쪽 아래로 이동했어요"},
            {"role": "assistant", "content": "메스꺼움이나 구토가 있나요?"},
            {"role": "user",      "content": "네, 메스꺼움이 있어요. 구토는 한 번 했어요"},
            {"role": "assistant", "content": "이전에 아팠던 적 있나요?"},
            {"role": "user",      "content": "없어요"},
            {"role": "assistant", "content": "복용 중인 약이 있나요?"},
            {"role": "user",      "content": "없어요"},
            {"role": "assistant", "content": "알레르기가 있나요?"},
            {"role": "user",      "content": "없어요"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "98"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "96"},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "130/84"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "38.1"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Alert"},
        ],
        expect_pathway="Abdominal Pain",
        expect_avpu="Alert",
        expect_vitals_present=["heartRate", "oxygenSaturation", "bloodPressureSystolic", "bodyTemperature"],
        forbidden_strings=["복부", "통증", "네", "남성", "메스꺼움", "구토", "알레르기"],
        require_strings=["45", "nausea", "right"],
        notes="All Korean must be translated — pain migration from periumbilical to RLQ, nausea, one vomiting episode, demographics in English.",
    ),

    # ── 9. HR given as 'regular, seventy-eight beats per minute' ─────────────
    # MO gives a qualitative descriptor and verbal number for heart rate.
    # heartRate must be "78" only — no qualitative text, no word form.
    Scenario(
        id=9,
        name="HR 'regular, seventy-eight beats per minute' — extract '78', strip descriptor and word form",
        conversation=[
            {"role": "user",      "content": "I have chest pain"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Chest pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, heart rate?"},
            {"role": "user",      "content": "Regular, seventy-eight beats per minute"},
            {"role": "assistant", "content": "Oxygen saturation?"},
            {"role": "user",      "content": "96"},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "138/88"},
            {"role": "assistant", "content": "Respiratory rate?"},
            {"role": "user",      "content": "17"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "37.1"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Alert"},
        ],
        expect_pathway="Chest pain",
        expect_avpu="Alert",
        expect_vitals_present=["heartRate", "oxygenSaturation", "bloodPressureSystolic"],
        require_strings=["78"],
        forbidden_strings=["\"heartRate\": \"regular\"", "seventy", "\"heartRate\": \"regular, 78\""],
        notes="heartRate must be '78' — the word 'regular' is a rhythm qualifier, not a rate. Word form converted to digit.",
    ),

    # ── 10. Allergy info disclosed during PMH stage — must appear in allergies ─
    # Patient mentions penicillin reaction while answering the PMH question.
    # The prompt rule: capture the fact in the dedicated field regardless of stage.
    # Penicillin allergy must appear in the allergies field.
    Scenario(
        id=10,
        name="Allergy disclosed during PMH stage — must appear in allergies field",
        conversation=[
            {"role": "user",      "content": "I have a cough and high fever"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Cough/Respiratory Symptoms. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "55, male"},
            {"role": "assistant", "content": "Any previous illnesses or hospitalisations?"},
            {"role": "user",      "content": "I had pneumonia three years ago. And I should mention — I was once hospitalised after a severe reaction to penicillin."},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "Atorvastatin 20mg daily"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "Yes, the penicillin reaction I just mentioned"},
        ],
        expect_pathway="Cough/Respiratory Symptoms",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["penicillin", "pneumonia", "atorvastatin"],
        notes="Penicillin allergy was disclosed during PMH then confirmed during allergies stage — must appear in allergies field. PMH must contain pneumonia.",
    ),

    # ── 11. Temperature with °C symbol — extract plain number ─────────────────
    # MO reports "38.6°C". bodyTemperature must be "38.6" — no symbol.
    Scenario(
        id=11,
        name="Temperature '38.6°C' with symbol — extract plain number '38.6'",
        conversation=[
            {"role": "user",      "content": "I have fever and body aches"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Fever. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "96"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "104"},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "118/74"},
            {"role": "assistant", "content": "Respiratory rate?"},
            {"role": "user",      "content": "20"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "38.6°C"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Alert"},
        ],
        expect_pathway="Fever",
        expect_avpu="Alert",
        expect_vitals_present=["bodyTemperature", "heartRate", "oxygenSaturation"],
        require_strings=["38.6"],
        forbidden_strings=["°c", "celsius", "degrees c"],
        notes="bodyTemperature must be '38.6' — the °C symbol must be stripped.",
    ),

    # ── 12. Multiple corrections — patient age and MO blood pressure ──────────
    # Patient corrects age (45 → 47). MO corrects BP (155/98 → 138/88).
    # Final corrected values must be used for both.
    Scenario(
        id=12,
        name="Multiple corrections — patient corrects age (45→47), MO corrects BP (155→138/88)",
        conversation=[
            {"role": "user",      "content": "I have back pain"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Back Pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "I'm 45 — no wait, I always mix it up. I'm 47, male."},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "Naproxen 500mg when needed"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "No"},
            {"role": "assistant", "content": "Medical officer, blood pressure?"},
            {"role": "user",      "content": "Blood pressure 155/98 — wait, I had the cuff on wrong. Let me redo it: 138/88."},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "72"},
            {"role": "assistant", "content": "Oxygen saturation?"},
            {"role": "user",      "content": "98"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Alert"},
        ],
        expect_pathway="Back Pain",
        expect_avpu="Alert",
        expect_vitals_present=["bloodPressureSystolic", "bloodPressureDiastolic", "heartRate"],
        require_strings=["47", "138", "naproxen"],
        forbidden_strings=['"bloodPressureSystolic": "155"'],
        notes="Age must be 47 (not 45). BP must be 138/88 (not 155/98). Both corrections applied.",
    ),

    # ── 13. Urine dipstick with multiple parameters ───────────────────────────
    # MO reports a full dipstick panel. All five parameters must appear.
    Scenario(
        id=13,
        name="Urine dipstick with five parameters — all must be captured in investigations",
        conversation=[
            {"role": "user",      "content": "I have urinary pain and burning"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Urinary Symptoms. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, urine dipstick result?"},
            {"role": "user",      "content": "Leucocytes 2+, nitrites positive, protein trace, blood negative, glucose negative."},
            {"role": "assistant", "content": "Any other investigations?"},
            {"role": "user",      "content": "No"},
        ],
        expect_pathway="Urinary Symptoms",
        expect_empty_vitals=True,
        expect_no_exam=True,
        require_strings=["leucocytes", "nitrites", "protein", "2+", "glucose"],
        notes="All five urine dipstick parameters (leucocytes 2+, nitrites positive, protein trace, blood negative, glucose negative) must appear in investigations.",
    ),

    # ── 14. MO reports all vitals using abbreviations in one sentence ─────────
    # MO gives: "RR 18, PR 92, SpO2 96%, BP 134/86, temp 37.2, AVPU A"
    # Must resolve: RR→respirationRate, PR→heartRate, SpO2 96%→oxygenSaturation "96",
    # AVPU A→"Alert". All fields populated from single abbreviated sentence.
    Scenario(
        id=14,
        name="MO reports all vitals as abbreviations (RR, PR, SpO2, AVPU A) — extract correctly",
        conversation=[
            {"role": "user",      "content": "I have abdominal pain"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Abdominal Pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, vital signs please."},
            {"role": "user",      "content": "RR 18, PR 92, SpO2 96%, BP 134/86, temp 37.2, AVPU A."},
        ],
        expect_pathway="Abdominal Pain",
        expect_avpu="Alert",
        expect_vitals_present=["respirationRate", "heartRate", "oxygenSaturation",
                                "bloodPressureSystolic", "bodyTemperature"],
        require_strings=["18", "92", "134", "86", "37.2"],
        notes="RR→respirationRate='18', PR→heartRate='92', SpO2 96%→oxygenSaturation='96', BP→systolic/diastolic, AVPU A→'Alert'.",
    ),

    # ── 15. Prior episode of same condition in PMH ────────────────────────────
    # Patient says they had a similar chest pain episode 2 years ago (musculoskeletal).
    # That episode belongs in pastMedicalHistory.
    Scenario(
        id=15,
        name="Prior episode of same condition — must appear in pastMedicalHistory",
        conversation=[
            {"role": "user",      "content": "I have chest pain again"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Chest pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "44, male"},
            {"role": "assistant", "content": "When did the pain start?"},
            {"role": "user",      "content": "About one hour ago, sudden onset"},
            {"role": "assistant", "content": "Have you had chest pain before?"},
            {"role": "user",      "content": "Yes, two years ago a similar episode. They said it was musculoskeletal at the time."},
            {"role": "assistant", "content": "Any other previous illnesses?"},
            {"role": "user",      "content": "High blood pressure, on treatment"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "Amlodipine 5mg daily"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "No"},
        ],
        expect_pathway="Chest pain",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["musculoskeletal", "two years", "amlodipine", "blood pressure"],
        notes="Prior chest pain episode (2 years ago, diagnosed musculoskeletal) must be in pastMedicalHistory.",
    ),

    # ── 16. Pregnancy test positive in investigations — no inference ──────────
    # MO reports pregnancy test: positive. Model must capture verbatim.
    # Must NOT infer "patient is pregnant" as a clinical conclusion.
    Scenario(
        id=16,
        name="Pregnancy test positive — capture verbatim result, do not infer 'patient is pregnant'",
        conversation=[
            {"role": "user",      "content": "I have abdominal pain and nausea"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Abdominal Pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "26, female"},
            {"role": "assistant", "content": "Medical officer, pregnancy test result?"},
            {"role": "user",      "content": "Pregnancy test: positive."},
            {"role": "assistant", "content": "Blood glucose?"},
            {"role": "user",      "content": "5.4 mmol/L"},
        ],
        expect_pathway="Abdominal Pain",
        expect_empty_vitals=True,
        require_strings=["pregnancy", "positive", "5.4"],
        forbidden_strings=["patient is pregnant", "confirmed pregnant", "is pregnant"],
        notes="Test result must appear verbatim. Model must NOT add the inferred conclusion 'patient is pregnant' — only the test result was reported.",
    ),

    # ── 17. Monosyllabic patient — terse one-word answers throughout ──────────
    # Every patient response is a single word or very short phrase.
    # All information must still be extracted correctly from these terse answers.
    Scenario(
        id=17,
        name="Monosyllabic patient — one-word answers, all info must still be captured",
        conversation=[
            {"role": "user",      "content": "Headache"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Headache. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "When did it start?"},
            {"role": "user",      "content": "Morning"},
            {"role": "assistant", "content": "How severe is it on a scale of 1 to 10?"},
            {"role": "user",      "content": "9"},
            {"role": "assistant", "content": "Any nausea?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Any sensitivity to light?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Any visual disturbance?"},
            {"role": "user",      "content": "No"},
            {"role": "assistant", "content": "Any previous illnesses?"},
            {"role": "user",      "content": "No"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "Paracetamol"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "No"},
        ],
        expect_pathway="Headache",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["9", "nausea", "light", "paracetamol"],
        notes="Severity '9', nausea yes, photophobia yes, no visual disturbance, paracetamol — all must appear despite one-word responses.",
    ),

    # ── 18. Patient adds new symptom after allergies stage ───────────────────
    # After the structured interview ends, patient volunteers haematuria.
    # Must appear in additionalNotes as spontaneous late disclosure.
    Scenario(
        id=18,
        name="Patient adds haematuria after allergies stage — must appear in additionalNotes",
        conversation=[
            {"role": "user",      "content": "I have back pain"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Back Pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "52, male"},
            {"role": "assistant", "content": "When did the back pain start?"},
            {"role": "user",      "content": "Yesterday afternoon"},
            {"role": "assistant", "content": "Any previous illnesses?"},
            {"role": "user",      "content": "No"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "Ibuprofen 400mg as needed"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "No. Actually — I should tell you, I noticed blood in my urine this morning. It was bright red."},
        ],
        expect_pathway="Back Pain",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["blood", "urine", "ibuprofen"],
        notes="Haematuria volunteered after allergies stage must not be lost. Should appear in additionalNotes as late spontaneous disclosure.",
    ),

    # ── 19. Metaphorical pain description — capture verbatim ─────────────────
    # Patient describes pain as "someone squeezing my heart with a vice grip, crushing."
    # The metaphorical description must appear in currentHistoryTaking, not be replaced
    # by a generic clinical paraphrase like "pressure-type chest pain".
    Scenario(
        id=19,
        name="Metaphorical pain description — 'vice grip, crushing' must appear verbatim",
        conversation=[
            {"role": "user",      "content": "I have terrible chest pain"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Chest pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "58, male"},
            {"role": "assistant", "content": "How would you describe the pain?"},
            {"role": "user",      "content": "It feels like someone is squeezing my heart with a vice grip. Crushing."},
            {"role": "assistant", "content": "When did it start?"},
            {"role": "user",      "content": "About 30 minutes ago, came on suddenly"},
            {"role": "assistant", "content": "Does it go anywhere?"},
            {"role": "user",      "content": "Yes, into my left arm and jaw"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "Metformin 850mg twice daily, perindopril 4mg daily"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "No"},
        ],
        expect_pathway="Chest pain",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["crushing", "left arm", "jaw", "metformin", "perindopril"],
        notes="'Squeezing with a vice grip, crushing' must appear — not replaced by generic 'pressure-type pain'.",
    ),

    # ── 20. Hallucination trap — no denials for symptoms never discussed ──────
    # Marina never asks about fever, nausea, vomiting, or headache.
    # Model must NOT add "patient denies fever/nausea/vomiting/headache" to any field.
    # Only document what was actually asked and answered.
    Scenario(
        id=20,
        name="Hallucination trap — must not add denials for symptoms Marina never asked about",
        conversation=[
            {"role": "user",      "content": "I have tooth pain"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Dental Pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How long have you had the toothache?"},
            {"role": "user",      "content": "Three days"},
            {"role": "assistant", "content": "Is there swelling around the tooth?"},
            {"role": "user",      "content": "Yes, my cheek is swollen"},
            {"role": "assistant", "content": "Any sensitivity to hot or cold?"},
            {"role": "user",      "content": "Very sensitive to cold"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "Paracetamol 1g as needed"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "No"},
        ],
        expect_pathway="Dental Pain",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["swollen", "cold", "paracetamol"],
        forbidden_strings=["no fever", "denies fever", "no nausea", "denies nausea",
                           "no vomiting", "no shortness", "no headache", "no dizziness",
                           "no chest", "no palpitation"],
        notes="Marina never asked about these symptoms — model must NOT invent negative findings for symptoms that were never discussed.",
    ),

]
