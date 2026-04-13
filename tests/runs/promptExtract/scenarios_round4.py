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

    # ── 1. Smart watch HR in history — vitalSigns must use MO's measurement ───
    # Patient mentions their Garmin watch showed HR 145 during history.
    # MO later measures HR 88 in Stage 7.
    # vitalSigns.heartRate must be "88", not "145".
    # "145" must appear somewhere (in currentHistoryTaking), not be discarded.
    Scenario(
        id=1,
        name="Smart watch HR 145 in history — vitalSigns must use MO measurement of 88",
        conversation=[
            {"role": "user",      "content": "I have chest pain and my heart was racing earlier"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Chest pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "When did it start?"},
            {"role": "user",      "content": "About two hours ago. My Garmin watch showed my heart rate at 145 when it first hit."},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "96"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "88"},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "132/86"},
            {"role": "assistant", "content": "Respiratory rate?"},
            {"role": "user",      "content": "18"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "37.1"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Alert"},
        ],
        expect_pathway="Chest pain",
        expect_avpu="Alert",
        expect_vitals_present=["heartRate", "oxygenSaturation", "bloodPressureSystolic"],
        require_strings=["145"],         # watch reading must appear in history, not be lost
        forbidden_strings=['"heartRate": "145"', "'heartRate': '145'"],
        notes="vitalSigns.heartRate must be '88' (MO). Watch HR '145' must appear in currentHistoryTaking, not in vitalSigns.",
    ),

    # ── 2. Interpreter-mediated interview — all patient data in third person ───
    # MO acts as interpreter; all patient answers are relayed in third person.
    # Model must extract the patient's information despite third-person delivery.
    Scenario(
        id=2,
        name="Interpreter-mediated — MO translates patient answers in third person",
        conversation=[
            {"role": "assistant", "content": "What is the patient's main complaint?"},
            {"role": "user",      "content": "The patient doesn't speak English. She says she has severe abdominal pain."},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Abdominal Pain. Do you confirm?"},
            {"role": "user",      "content": "She confirms, yes."},
            {"role": "assistant", "content": "How old is the patient?"},
            {"role": "user",      "content": "She is 34 years old, female."},
            {"role": "assistant", "content": "When did the pain start?"},
            {"role": "user",      "content": "She says it started this morning, about 8 hours ago."},
            {"role": "assistant", "content": "Where exactly is the pain located?"},
            {"role": "user",      "content": "Lower right abdomen — she is pointing to it."},
            {"role": "assistant", "content": "Does she have nausea or vomiting?"},
            {"role": "user",      "content": "She says yes, she vomited twice this morning."},
            {"role": "assistant", "content": "Any fever?"},
            {"role": "user",      "content": "She says she feels hot and shivery."},
            {"role": "assistant", "content": "Any previous illnesses?"},
            {"role": "user",      "content": "She says no previous illnesses."},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "She takes no medications."},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "She says no known allergies."},
        ],
        expect_pathway="Abdominal Pain",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["34", "lower right", "vomit"],
        notes="MO acts as interpreter. Patient data must be extracted correctly despite third-person phrasing.",
    ),

    # ── 3. MO diagnoses 'appendicitis' — must NOT enter pathway or findings ───
    # MO confidently suggests "appendicitis" and recommends evacuation.
    # Pathway must remain "Abdominal Pain" (the confirmed patient symptom).
    # MO's diagnostic opinion and evacuation recommendation belong in additionalNotes.
    Scenario(
        id=3,
        name="MO suggests 'appendicitis' — pathway stays Abdominal Pain, diagnosis not adopted",
        conversation=[
            {"role": "user",      "content": "I have pain in my lower right belly"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Abdominal Pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "99"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "94"},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "128/82"},
            {"role": "assistant", "content": "Respiratory rate?"},
            {"role": "user",      "content": "20"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "38.2"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Alert. By the way — I'm pretty sure this is appendicitis. He has classic signs. I think we need to evacuate him immediately."},
        ],
        expect_pathway="Abdominal Pain",
        expect_avpu="Alert",
        expect_vitals_present=["heartRate", "oxygenSaturation", "bodyTemperature"],
        require_strings=["evacuat"],     # "evacuation" or "evacuate" — MO's recommendation must not be lost
        notes="Pathway must be 'Abdominal Pain', not 'appendicitis'. MO's diagnosis is an opinion — it may appear in additionalNotes but must not be the pathway or a stated clinical finding.",
    ),

    # ── 4. Patient denies fever, MO measures 39.5°C — contradiction ───────────
    # Patient explicitly denies fever during history.
    # MO objectively measures 39.5 in Stage 7.
    # Both must be documented: temp in vitalSigns, patient's denial in history/additionalNotes.
    Scenario(
        id=4,
        name="Contradiction: patient denies fever, MO measures 39.5°C",
        conversation=[
            {"role": "user",      "content": "I have a bad headache"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Headache. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Do you have any fever or chills?"},
            {"role": "user",      "content": "No, I feel fine temperature-wise — definitely no fever"},
            {"role": "assistant", "content": "Medical officer, temperature?"},
            {"role": "user",      "content": "39.5"},
            {"role": "assistant", "content": "Oxygen saturation?"},
            {"role": "user",      "content": "97"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "92"},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "126/80"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Alert"},
        ],
        expect_pathway="Headache",
        expect_avpu="Alert",
        expect_vitals_present=["bodyTemperature", "oxygenSaturation", "heartRate"],
        require_strings=["39.5", "deni"],   # "denied" or "denies" — patient's claim documented
        notes="vitalSigns.bodyTemperature must be '39.5'. Patient's denial of fever must also appear in currentHistoryTaking or additionalNotes.",
    ),

    # ── 5. Medication self-correction — final corrected value only ────────────
    # Patient initially names atorvastatin, then immediately corrects to simvastatin.
    # medications must contain simvastatin 20mg; atorvastatin must be absent.
    Scenario(
        id=5,
        name="Patient self-corrects medication: atorvastatin → simvastatin",
        conversation=[
            {"role": "user",      "content": "I have chest pain"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Chest pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "61, male"},
            {"role": "assistant", "content": "Any previous illnesses?"},
            {"role": "user",      "content": "High blood pressure, controlled."},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "Atorvastatin 40mg — oh wait, that's my wife's pills. I take simvastatin 20mg daily."},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "No known allergies"},
        ],
        expect_pathway="Chest pain",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["simvastatin"],
        notes="Patient self-corrected. medications must list simvastatin 20mg. atorvastatin must NOT appear in medications — documenting the self-correction in additionalNotes is acceptable.",
    ),

    # ── 6. AVPU given as single letter "P" — must map to 'Pain' ──────────────
    # Medical officer responds just "P" to the AVPU question.
    # This must be interpreted as AVPU = "Pain".
    Scenario(
        id=6,
        name="AVPU answer is single letter 'P' — must map to 'Pain'",
        conversation=[
            {"role": "user",      "content": "Patient collapsed on deck, head injury, not responding normally"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Trauma. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "91"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "110"},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "90/60"},
            {"role": "assistant", "content": "Respiratory rate?"},
            {"role": "user",      "content": "22"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "36.4"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "P"},
        ],
        expect_pathway="Trauma",
        expect_avpu="Pain",
        expect_vitals_present=["heartRate", "oxygenSaturation", "bloodPressureSystolic"],
        notes="Single letter 'P' must map to AVPU='Pain', not left as 'P' or misinterpreted as another value.",
    ),

    # ── 7. CRP elevated but exact value unavailable — must not fabricate ──────
    # MO says CRP machine only shows "high" — no numeric value.
    # Model must document uncertainty verbatim. Must not invent a CRP number.
    Scenario(
        id=7,
        name="CRP elevated but exact value unknown — must not fabricate a number",
        conversation=[
            {"role": "user",      "content": "I have fever and feel terrible"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Fever. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, CRP result?"},
            {"role": "user",      "content": "CRP is elevated but the machine display is broken — it only shows 'HIGH', I cannot read the exact number."},
            {"role": "assistant", "content": "Blood glucose?"},
            {"role": "user",      "content": "6.1 mmol/L"},
        ],
        expect_pathway="Fever",
        expect_empty_vitals=True,
        require_strings=["crp", "6.1"],
        forbidden_strings=["crp: 142", "crp: 150", "crp: 200", "crp: 120", "crp: 180",
                           "crp 142", "crp 150", "crp 200", "crp 120", "crp 180",
                           "crp of 142", "crp of 150"],
        notes="CRP must be documented as 'elevated / HIGH, exact value unavailable'. Must not hallucinate a CRP number.",
    ),

    # ── 8. Paracetamol overdose — substance in history, not medications ───────
    # Pathway = Poisoning/Overdose (confirmed by patient).
    # Paracetamol is the ingested substance — belongs in currentHistoryTaking.
    # medications field = regular medications (patient states none).
    Scenario(
        id=8,
        name="Paracetamol overdose — pathway Poisoning/Overdose, substance in history not medications",
        conversation=[
            {"role": "user",      "content": "I think I took too many paracetamol tablets"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Poisoning/Overdose. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How many tablets did you take?"},
            {"role": "user",      "content": "Around 20 tablets, 500mg each, about 3 hours ago"},
            {"role": "assistant", "content": "Why did you take so many?"},
            {"role": "user",      "content": "I had terrible toothache and just kept taking more"},
            {"role": "assistant", "content": "Any regular medications you take daily?"},
            {"role": "user",      "content": "No regular medications"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "No"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "98"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "88"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Alert"},
        ],
        expect_pathway="Poisoning/Overdose",
        expect_avpu="Alert",
        expect_vitals_present=["heartRate", "oxygenSaturation"],
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["paracetamol", "20", "3 hours"],
        notes="Paracetamol taken in overdose is the incident substance — it belongs in currentHistoryTaking. medications = 'Patient states no regular medications.'",
    ),

    # ── 9. BP with 'mmHg' unit — extract plain numbers only ──────────────────
    # MO reports "Blood pressure is 168/104 mmHg".
    # bloodPressureSystolic must be "168", bloodPressureDiastolic must be "104".
    # No "mmHg" unit must appear in those fields.
    Scenario(
        id=9,
        name="BP reported with 'mmHg' unit label — extract plain numbers, no unit",
        conversation=[
            {"role": "user",      "content": "I have a severe headache, worst of my life"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Headache. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "97"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "76"},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "Blood pressure is 168/104 mmHg"},
            {"role": "assistant", "content": "Respiratory rate?"},
            {"role": "user",      "content": "16"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "37.2"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Alert"},
        ],
        expect_pathway="Headache",
        expect_avpu="Alert",
        expect_vitals_present=["bloodPressureSystolic", "bloodPressureDiastolic", "heartRate"],
        require_strings=["168", "104"],
        forbidden_strings=["mmhg", "mm hg", "millimeter"],
        notes="bloodPressureSystolic='168', bloodPressureDiastolic='104'. The 'mmHg' unit must not appear in vitalSigns fields.",
    ),

    # ── 10. Patient answers "I don't know" to most history questions ──────────
    # Full history-taking stage, but patient genuinely cannot recall most details.
    # currentHistoryTaking must document these unknowns — must not be sparse or "Not assessed".
    Scenario(
        id=10,
        name="Patient cannot recall most history details — unknowns must be documented",
        conversation=[
            {"role": "user",      "content": "I feel pain in my chest"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Chest pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "When did the pain start?"},
            {"role": "user",      "content": "I don't know, I just woke up with it"},
            {"role": "assistant", "content": "Can you describe what the pain feels like?"},
            {"role": "user",      "content": "I don't know, it just hurts"},
            {"role": "assistant", "content": "Does the pain go anywhere else, like your arm or jaw?"},
            {"role": "user",      "content": "I'm not sure"},
            {"role": "assistant", "content": "On a scale of 1 to 10, how severe is the pain?"},
            {"role": "user",      "content": "I don't know, very bad I guess"},
            {"role": "assistant", "content": "Does anything make it better or worse?"},
            {"role": "user",      "content": "I don't know"},
            {"role": "assistant", "content": "Any previous illnesses?"},
            {"role": "user",      "content": "Can't remember"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "I don't think so, not sure"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "I don't know"},
        ],
        expect_pathway="Chest pain",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["unable"],
        notes="currentHistoryTaking must document patient's inability to recall each item. Must not be 'Not assessed' for currentHistoryTaking — the complaint is confirmed and patient's 'I don't know' answers are the history.",
    ),

    # ── 11. Physical exam with Murphy's sign — clinical jargon verbatim ───────
    # MO performs abdominal exam and reports "positive Murphy's sign" and RUQ findings.
    # All clinical jargon must be captured verbatim in physicalExam.
    Scenario(
        id=11,
        name="Physical exam with Murphy's sign — clinical jargon must be captured verbatim",
        conversation=[
            {"role": "user",      "content": "I have pain in my upper right belly for two days"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Abdominal Pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, any tenderness on palpation?"},
            {"role": "user",      "content": "Yes — significant tenderness in the right upper quadrant. Murphy's sign is positive: the patient catches his breath when I press under the right rib margin."},
            {"role": "assistant", "content": "Any guarding?"},
            {"role": "user",      "content": "Mild voluntary guarding in the RUQ."},
            {"role": "assistant", "content": "Bowel sounds?"},
            {"role": "user",      "content": "Present but reduced."},
            {"role": "assistant", "content": "Capillary refill?"},
            {"role": "user",      "content": "Under 2 seconds."},
        ],
        expect_pathway="Abdominal Pain",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        require_strings=["murphy", "right upper quadrant", "guarding", "bowel"],
        notes="Murphy's sign and RUQ findings must appear verbatim in physicalExam. Must not be paraphrased or omitted.",
    ),

    # ── 12. Supplemental oxygen inferred from 'oxygen mask' phrasing ─────────
    # MO says the patient is breathing through an oxygen mask — non-standard phrasing.
    # supplementalOxygen must be extracted as "Yes".
    Scenario(
        id=12,
        name="MO says 'oxygen mask' — supplementalOxygen must be 'Yes'",
        conversation=[
            {"role": "user",      "content": "Patient found unconscious in the engine room, very pale"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Altered Consciousness or Confusion. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "88. I already put him on an oxygen mask — he's been breathing through it since we found him ten minutes ago."},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "120"},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "88/54"},
            {"role": "assistant", "content": "Respiratory rate?"},
            {"role": "user",      "content": "28"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "36.2"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Unresponsive"},
        ],
        expect_pathway="Altered Consciousness or Confusion",
        expect_avpu="Unresponsive",
        expect_supplemental_oxygen="Yes",
        expect_vitals_present=["heartRate", "oxygenSaturation", "bloodPressureSystolic"],
        notes="'He's been breathing through an oxygen mask' must extract supplementalOxygen='Yes'.",
    ),

    # ── 13. Filipino/Tagalog patient — full interview, all output in English ──
    Scenario(
        id=13,
        name="Filipino/Tagalog patient — full interview, all output in English",
        conversation=[
            {"role": "user",      "content": "Mayroon akong matinding sakit ng ulo"},
            {"role": "assistant", "content": "Kung naiintindihan ko nang tama, ang pangunahing reklamo ay sakit ng ulo. Kumpirmahin mo ba?"},
            {"role": "user",      "content": "Oo"},
            {"role": "assistant", "content": "Ilang taon ka na?"},
            {"role": "user",      "content": "29 taong gulang, lalaki"},
            {"role": "assistant", "content": "Kailan nagsimula ang sakit ng ulo?"},
            {"role": "user",      "content": "Nagsimula kagabi, mga 10 oras na ang nakalipas"},
            {"role": "assistant", "content": "Mayroon ka bang pagduduwal?"},
            {"role": "user",      "content": "Oo, mayroon"},
            {"role": "assistant", "content": "Mayroon ka bang pagkasensitibo sa liwanag?"},
            {"role": "user",      "content": "Oo, nakakasakit ang malakas na liwanag"},
            {"role": "assistant", "content": "Anong gamot ang iyong iniinom?"},
            {"role": "user",      "content": "Wala"},
            {"role": "assistant", "content": "Mayroon ka bang allergy?"},
            {"role": "user",      "content": "Wala"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "99"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "72"},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "118/76"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "37.0"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Alert"},
        ],
        expect_pathway="Headache",
        expect_avpu="Alert",
        expect_vitals_present=["heartRate", "oxygenSaturation", "bloodPressureSystolic", "bodyTemperature"],
        forbidden_strings=["sakit", "ulo", "lalaki", "gamot", "liwanag", "mayroon"],
        require_strings=["nausea", "light", "29"],
        notes="All Tagalog must be translated to English — nausea, photophobia, demographics all captured.",
    ),

    # ── 14. Ambiguous malaria test (faint line) — must not interpret result ───
    # MO cannot read the malaria test — faint line, uncertain.
    # Model must document the uncertainty verbatim and must not label it positive or negative.
    Scenario(
        id=14,
        name="Ambiguous malaria test 'faint line' — must document uncertainty, not interpret",
        conversation=[
            {"role": "user",      "content": "I have had fever for 3 days, came from shore leave in West Africa"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Fever. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, did you perform a malaria test?"},
            {"role": "user",      "content": "I tried, but the result is unclear. There is only a very faint line where the positive band should appear. I cannot tell if this is positive or negative."},
            {"role": "assistant", "content": "Any other tests available?"},
            {"role": "user",      "content": "No, that is all we have."},
        ],
        expect_pathway="Fever",
        expect_empty_vitals=True,
        require_strings=["faint", "malaria"],
        forbidden_strings=["malaria: positive", "malaria positive", "malaria test: positive",
                           "malaria: negative", "malaria negative", "malaria test: negative",
                           "\"positive\"", "\"negative\""],
        notes="Ambiguous test — model must capture MO's uncertainty verbatim. Must not resolve ambiguity by labelling the result positive or negative.",
    ),

    # ── 15. MO volunteers exam finding unsolicited during vitals ──────────────
    # MO spontaneously mentions "abdomen is visibly distended" while reporting HR.
    # This unsolicited finding must be captured in physicalExam or additionalNotes.
    Scenario(
        id=15,
        name="MO volunteers distended abdomen during vitals — unsolicited finding must be captured",
        conversation=[
            {"role": "user",      "content": "I have abdominal pain and my belly feels very swollen"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Abdominal Pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "97"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "88. Also — his abdomen is visibly distended and hard to the touch."},
            {"role": "assistant", "content": "Blood pressure?"},
            {"role": "user",      "content": "118/76"},
            {"role": "assistant", "content": "Respiratory rate?"},
            {"role": "user",      "content": "19"},
            {"role": "assistant", "content": "Temperature?"},
            {"role": "user",      "content": "37.8"},
            {"role": "assistant", "content": "AVPU?"},
            {"role": "user",      "content": "Alert"},
        ],
        expect_pathway="Abdominal Pain",
        expect_avpu="Alert",
        expect_vitals_present=["heartRate", "oxygenSaturation"],
        require_strings=["distended"],
        notes="MO's unsolicited 'abdomen is visibly distended and hard to the touch' must appear in physicalExam or additionalNotes — must not be lost.",
    ),

    # ── 16. Two allergies with distinct reactions in one statement ────────────
    # Patient names two allergens with different reaction types in a single answer.
    # Both allergens and both reaction types must appear in the allergies field.
    Scenario(
        id=16,
        name="Two allergies with different reactions — both allergen-reaction pairs must be captured",
        conversation=[
            {"role": "user",      "content": "I have urinary pain and burning"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Urinary Symptoms. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "38, female"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "Trimethoprim 200mg twice daily — I started it myself this morning."},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "Yes — penicillin causes anaphylaxis, and NSAIDs give me severe stomach bleeding."},
        ],
        expect_pathway="Urinary Symptoms",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["penicillin", "anaphylaxis", "nsaid", "bleeding", "trimethoprim"],
        notes="Both allergen-reaction pairs must appear: penicillin→anaphylaxis, NSAIDs→stomach bleeding.",
    ),

    # ── 17. Patient gives birth year instead of age ───────────────────────────
    # Patient says "I was born in 1982" instead of giving an age.
    # The birth year must be captured as stated. Model must not fabricate a calculated age.
    Scenario(
        id=17,
        name="Patient gives birth year 1982 — must be captured as stated",
        conversation=[
            {"role": "user",      "content": "I have back pain"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Back Pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "I was born in 1982, I'm male"},
            {"role": "assistant", "content": "When did the pain start?"},
            {"role": "user",      "content": "Three days ago after lifting heavy cargo on deck"},
            {"role": "assistant", "content": "Any previous illnesses?"},
            {"role": "user",      "content": "No"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "Ibuprofen 400mg as needed for the pain"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "No"},
        ],
        expect_pathway="Back Pain",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["1982", "lifting", "ibuprofen"],
        notes="Birth year 1982 must appear in currentHistoryTaking. Lifting cargo as onset cause must be documented.",
    ),

    # ── 18. Sea Sickness — exact SYBRA pathway name must match ────────────────
    # Patient and Marina confirm 'Sea Sickness' — the SYBRA pathway is exactly 'Sea Sickness'.
    # Must not be mapped to 'Nausea and Vomiting' or 'Seasickness' (one word).
    Scenario(
        id=18,
        name="Sea sickness — exact SYBRA pathway 'Sea Sickness', not 'Nausea and Vomiting'",
        conversation=[
            {"role": "user",      "content": "I'm feeling seasick from the rough seas, constant nausea and vomiting"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Sea Sickness. Do you confirm?"},
            {"role": "user",      "content": "Yes, exactly that"},
            {"role": "assistant", "content": "How long have you been feeling this way?"},
            {"role": "user",      "content": "Since yesterday when the storm started, about 18 hours"},
            {"role": "assistant", "content": "Have you vomited?"},
            {"role": "user",      "content": "Many times, I cannot keep anything down"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "I took Stugeron earlier, two tablets"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "No"},
        ],
        expect_pathway="Sea Sickness",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["stugeron", "18"],
        notes="Pathway must be exactly 'Sea Sickness' — not 'Nausea and Vomiting', not 'Seasickness'.",
    ),

    # ── 19. Marina speculates a diagnosis — speculation must not enter record ──
    # Patient asks "what do you think I have?" and Marina responds with GERD hypothesis.
    # Marina's diagnostic speculation (GERD, acid reflux, gastroesophageal) must NOT
    # appear anywhere in the clinical output — only patient-reported facts.
    Scenario(
        id=19,
        name="Marina speculates GERD diagnosis — speculation must not enter the clinical record",
        conversation=[
            {"role": "user",      "content": "I have severe heartburn and chest discomfort"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Chest pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "When did it start?"},
            {"role": "user",      "content": "A few hours after dinner, about 4 hours ago. What do you think I have?"},
            {"role": "assistant", "content": "It may be acid reflux or gastroesophageal reflux disease (GERD). However, we need to rule out cardiac causes. Does the discomfort get worse when lying down?"},
            {"role": "user",      "content": "Yes, much worse when I lie flat"},
            {"role": "assistant", "content": "Any nausea?"},
            {"role": "user",      "content": "Yes, some nausea"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "No"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "No"},
        ],
        expect_pathway="Chest pain",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["lying", "nausea", "heartburn"],
        forbidden_strings=["gerd", "acid reflux", "gastroesophageal reflux", "rule out cardiac"],
        notes="Marina's diagnostic speculation must NOT appear in clinical output. Only document what the patient reported (heartburn, worse lying flat, nausea).",
    ),

    # ── 20. Patient's glucometer reading in history — not in investigations ───
    # During history, patient mentions their own blood sugar reading (2.1 mmol/L from glucometer).
    # MO later confirms no formal blood glucose test was performed in Stage 8.
    # 2.1 must appear in currentHistoryTaking. investigations must be 'No investigations performed'.
    Scenario(
        id=20,
        name="Patient's glucometer reading during history — in currentHistoryTaking not investigations",
        conversation=[
            {"role": "user",      "content": "I feel dizzy and shaky, I'm a diabetic"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Diabetic complications. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "When did this start?"},
            {"role": "user",      "content": "About 30 minutes ago. I checked my blood sugar on my own glucometer — it was 2.1 mmol/L."},
            {"role": "assistant", "content": "Have you eaten today?"},
            {"role": "user",      "content": "No, I missed breakfast"},
            {"role": "assistant", "content": "Any regular medications?"},
            {"role": "user",      "content": "Insulin glargine 20 units every night, metformin 500mg twice daily"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "No"},
            {"role": "assistant", "content": "Medical officer, blood glucose test?"},
            {"role": "user",      "content": "We do not have the equipment for that on board."},
        ],
        expect_pathway="Diabetic complications",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["2.1", "insulin", "metformin"],
        notes="2.1 mmol/L from patient's own glucometer belongs in currentHistoryTaking. MO confirmed no test was performed — investigations must be 'No investigations performed'.",
    ),

]
