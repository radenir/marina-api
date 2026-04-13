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

    # ── 1. Temperature reported in Fahrenheit — extract plain number as stated ─
    Scenario(
        id=1,
        name="Temperature reported in Fahrenheit — extract number as stated",
        conversation=[
            {"role": "user",      "content": "I feel very hot and have chills"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Fever. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "97"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "102"},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "124/80"},
            {"role": "assistant", "content": "Respiratory rate?"},
            {"role": "user",      "content": "20"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "101.3 degrees Fahrenheit"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Alert"},
        ],
        expect_pathway="Fever",
        expect_avpu="Alert",
        expect_vitals_present=["bodyTemperature", "heartRate", "oxygenSaturation"],
        forbidden_strings=["fahrenheit", "°f", "degrees f"],
        notes="Body temperature must be '101.3' — plain number, no unit, no conversion",
    ),

    # ── 2. Blood pressure given verbally in words ─────────────────────────────
    Scenario(
        id=2,
        name="BP given verbally in words — extract correct numbers",
        conversation=[
            {"role": "user",      "content": "I have chest pain"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Chest pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "95"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "108"},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "one hundred and fifty over ninety five"},
            {"role": "assistant", "content": "Respiratory rate?"},
            {"role": "user",      "content": "22"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "37.2"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Alert"},
        ],
        expect_pathway="Chest pain",
        expect_avpu="Alert",
        expect_vitals_present=["bloodPressureSystolic", "bloodPressureDiastolic", "heartRate"],
        forbidden_strings=["one hundred", "ninety five", "hundred and fifty"],
        notes="Verbal BP 'one hundred and fifty over ninety five' → systolic='150', diastolic='95'",
    ),

    # ── 3. All investigation results negative ─────────────────────────────────
    Scenario(
        id=3,
        name="All investigation results negative — must be documented not omitted",
        conversation=[
            {"role": "user",      "content": "I have fever and abdominal pain"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Fever. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, CRP result?"},
            {"role": "user",      "content": "CRP is 3, normal range"},
            {"role": "assistant", "content": "Malaria test?"},
            {"role": "user",      "content": "Negative"},
            {"role": "assistant", "content": "Pregnancy test?"},
            {"role": "user",      "content": "Negative"},
        ],
        expect_pathway="Fever",
        expect_empty_vitals=True,
        require_strings=["crp", "malaria", "negative"],
        notes="All three tests run but all negative — must appear in investigations with results",
    ),

    # ── 4. Physical exam — all findings normal ────────────────────────────────
    Scenario(
        id=4,
        name="Physical exam conducted — all findings normal",
        conversation=[
            {"role": "user",      "content": "I have abdominal pain"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Abdominal Pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, is the abdomen rigid?"},
            {"role": "user",      "content": "No, abdomen is soft"},
            {"role": "assistant", "content": "Any guarding?"},
            {"role": "user",      "content": "No guarding"},
            {"role": "assistant", "content": "Rebound tenderness?"},
            {"role": "user",      "content": "No rebound tenderness"},
            {"role": "assistant", "content": "Bowel sounds?"},
            {"role": "user",      "content": "Present and normal"},
            {"role": "assistant", "content": "Capillary refill time?"},
            {"role": "user",      "content": "Less than 2 seconds, normal"},
        ],
        expect_pathway="Abdominal Pain",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        require_strings=["soft", "no guarding", "bowel"],
        notes="Exam was conducted — must contain actual findings even though all are normal",
    ),

    # ── 5. AVPU described in words not keyword ────────────────────────────────
    Scenario(
        id=5,
        name="AVPU described as 'responds to voice stimuli' — must map to Voice",
        conversation=[
            {"role": "user",      "content": "Patient is very drowsy after a fall"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Trauma. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "96"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "88"},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "118/74"},
            {"role": "assistant", "content": "Respiratory rate?"},
            {"role": "user",      "content": "16"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "36.9"},
            {"role": "assistant", "content": "AVPU — level of consciousness?"},
            {"role": "user",      "content": "He responds to voice stimuli, opens eyes when I call his name"},
        ],
        expect_pathway="Trauma",
        expect_avpu="Voice",
        expect_vitals_present=["heartRate", "oxygenSaturation", "bloodPressureSystolic"],
        notes="'Responds to voice stimuli' must map to AVPU='Voice', not 'Alert'",
    ),

    # ── 6. Patient spontaneously mentions prior MI outside PMH stage ──────────
    Scenario(
        id=6,
        name="Patient volunteers prior MI during medications stage — must be captured",
        conversation=[
            {"role": "user",      "content": "I have chest pain"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Chest pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "61, male"},
            {"role": "assistant", "content": "Any previous illnesses?"},
            {"role": "user",      "content": "No"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "Aspirin 100mg daily — I take it since my heart attack three years ago"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "No known allergies"},
        ],
        expect_pathway="Chest pain",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["aspirin", "heart attack"],
        notes="Heart attack mentioned during medications stage must appear — either in medications or additionalNotes",
    ),

    # ── 7. Thai patient — entire output must be English ───────────────────────
    Scenario(
        id=7,
        name="Thai patient — output fully in English",
        conversation=[
            {"role": "user",      "content": "ปวดท้องมากเลย"},
            {"role": "assistant", "content": "ถ้าฉันเข้าใจถูกต้อง อาการหลักคือปวดท้อง ใช่ไหม?"},
            {"role": "user",      "content": "ใช่"},
            {"role": "assistant", "content": "อายุเท่าไหร่?"},
            {"role": "user",      "content": "38 ปี ผู้ชาย"},
            {"role": "assistant", "content": "เริ่มปวดเมื่อไหร่?"},
            {"role": "user",      "content": "เมื่อคืน ประมาณ 6 ชั่วโมงที่แล้ว"},
            {"role": "assistant", "content": "ปวดที่ไหนมากที่สุด?"},
            {"role": "user",      "content": "ปวดที่ท้องน้อยขวา"},
            {"role": "assistant", "content": "มีคลื่นไส้ไหม?"},
            {"role": "user",      "content": "มี คลื่นไส้มาก"},
            {"role": "assistant", "content": "กินยาอะไรอยู่บ้าง?"},
            {"role": "user",      "content": "ไม่ได้กินยาอะไร"},
            {"role": "assistant", "content": "แพ้ยาอะไรบ้างไหม?"},
            {"role": "user",      "content": "ไม่แพ้"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "99"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "91"},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "122/78"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "38.3"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Alert"},
        ],
        expect_pathway="Abdominal Pain",
        expect_avpu="Alert",
        expect_vitals_present=["heartRate", "oxygenSaturation", "bloodPressureSystolic", "bodyTemperature"],
        forbidden_strings=["ปวด", "ท้อง", "ใช่", "คลื่น", "ยา", "แพ้"],
        notes="All Thai must be translated to English — location, symptoms, demographics",
    ),

    # ── 8. Complex oncology medication names must appear exactly ──────────────
    Scenario(
        id=8,
        name="Complex medication names — must not be mangled or omitted",
        conversation=[
            {"role": "user",      "content": "I have severe fatigue"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Fatigue or Exhaustion. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "54, female"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "Rivaroxaban 20mg daily, methotrexate 15mg once weekly, prednisolone 5mg daily, folic acid 5mg daily"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "Sulfonamides — causes rash and swelling"},
        ],
        expect_pathway="Fatigue or Exhaustion",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["rivaroxaban", "methotrexate", "prednisolone", "folic acid", "sulfonamide"],
        notes="Complex drug and allergen names must appear verbatim, not paraphrased",
    ),

    # ── 9. MO says BP is "normal" without giving numbers ─────────────────────
    Scenario(
        id=9,
        name="MO reports BP as 'normal' without numbers — BP fields must be empty",
        conversation=[
            {"role": "user",      "content": "I have a headache"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Headache. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "98"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "74"},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "Looks normal to me, I didn't write it down"},
            {"role": "assistant", "content": "Respiratory rate?"},
            {"role": "user",      "content": "15"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "36.8"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Alert"},
        ],
        expect_pathway="Headache",
        expect_avpu="Alert",
        expect_vitals_present=["heartRate", "oxygenSaturation", "respirationRate", "bodyTemperature"],
        forbidden_strings=["120", "130", "140", "80", "90", "70"],
        notes="BP not measured numerically — bloodPressureSystolic and bloodPressureDiastolic must be empty string",
    ),

    # ── 10. MO corrects a vital sign mid-reading ──────────────────────────────
    Scenario(
        id=10,
        name="MO corrects heart rate mid-reading — final corrected value must be used",
        conversation=[
            {"role": "user",      "content": "Patient is unconscious"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Altered Consciousness or Confusion. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "94"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "Heart rate is 45 — wait, sorry, I miscounted. It's 54."},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "88/58"},
            {"role": "assistant", "content": "Respiratory rate?"},
            {"role": "user",      "content": "10"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "35.6"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Unresponsive"},
        ],
        expect_pathway="Altered Consciousness or Confusion",
        expect_avpu="Unresponsive",
        expect_vitals_present=["heartRate", "oxygenSaturation", "bloodPressureSystolic"],
        forbidden_strings=["\"heartRate\": \"45\"", "'heartRate': '45'"],
        notes="MO self-corrected HR from 45 to 54 — heartRate must be '54' not '45'",
    ),

    # ── 11. SpO2 with decimal point ────────────────────────────────────────────
    Scenario(
        id=11,
        name="SpO2 reported with decimal — extract as-is",
        conversation=[
            {"role": "user",      "content": "I have shortness of breath"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Shortness of Breath. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "97.5"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "96"},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "132/84"},
            {"role": "assistant", "content": "Respiratory rate?"},
            {"role": "user",      "content": "21"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "37.0"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Alert"},
        ],
        expect_pathway="Shortness of Breath",
        expect_avpu="Alert",
        expect_vitals_present=["oxygenSaturation", "heartRate", "bloodPressureSystolic"],
        require_strings=["97.5"],
        notes="SpO2 97.5 must be stored as '97.5', not rounded to '97' or '98'",
    ),

    # ── 12. Patient refuses to disclose allergies ─────────────────────────────
    Scenario(
        id=12,
        name="Patient refuses to answer allergies question — must not write 'No known allergies'",
        conversation=[
            {"role": "user",      "content": "I have back pain"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Back Pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "40, male"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "None"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "I'd rather not say"},
        ],
        expect_pathway="Back Pain",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        forbidden_strings=["no known allergies", "none reported"],
        notes="Patient refused to disclose allergies — must document the refusal, not assume none",
    ),

    # ── 13. Iodine contrast allergy with specific reaction ────────────────────
    Scenario(
        id=13,
        name="Iodine contrast allergy — allergen and reaction type must be exact",
        conversation=[
            {"role": "user",      "content": "I feel very unwell, nausea and dizziness"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Nausea and Vomiting. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "49, female"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "Omeprazole 20mg once daily"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "Yes — iodine contrast dye. Last time I had a CT scan with contrast I went into anaphylactic shock."},
        ],
        expect_pathway="Nausea and Vomiting",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["iodine", "anaphylactic"],
        forbidden_strings=["no known allergies"],
        notes="Allergen 'iodine contrast dye' and reaction 'anaphylactic shock' must both appear",
    ),

    # ── 14. Multiple chronic conditions in past medical history ───────────────
    Scenario(
        id=14,
        name="Multiple chronic conditions in PMH — all must be captured",
        conversation=[
            {"role": "user",      "content": "I have chest pain"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Chest pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "68, male"},
            {"role": "assistant", "content": "Any previous illnesses or chronic conditions?"},
            {"role": "user",      "content": "I have type 2 diabetes, high blood pressure, chronic kidney disease stage 3, and I had a bypass surgery four years ago"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "Metformin 1000mg twice daily, amlodipine 10mg, ramipril 5mg"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "No"},
        ],
        expect_pathway="Chest pain",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["diabetes", "blood pressure", "kidney", "bypass"],
        notes="All four conditions plus surgical history must appear in pastMedicalHistory",
    ),

    # ── 15. Arabic patient — all output must be English ───────────────────────
    Scenario(
        id=15,
        name="Arabic patient — output fully in English",
        conversation=[
            {"role": "user",      "content": "أشعر بألم شديد في صدري"},
            {"role": "assistant", "content": "إذا فهمت بشكل صحيح، الشكوى الرئيسية هي ألم في الصدر. هل تؤكد؟"},
            {"role": "user",      "content": "نعم"},
            {"role": "assistant", "content": "كم عمرك؟"},
            {"role": "user",      "content": "55 سنة، رجل"},
            {"role": "assistant", "content": "متى بدأ الألم؟"},
            {"role": "user",      "content": "منذ ساعة تقريباً"},
            {"role": "assistant", "content": "هل ينتشر الألم إلى أي مكان آخر؟"},
            {"role": "user",      "content": "نعم، إلى الذراع الأيسر والفك"},
            {"role": "assistant", "content": "هل لديك ضيق في التنفس؟"},
            {"role": "user",      "content": "نعم، ضيق تنفس شديد"},
            {"role": "assistant", "content": "هل تتناول أي أدوية؟"},
            {"role": "user",      "content": "أسبرين 100 ملغ يومياً"},
            {"role": "assistant", "content": "هل لديك حساسية من أي شيء؟"},
            {"role": "user",      "content": "لا"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "91"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "116"},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "92/60"},
            {"role": "assistant", "content": "Respiratory rate?"},
            {"role": "user",      "content": "26"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "37.1"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Alert"},
        ],
        expect_pathway="Chest pain",
        expect_avpu="Alert",
        expect_vitals_present=["heartRate", "oxygenSaturation", "bloodPressureSystolic"],
        forbidden_strings=["ألم", "صدر", "نعم", "الذراع", "سنة"],
        notes="All Arabic must be translated — radiation to left arm and jaw must appear in English",
    ),

    # ── 16. Patient vague about medications — document as stated ──────────────
    Scenario(
        id=16,
        name="Patient vague about medications — must document as stated, not hallucinate names",
        conversation=[
            {"role": "user",      "content": "I have palpitations"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Palpitations or Irregular Heartbeat. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "52, male"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "Some pills for my heart and blood pressure but I don't remember their names. I take them every morning."},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "No"},
        ],
        expect_pathway="Palpitations or Irregular Heartbeat",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        forbidden_strings=["bisoprolol", "metoprolol", "amlodipine", "lisinopril", "ramipril",
                           "atenolol", "carvedilol", "no current medications"],
        notes="Patient does not know drug names — model must not hallucinate specific names",
    ),

    # ── 17. Investigations with units in results ───────────────────────────────
    Scenario(
        id=17,
        name="Investigation results include units — capture result as stated",
        conversation=[
            {"role": "user",      "content": "I have fever"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Fever. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, CRP result?"},
            {"role": "user",      "content": "CRP is 87 mg/L"},
            {"role": "assistant", "content": "Blood glucose?"},
            {"role": "user",      "content": "Blood glucose 11.2 mmol/L"},
            {"role": "assistant", "content": "Malaria test?"},
            {"role": "user",      "content": "Positive — falciparum malaria"},
        ],
        expect_pathway="Fever",
        expect_empty_vitals=True,
        require_strings=["87", "11.2", "malaria", "positive"],
        notes="Results with units (mg/L, mmol/L) and qualitative results must all be captured",
    ),

    # ── 18. French–English code-switching patient ──────────────────────────────
    Scenario(
        id=18,
        name="French–English code-switching patient — output fully in English",
        conversation=[
            {"role": "user",      "content": "I have une douleur terrible dans la tête"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Headache. Do you confirm?"},
            {"role": "user",      "content": "Oui, yes, very bad"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "J'ai 33 ans, I'm a woman"},
            {"role": "assistant", "content": "When did it start?"},
            {"role": "user",      "content": "Ce matin, this morning, around six hours ago"},
            {"role": "assistant", "content": "Do you have nausea?"},
            {"role": "user",      "content": "Oui — nausea oui"},
            {"role": "assistant", "content": "Any sensitivity to light?"},
            {"role": "user",      "content": "Oui, la lumière me fait très mal"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "Sumatriptan 50mg, I take it for migraines"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "Non, no allergies"},
        ],
        expect_pathway="Headache",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        forbidden_strings=["douleur", "tête", "lumière", "très mal", "ce matin", "j'ai"],
        require_strings=["sumatriptan", "nausea", "light"],
        notes="Mixed French/English — French portions must be translated, English kept as-is",
    ),

    # ── 19. Long medication list with morning/evening timing ──────────────────
    Scenario(
        id=19,
        name="Detailed medication schedule — timing and doses must all appear",
        conversation=[
            {"role": "user",      "content": "I have dizziness"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Dizziness/Vertigo. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "71, female"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "Metformin 500mg twice daily with meals, lisinopril 10mg every morning, atorvastatin 40mg every evening, aspirin 100mg every morning, omeprazole 20mg every morning before food"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "Penicillin — gives me a rash"},
        ],
        expect_pathway="Dizziness/Vertigo",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["metformin", "lisinopril", "atorvastatin", "aspirin", "omeprazole", "penicillin"],
        notes="All five medications and penicillin allergy must appear with doses",
    ),

    # ── 20. Patient confirms symptom then session cut off immediately ─────────
    Scenario(
        id=20,
        name="Session cut off right after symptom confirmed — all fields Not assessed or empty",
        conversation=[
            {"role": "user",      "content": "I have a severe rash"},
            {"role": "assistant", "content": "Can you describe the rash?"},
            {"role": "user",      "content": "It appeared suddenly all over my arms and chest"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Skin Infections/Rash. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
        ],
        expect_pathway="Skin Infections/Rash",
        expect_empty_vitals=True,
        expect_not_assessed=["medications", "allergies", "pastMedicalHistory"],
        expect_no_investigations=True,
        expect_no_exam=True,
        notes="Only stage 1 completed — everything beyond pathway must be Not assessed/empty",
    ),
]
