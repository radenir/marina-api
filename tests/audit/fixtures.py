#!/usr/bin/env python3
"""
Audit fixtures for the Marina interview -> extract -> report pipeline.
=====================================================================
Each fixture is a versioned, traceable test case with:

    case_id        stable identifier (MAR-EXT-NN) — never reused/renumbered
    languages      patient + medical-officer language under test
    condition      the clinical scenario keyword
    ground_truth   the EXACT clinical values the simulated MO reports
                   (vitals, gender, AVPU) — the values the extract MUST recover
    expect_chief   keywords the extracted chief complaint must contain
    requirements   requirement IDs this case provides evidence for

Ground truth is parsed from the same persona prompts the batch was driven
from (tests/run_simple.py), so the fixture and the run share one source of
truth and cannot silently drift apart.

This module is data only — no network, no side effects.
"""

import os, re, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from run_simple import SCENARIOS

# ── requirement catalogue (traceability targets) ─────────────────────────────
REQUIREMENTS = {
    "REQ-INT-COMPLETE": "Marina interview completes all stages and returns done=true",
    "REQ-EXT-VITALS":   "Extracted vital signs exactly match the reported values",
    "REQ-EXT-DEMOG":    "Extracted gender and consciousness (AVPU) match the patient",
    "REQ-EXT-CHIEF":    "Extracted chief complaint reflects the presenting symptom",
    "REQ-EXT-SCHEMA":   "Extract summary contains all required clinical fields, populated",
    "REQ-PDF-GEN":      "A Marina seafarer report PDF is generated",
    "REQ-PDF-FIELDS":   "The report PDF contains the extracted clinical values",
    "REQ-I18N":         "Non-English interviews are extracted into a correct summary",
}

# condition keyword -> chief-complaint keywords the summary must contain
CHIEF_KEYWORDS = {
    "chest":    ["chest"],
    "abdomen":  ["abdom"],
    "fever":    ["fever", "cough", "febrile"],
    "headache": ["headache", "head"],
    "backpain": ["back"],
    "dizzy":    ["dizz", "vertigo"],
    "dyspnea":  ["breath", "dyspn", "short"],
    "knee":     ["knee"],
    "nausea":   ["nausea", "vomit"],
    "redeye":   ["eye"],
    "breath":   ["breath", "chest"],
    "trauma":   ["knee", "trauma", "swollen"],
}

# extract field name -> human label, for reporting
VITAL_FIELDS = {
    "circulation_systole":               "BP systolic",
    "circulation_diastole":              "BP diastolic",
    "circulation_pulse_per_min":         "heart rate",
    "breathing_num_breaths_per_min":     "respiration rate",
    "breathing_oxygen_saturation":       "SpO2",
    "expose_temperature_measured_mouth": "temperature",
}


def _parse_vitals(text):
    """Pull the structured vitals out of a persona prompt's 'Vital signs:' line."""
    gt = {}
    m = re.search(r"Vital signs?:\s*(.+)", text)
    seg = m.group(1) if m else text
    if (mm := re.search(r"\bBP\s*(\d{2,3})\s*/\s*(\d{2,3})", seg)):
        gt["circulation_systole"] = mm.group(1)
        gt["circulation_diastole"] = mm.group(2)
    if (mm := re.search(r"\bHR\s*(\d{2,3})", seg)):
        gt["circulation_pulse_per_min"] = mm.group(1)
    if (mm := re.search(r"\bRR\s*(\d{1,2})", seg)):
        gt["breathing_num_breaths_per_min"] = mm.group(1)
    if (mm := re.search(r"\b(?:O2|SpO2|SPO2)\s*(\d{2,3})\s*%", seg)):
        gt["breathing_oxygen_saturation"] = mm.group(1)
    if (mm := re.search(r"\bTemp\s*([0-9]{2}(?:\.[0-9])?)", seg)):
        gt["expose_temperature_measured_mouth"] = mm.group(1)
    if (mm := re.search(r"\bAVPU\s*([A-Za-z]+)", seg)):
        gt["avpu"] = mm.group(1)
    return gt


def _parse_gender(text):
    m = re.search(r"\b(male|female)\b", text, re.IGNORECASE)
    return m.group(1).lower() if m else None


def build_fixtures():
    fixtures = []
    for i, s in enumerate(SCENARIOS[:30], 1):
        condition = s["name"].split("_")[1]
        gt = _parse_vitals(s["patient_prompt"])
        gender = _parse_gender(s["patient_prompt"])
        if gender:
            gt["gender"] = gender

        reqs = ["REQ-INT-COMPLETE", "REQ-EXT-VITALS", "REQ-EXT-DEMOG",
                "REQ-EXT-CHIEF", "REQ-EXT-SCHEMA", "REQ-PDF-GEN", "REQ-PDF-FIELDS"]
        if s["p_lang"].lower() != "english":
            reqs.append("REQ-I18N")

        fixtures.append({
            "case_id":      f"MAR-EXT-{i:02d}",
            "index":        i,
            "scenario":     s["name"],
            "patient_lang": s["p_lang"],
            "mo_lang":      s["mo_lang"],
            "condition":    condition,
            "ground_truth": gt,
            "expect_chief": CHIEF_KEYWORDS.get(condition, [condition]),
            "requirements": reqs,
        })
    return fixtures


if __name__ == "__main__":
    import json
    fx = build_fixtures()
    print(f"{len(fx)} fixtures\n")
    for f in fx:
        print(f"  {f['case_id']}  {f['patient_lang']:<11}->{f['mo_lang']:<11} "
              f"{f['condition']:<9}  GT={json.dumps(f['ground_truth'], separators=(',',':'))}")
