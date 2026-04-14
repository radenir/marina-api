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

    # ── 1. Single message — bare complaint, no Marina interaction ─────────────
    # Only one USER line. Marina never proposes or confirms a pathway.
    # pathway must be "Not identified". All stage fields must be "Not assessed".
    Scenario(
        id=1,
        name="Single message — bare complaint, no Marina response at all",
        conversation=[
            {"role": "user", "content": "I feel very sick and have chest pain"},
        ],
        expect_empty_vitals=True,
        expect_not_assessed=["medications", "allergies", "pastMedicalHistory", "associatedSymptoms"],
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["chest pain"],
        notes="Single user message. No formal pathway confirmation but complaint is clear. Stage fields must be 'Not assessed'. No hallucinated vitals.",
    ),

    # ── 2. Two messages — Marina proposes pathway, patient never confirms ─────
    # Patient states complaint. Marina asks for confirmation. Conversation ends.
    # Patient never said "Yes" or "No" — pathway must be "Not identified".
    Scenario(
        id=2,
        name="Marina proposes pathway but patient never responds — pathway inferred from complaint",
        conversation=[
            {"role": "user",      "content": "I have a bad headache"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Headache. Do you confirm?"},
        ],
        expect_empty_vitals=True,
        expect_not_assessed=["medications", "allergies", "pastMedicalHistory"],
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["headache"],
        notes="Marina proposed Headache but got no confirmation. Pathway inferred from the patient's complaint. No hallucinated vitals or stage data.",
    ),

    # ── 3. Three messages — pathway confirmed, nothing else obtained ──────────
    # Minimal valid interview: complaint → confirm question → "Yes".
    # Pathway is confirmed. No history, vitals, investigations, or exam reached.
    Scenario(
        id=3,
        name="Three messages — pathway confirmed and nothing else",
        conversation=[
            {"role": "user",      "content": "I have abdominal pain"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Abdominal Pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
        ],
        expect_pathway="Abdominal Pain",
        expect_empty_vitals=True,
        expect_not_assessed=["medications", "allergies", "pastMedicalHistory", "associatedSymptoms"],
        expect_no_investigations=True,
        expect_no_exam=True,
        notes="Pathway confirmed. Stages 2-9 never reached — all must be 'Not assessed' or empty.",
    ),

    # ── 4. Three messages — patient explicitly denies proposed pathway ─────────
    # Marina proposes Fever. Patient says "No, not fever."
    # Marina never re-confirms a new pathway — pathway must be "Not identified".
    Scenario(
        id=4,
        name="Patient denies Marina's proposed Fever — model must not output Fever as pathway",
        conversation=[
            {"role": "user",      "content": "I feel dizzy and nauseous"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Fever. Do you confirm?"},
            {"role": "user",      "content": "No, I don't have fever — it's dizziness and nausea"},
        ],
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        forbidden_strings=['"pathway": "Fever"'],
        require_strings=["dizziness", "nause"],
        notes="Patient denied Fever. Pathway must not be Fever. The actual complaint (dizziness/nausea) must appear somewhere.",
    ),

    # ── 5. Four messages — confirm + patient spontaneously discloses allergy ──
    # Patient says "Yes" to confirmation and in the same message reveals an allergy.
    # The allergy must be captured even though Marina never formally asked.
    Scenario(
        id=5,
        name="Pathway confirmed + patient spontaneously discloses aspirin allergy in same message",
        conversation=[
            {"role": "user",      "content": "I have chest pain"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Chest pain. Do you confirm?"},
            {"role": "user",      "content": "Yes — and I should mention I am allergic to aspirin, it gives me a rash"},
            {"role": "assistant", "content": "Thank you. Please stay on the line."},
        ],
        expect_pathway="Chest pain",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["aspirin", "rash"],
        forbidden_strings=["no known allergies"],
        notes="Allergy disclosed spontaneously at confirmation — must appear in allergies field even without a formal allergies stage.",
    ),

    # ── 6. Four messages — pathway confirmed, Marina asks age, no answer ──────
    # Marina asks age but the conversation ends before any response.
    # currentHistoryTaking must note complaint confirmed, no history obtained.
    Scenario(
        id=6,
        name="Pathway confirmed, Marina asks age, conversation ends before answer",
        conversation=[
            {"role": "user",      "content": "I have back pain"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Back Pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you and what is your gender?"},
        ],
        expect_pathway="Back Pain",
        expect_empty_vitals=True,
        expect_not_assessed=["medications", "allergies", "pastMedicalHistory", "associatedSymptoms"],
        expect_no_investigations=True,
        expect_no_exam=True,
        notes="Marina asked age but got no answer. currentHistoryTaking must note complaint confirmed, no history obtained. Must not hallucinate an age.",
    ),

    # ── 7. Four messages — complaint contains self-reported BP, confirm, Yes ──
    # Patient mentions their own blood pressure ("180 over 110") in the complaint.
    # This must appear in currentHistoryTaking — NOT in vitalSigns.
    # Stage 7 was never reached. All vitalSigns fields must be empty.
    Scenario(
        id=7,
        name="Self-reported BP in complaint — must stay in history, not vitalSigns",
        conversation=[
            {"role": "user",      "content": "I have a terrible headache. I checked my blood pressure at home — it was 180 over 110."},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Headache. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Thank you. Please hold on."},
        ],
        expect_pathway="Headache",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["180", "110"],
        forbidden_strings=['"bloodPressureSystolic": "180"', '"bloodPressureDiastolic": "110"'],
        notes="180/110 is patient's self-report — belongs in currentHistoryTaking. Stage 7 not reached — vitalSigns must all be empty.",
    ),

    # ── 8. Five messages — two pathway proposals, second not confirmed ─────────
    # Patient denies first pathway (Fever). Marina re-proposes (Nausea and Vomiting).
    # Patient never confirms the second proposal either.
    # pathway must be "Not identified".
    Scenario(
        id=8,
        name="Two pathway proposals — first denied, second unconfirmed — Fever must not be pathway",
        conversation=[
            {"role": "user",      "content": "I feel terribly sick with nausea and vomiting"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Fever. Do you confirm?"},
            {"role": "user",      "content": "No, I don't have fever. It's nausea and vomiting."},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Nausea and Vomiting. Do you confirm?"},
            {"role": "user",      "content": ""},
        ],
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        forbidden_strings=['"pathway": "Fever"'],
        require_strings=["nausea", "vomiting"],
        notes="Fever was explicitly denied — must not be pathway. Nausea and vomiting must appear in the output. Empty final response = ambiguous confirmation.",
    ),

    # ── 9. Five messages — confirm, medications asked and denied ──────────────
    # Marina jumps directly to medications stage (skipping history, associated, PMH).
    # medications was explicitly asked and denied.
    # allergies was never asked — must be "Not assessed".
    Scenario(
        id=9,
        name="Pathway confirmed then only medications stage reached — allergies Not assessed",
        conversation=[
            {"role": "user",      "content": "I have fever"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Fever. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Any medications you are currently taking?"},
            {"role": "user",      "content": "No medications"},
        ],
        expect_pathway="Fever",
        expect_empty_vitals=True,
        expect_not_assessed=["allergies", "pastMedicalHistory", "associatedSymptoms"],
        expect_no_investigations=True,
        expect_no_exam=True,
        forbidden_strings=["no known allergies"],
        notes="Medications asked and denied → 'Patient states no current medications.' Allergies never asked → must be 'Not assessed', not 'No known allergies'.",
    ),

    # ── 10. Five messages — confirm, single vital (SpO2 95) given ─────────────
    # Marina goes straight to asking SpO2. Only SpO2 is provided.
    # All other numeric vital fields must remain empty (not fabricated).
    Scenario(
        id=10,
        name="Only SpO2 given — all other vital fields must remain empty",
        conversation=[
            {"role": "user",      "content": "I have shortness of breath"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Shortness of Breath. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "95"},
        ],
        expect_pathway="Shortness of Breath",
        expect_vitals_present=["oxygenSaturation"],
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["95"],
        forbidden_strings=['"bloodPressureSystolic": "1', '"respirationRate": "1', '"bodyTemperature": "3'],
        notes="Only oxygenSaturation='95' was reported. heartRate, BP, RR, temp must all be empty string — not guessed.",
    ),

    # ── 11. Five messages — ambiguous confirmation 'I think so' ───────────────
    # Patient says "I think so, yes" — a soft but positive confirmation.
    # The pathway should be confirmed (Abdominal Pain).
    Scenario(
        id=11,
        name="Ambiguous confirmation 'I think so, yes' — pathway should be confirmed",
        conversation=[
            {"role": "user",      "content": "I have pain in my stomach area"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Abdominal Pain. Do you confirm?"},
            {"role": "user",      "content": "I think so, yes, it is in my belly"},
            {"role": "assistant", "content": "How long have you had the pain?"},
            {"role": "user",      "content": "Since last night, about 10 hours"},
        ],
        expect_pathway="Abdominal Pain",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["10 hours"],
        notes="'I think so, yes' is a soft confirmation — pathway must be Abdominal Pain, not 'Not identified'.",
    ),

    # ── 12. Six messages — confirm + two history questions answered ────────────
    # Age and onset both captured from brief history.
    Scenario(
        id=12,
        name="Six messages — pathway + age + onset captured from two history questions",
        conversation=[
            {"role": "user",      "content": "I have severe back pain"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Back Pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "38, female"},
            {"role": "assistant", "content": "When did the pain start?"},
            {"role": "user",      "content": "Three days ago after I slipped on the wet deck"},
        ],
        expect_pathway="Back Pain",
        expect_empty_vitals=True,
        expect_not_assessed=["medications", "allergies", "pastMedicalHistory"],
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["38", "three days", "deck"],
        notes="Age, onset, and mechanism (slipped on deck) must all appear in currentHistoryTaking.",
    ),

    # ── 13. Six messages — confirm + MO gives all vitals abbreviated ──────────
    # MO delivers complete vitals as a single comma-separated sentence.
    # All abbreviations must be resolved correctly.
    Scenario(
        id=13,
        name="Six messages — MO gives full vitals set in one abbreviated line",
        conversation=[
            {"role": "user",      "content": "The patient has dizziness and cannot stand up properly"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Dizziness/Vertigo. Do you confirm?"},
            {"role": "user",      "content": "Yes, patient confirms"},
            {"role": "assistant", "content": "Medical officer, please provide vital signs."},
            {"role": "user",      "content": "HR 88, BP 118/72, SpO2 98%, Temp 36.9, RR 16, AVPU Alert."},
            {"role": "assistant", "content": "Thank you."},
        ],
        expect_pathway="Dizziness",
        expect_avpu="Alert",
        expect_vitals_present=["heartRate", "oxygenSaturation", "bloodPressureSystolic",
                                "bloodPressureDiastolic", "bodyTemperature", "respirationRate"],
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["88", "118", "72", "98", "36.9", "16"],
        notes="All vitals from one line — HR, BP, SpO2, Temp, RR, AVPU all extracted correctly.",
    ),

    # ── 14. Seven messages — all three patient stages denied explicitly ─────────
    # Marina asks PMH, medications, and allergies. Patient denies each.
    # All three fields must be filled with denial text — NOT "Not assessed".
    Scenario(
        id=14,
        name="Seven messages — PMH, medications, allergies all explicitly denied",
        conversation=[
            {"role": "user",      "content": "I have a headache"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Headache. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Any previous illnesses?"},
            {"role": "user",      "content": "No"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "No"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "No"},
        ],
        expect_pathway="Headache",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        forbidden_strings=['"pastMedicalHistory": "Not assessed', '"medications": "Not assessed',
                           '"allergies": "Not assessed'],
        notes="All three stages reached and answered with 'No'. Must document denials, never 'Not assessed' for those three fields.",
    ),

    # ── 15. Seven messages — confirm + partial vitals + one investigation ──────
    # Marina jumps to vitals (SpO2 and HR only) then asks one investigation.
    # Missing vitals must be empty. Investigation result must be captured.
    Scenario(
        id=15,
        name="Seven messages — partial vitals (SpO2 + HR) and one investigation result",
        conversation=[
            {"role": "user",      "content": "I have fever"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Fever. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation?"},
            {"role": "user",      "content": "96"},
            {"role": "assistant", "content": "Heart rate?"},
            {"role": "user",      "content": "104"},
            {"role": "assistant", "content": "Malaria test result?"},
            {"role": "user",      "content": "Positive — falciparum malaria"},
        ],
        expect_pathway="Fever",
        expect_vitals_present=["oxygenSaturation", "heartRate"],
        expect_no_exam=True,
        require_strings=["malaria", "positive", "falciparum"],
        notes="SpO2 and HR present; BP, RR, temp must be empty. Malaria result must appear in investigations.",
    ),

    # ── 16. Seven messages — ear pain, confirm, one history answer ────────────
    # Short but valid — pathway confirmed plus one detail about onset and severity.
    Scenario(
        id=16,
        name="Seven messages — ear pain pathway with onset and severity captured",
        conversation=[
            {"role": "user",      "content": "My ear hurts a lot"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Ear Pain or Hearing Problems. Do you confirm?"},
            {"role": "user",      "content": "Yes, that is right"},
            {"role": "assistant", "content": "How long has your ear been hurting?"},
            {"role": "user",      "content": "Since yesterday evening, getting worse"},
            {"role": "assistant", "content": "How severe is the pain on a scale of 1 to 10?"},
            {"role": "user",      "content": "7"},
        ],
        expect_pathway="Ear Pain",
        expect_empty_vitals=True,
        expect_not_assessed=["medications", "allergies", "pastMedicalHistory"],
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["yesterday", "7"],
        notes="Pathway confirmed, onset and severity captured. Other stages not reached — must be 'Not assessed'.",
    ),

    # ── 17. Eight messages — pathway + age + meds + partial vitals ───────────
    # Fast interview: history (age only), medications, then two vitals.
    # All fields populated from minimal exchanges.
    Scenario(
        id=17,
        name="Eight messages — age, medications, and two vitals from rapid interview",
        conversation=[
            {"role": "user",      "content": "I have chest pain"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Chest pain. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "How old are you?"},
            {"role": "user",      "content": "62, male"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "Clopidogrel 75mg daily, atorvastatin 40mg daily"},
            {"role": "assistant", "content": "Medical officer, oxygen saturation and heart rate?"},
            {"role": "user",      "content": "SpO2 94, heart rate 110"},
        ],
        expect_pathway="Chest pain",
        expect_vitals_present=["oxygenSaturation", "heartRate"],
        expect_not_assessed=["allergies", "pastMedicalHistory", "associatedSymptoms"],
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["62", "clopidogrel", "atorvastatin", "94", "110"],
        notes="Age, two medications, and two vitals captured from rapid partial interview. BP, RR, temp must be empty.",
    ),

    # ── 18. Eight messages — confirm + onset + PMH denied + vitals only ───────
    # Covers history (onset), PMH (denied), and abbreviated vitals in rapid sequence.
    Scenario(
        id=18,
        name="Eight messages — onset, PMH denial, and abbreviated vitals",
        conversation=[
            {"role": "user",      "content": "I have shortness of breath"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Shortness of Breath. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "When did this start?"},
            {"role": "user",      "content": "About 2 hours ago, came on suddenly"},
            {"role": "assistant", "content": "Any previous heart or lung conditions?"},
            {"role": "user",      "content": "No, nothing like that"},
            {"role": "assistant", "content": "Medical officer, vital signs?"},
            {"role": "user",      "content": "SpO2 88, HR 124, BP 140/90, AVPU Alert"},
        ],
        expect_pathway="Shortness of Breath",
        expect_avpu="Alert",
        expect_vitals_present=["oxygenSaturation", "heartRate", "bloodPressureSystolic"],
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["88", "124", "2 hours"],
        notes="Onset, PMH denial, and partial vitals all from short interview. RR and temp must be empty.",
    ),

    # ── 19. Nine messages — all stages Yes/No, complete minimal content ────────
    # Every patient-facing stage reached and answered — all with minimal content.
    # No hallucination — must only document what was actually said.
    Scenario(
        id=19,
        name="Nine messages — all stages reached with minimal one-word answers",
        conversation=[
            {"role": "user",      "content": "I have nausea"},
            {"role": "assistant", "content": "If I understand correctly, the main complaint is Nausea and Vomiting. Do you confirm?"},
            {"role": "user",      "content": "Yes"},
            {"role": "assistant", "content": "Any nausea or vomiting?"},
            {"role": "user",      "content": "Just nausea, no vomiting"},
            {"role": "assistant", "content": "Any previous illnesses?"},
            {"role": "user",      "content": "No"},
            {"role": "assistant", "content": "Any medications?"},
            {"role": "user",      "content": "No"},
            {"role": "assistant", "content": "Any allergies?"},
            {"role": "user",      "content": "No"},
        ],
        expect_pathway="Nausea and Vomiting",
        expect_empty_vitals=True,
        expect_no_investigations=True,
        expect_no_exam=True,
        require_strings=["vomiting"],
        forbidden_strings=['"pastMedicalHistory": "Not assessed', '"medications": "Not assessed',
                           '"allergies": "Not assessed'],
        notes="All patient stages asked with minimal responses. 'Just nausea, no vomiting' must be captured somewhere. PMH/meds/allergies must not be 'Not assessed' since all were explicitly asked.",
    ),

    # ── 20. Empty conversation — single empty user message ────────────────────
    # Patient sends an empty message. No clinical information exists.
    # pathway must be "Not identified". All fields must be empty or "Not assessed".
    Scenario(
        id=20,
        name="Empty message — no clinical content at all",
        conversation=[
            {"role": "user", "content": "   "},
        ],
        expect_pathway="Not identified",
        expect_empty_vitals=True,
        expect_not_assessed=["medications", "allergies", "pastMedicalHistory", "associatedSymptoms"],
        expect_no_investigations=True,
        expect_no_exam=True,
        notes="Whitespace-only message — no clinical data. All fields must reflect absence of information.",
    ),

]
