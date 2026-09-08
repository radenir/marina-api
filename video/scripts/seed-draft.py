#!/usr/bin/env python3
"""
seed-draft.py — emit a ReportDraft JSON for the simulator to pick up.

    python3 seed-draft.py --stage 1     # just started talking
    python3 seed-draft.py --stage 2     # halfway through
    python3 seed-draft.py --stage 3     # finished (default)

Written into the simulator's Application Support/Marina/report-draft.json by
capture-shots.sh. The app finds it at launch and offers it as a resumable draft;
the capture test taps Resume, and the report is then populated through the real
UI with real quality scores from the real backend.

The stages exist so the film can show a report genuinely filling up. Capturing
the same screen three times against three real states beats animating text into
a single screenshot: the section percentages, the Quality bar and the coaching
hints are all recomputed by the app each time, and they are what actually sells
"Marina is writing this as you speak".

Why seed at all rather than dictate: a capture machine has no usable microphone,
so an unattended run cannot produce speech. The values below are what a real
dictation of this consultation extracts to.

Shape must match ReportDraft/MedicalSummary in the app. Every MedicalSummary
field is Optional, so absent keys decode fine — only include what should show.
"""
import argparse
import json
from datetime import datetime, timezone

# MV Northern Star, Gulf of Aden. The officer is dictating in English; the
# officer's language is whatever their Marina profile says, and that is what the
# coaching hints come back in.
VESSEL = {
    "shipName": "MV Northern Star",
    "shipCallSign": "9HA4721",
    "shipSatellitePhone": "+870773111250",
    "medicineChestType": "A",
    "patientCompany": "Northern Star Shipping",
    "patientEmail": "master@northernstar.example",
}

REPORT_META = {
    "date": "19/07/2026",
    "incidentTime": "02:15",
    "patientUtc": "UTC+03:00",
    "preparedBy": "2/O M. Reyes",
    "medical_officer_name_and_title": "2/O M. Reyes, Second Officer",
}

# ---------------------------------------------------------------------------
# Stage 1 — the first few sentences. Who the patient is and what is wrong.
# ---------------------------------------------------------------------------
STAGE_1 = {
    **VESSEL,
    **REPORT_META,
    "patientFirstName": "Mykola",
    "patientLastName": "Bondarenko",
    "gender": "Male",
    "position": "Oiler",
    "chiefComplaint": "Abdominal Pain",
    "chiefSymptom": "Abdominal Pain",
    "problemDescription": (
        "34-year-old male oiler woke at approximately 02:00 with right lower "
        "quadrant abdominal pain."
    ),
}

# ---------------------------------------------------------------------------
# Stage 2 — history and the destination port, dictated. This is the stage the
# film pauses on to show a port and its ETA arriving by voice.
# ---------------------------------------------------------------------------
STAGE_2 = {
    **STAGE_1,
    "dateOfBirth": "04/03/1992",
    "patientNationality": "Ukrainian",
    "problemDescription": (
        "34-year-old male oiler woke at approximately 02:00 with right lower "
        "quadrant abdominal pain, described as constant and worsening over "
        "four hours. Three episodes of vomiting since onset."
    ),
    "associatedSymptoms": (
        "Nausea and three episodes of vomiting. Loss of appetite since waking. "
        "No diarrhoea."
    ),
    "pastHistory": "No previous abdominal surgery. No known chronic illness.",
    "allergies": "No known allergies.",
    "currentMedications": "Paracetamol 1 g taken once at approximately 03:00.",
    # Dictated out loud — "we're heading for Salalah" — and resolved to a
    # UN/LOCODE with an ETA computed from the vessel's cruise speed.
    "location": "12.84213, 45.03187",
    "destination": "OMSLL",
    "etaDestination": "~2 d 6 h",
    "nearestPort": "ADADE",
    "etaNearestPort": "~9 h 40 min",
}

# ---------------------------------------------------------------------------
# Stage 3 — vitals and examination dictated. The finished report.
# ---------------------------------------------------------------------------
STAGE_3 = {
    **STAGE_2,
    "problemDescription": (
        "34-year-old male oiler woke at approximately 02:00 with right lower "
        "quadrant abdominal pain, described as constant and worsening over "
        "four hours. Three episodes of vomiting since onset. Pain rated 7/10, "
        "aggravated by movement and by pressing on the area."
    ),
    "associatedSymptoms": (
        "Nausea and three episodes of vomiting. Loss of appetite since waking. "
        "No diarrhoea. No urinary symptoms. No chest pain or breathlessness."
    ),
    "circulation_pulse_per_min": "96",
    "circulation_systole": "132",
    "circulation_diastole": "84",
    "breathing_num_breaths_per_min": "20",
    "breathing_oxygen_saturation": "97",
    "expose_temperature_measured_mouth": "37.8",
    "avpu": "Alert",
    "exam": (
        "Abdomen soft, tenderness localised to the right lower quadrant with "
        "guarding on palpation. Capillary refill normal (approximately 2 "
        "seconds). No visible distension or scars."
    ),
    "investigations": (
        "Urine dipstick negative for nitrites and leucocytes. "
        "Temperature rechecked at 04:00: 37.8 °C."
    ),
}

STAGES = {1: STAGE_1, 2: STAGE_2, 3: STAGE_3}

# What the officer said, in English, to reach each stage.
TRANSCRIPTS = {
    1: (
        "Mykola Bondarenko, the oiler, thirty-four years old. He woke up around "
        "two in the morning with pain in his belly, lower right side."
    ),
    2: (
        "Mykola Bondarenko, the oiler, thirty-four years old, Ukrainian. He woke "
        "up around two in the morning with pain in his belly, lower right side. "
        "It's been getting worse over about four hours. He vomited twice — no, "
        "three times. No allergies, he only took paracetamol last night. "
        "We're heading for Salalah."
    ),
    3: (
        "Mykola Bondarenko, the oiler, thirty-four years old, Ukrainian. He woke "
        "up around two in the morning with pain in his belly, lower right side. "
        "It's been getting worse over about four hours. He vomited twice — no, "
        "three times. No allergies, he only took paracetamol last night. "
        "We're heading for Salalah. His pulse is ninety-six, blood pressure one "
        "thirty-two over eighty-four, temperature thirty-seven point eight, "
        "oxygen ninety-seven. The belly is soft but tender low on the right and "
        "he guards when I press. I pressed his fingernail and the colour came "
        "back in about two seconds."
    ),
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", type=int, choices=[1, 2, 3], default=3)
    args = parser.parse_args()

    transcript = TRANSCRIPTS[args.stage]
    draft = {
        "schemaVersion": 1,
        "sessionId": f"film-capture-stage{args.stage}",
        "updatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "summary": STAGES[args.stage],
        "conversation": [{"role": "user", "content": transcript}],
        "transcript": transcript,
        "patientLanguage": "en",
        "officerLanguage": "en",
        "pendingSegmentNames": [],
    }
    print(json.dumps(draft, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
