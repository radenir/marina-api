"""
Runner for POST /ai/interview/extract scenarios.
Usage: python tests/runs/promptExtract/run.py [--url http://localhost:4000]
"""

import asyncio
import aiohttp
import json
import sys
import argparse

from scenarios import SCENARIOS, Scenario

BASE_URL = "http://localhost:4000"
TOKEN = ""

VITAL_NUMERIC_FIELDS = [
    "heartRate", "oxygenSaturation", "bloodPressureSystolic",
    "bloodPressureDiastolic", "respirationRate", "bodyTemperature",
]
AVPU_VALUES = {"Alert", "Voice", "Pain", "Unresponsive", ""}
REQUIRED_KEYS = {
    "pathway", "currentHistoryTaking", "associatedSymptoms",
    "pastMedicalHistory", "medications", "allergies",
    "vitalSigns", "investigations", "physicalExam", "additionalNotes",
}
VITAL_KEYS = {
    "heartRate", "oxygenSaturation", "bloodPressureSystolic",
    "bloodPressureDiastolic", "respirationRate", "AVPU",
    "bodyTemperature", "supplementalOxygen",
}


# ── Validation ────────────────────────────────────────────────────────────────

def is_numeric_string(s: str) -> bool:
    try:
        float(s)
        return True
    except ValueError:
        return False


def validate(sc: Scenario, summary: dict) -> list[str]:
    issues = []

    # Top-level structure
    missing_keys = REQUIRED_KEYS - set(summary.keys())
    if missing_keys:
        issues.append(f"Missing top-level keys: {missing_keys}")

    vs = summary.get("vitalSigns", {})
    missing_vital_keys = VITAL_KEYS - set(vs.keys())
    if missing_vital_keys:
        issues.append(f"Missing vitalSigns keys: {missing_vital_keys}")

    # Numeric vital fields must be plain numbers or empty string
    for vf in VITAL_NUMERIC_FIELDS:
        val = vs.get(vf, "")
        if val != "" and not is_numeric_string(val):
            issues.append(f"vitalSigns.{vf} = '{val}' — must be plain number or empty string")

    # AVPU must be one of the four allowed values or empty
    avpu_val = vs.get("AVPU", "")
    if avpu_val not in AVPU_VALUES:
        issues.append(f"vitalSigns.AVPU = '{avpu_val}' — must be Alert/Voice/Pain/Unresponsive or empty")

    # Expected pathway
    if sc.expect_pathway:
        actual = summary.get("pathway", "")
        if sc.expect_pathway.lower() not in actual.lower():
            issues.append(f"pathway = '{actual}' — expected to contain '{sc.expect_pathway}'")

    # All numeric vitals must be empty (stage 7 not reached)
    if sc.expect_empty_vitals:
        for vf in VITAL_NUMERIC_FIELDS:
            if vs.get(vf, "") != "":
                issues.append(f"vitalSigns.{vf} = '{vs[vf]}' — expected empty (vitals not taken)")

    # Specific vital fields must be non-empty
    for vf in sc.expect_vitals_present:
        if vs.get(vf, "") == "":
            issues.append(f"vitalSigns.{vf} is empty — expected a value")

    # Exact AVPU value
    if sc.expect_avpu and vs.get("AVPU", "") != sc.expect_avpu:
        issues.append(f"vitalSigns.AVPU = '{vs.get('AVPU')}' — expected '{sc.expect_avpu}'")

    # Supplemental oxygen
    if sc.expect_supplemental_oxygen:
        actual = vs.get("supplementalOxygen", "")
        if actual != sc.expect_supplemental_oxygen:
            issues.append(f"vitalSigns.supplementalOxygen = '{actual}' — expected '{sc.expect_supplemental_oxygen}'")

    # Fields expected to contain "Not assessed"
    for key in sc.expect_not_assessed:
        val = summary.get(key, "")
        if "not assessed" not in val.lower():
            issues.append(f"'{key}' = '{val[:60]}' — expected 'Not assessed'")

    # Investigations should be absent / not performed
    if sc.expect_no_investigations:
        inv = summary.get("investigations", "")
        inv_lower = inv.lower()
        if inv and "no investigations" not in inv_lower and "not assessed" not in inv_lower and "not performed" not in inv_lower:
            issues.append(f"investigations = '{inv[:80]}' — expected no investigations")

    # Physical exam should be absent / not performed
    if sc.expect_no_exam:
        exam = summary.get("physicalExam", "")
        exam_lower = exam.lower()
        if exam and "not performed" not in exam_lower and "not assessed" not in exam_lower and "no exam" not in exam_lower:
            issues.append(f"physicalExam = '{exam[:80]}' — expected 'Not performed'")

    full_text = json.dumps(summary).lower()

    # Forbidden strings (hallucination / over-reporting check, case-insensitive)
    for fs in sc.forbidden_strings:
        if fs.lower() in full_text:
            issues.append(f"HALLUCINATION: forbidden string found: '{fs}'")

    # Required strings (positive content check, case-insensitive)
    for rs in sc.require_strings:
        if rs.lower() not in full_text:
            issues.append(f"MISSING CONTENT: required string not found: '{rs}'")

    return issues


# ── Runner ────────────────────────────────────────────────────────────────────

async def run_scenario(session: aiohttp.ClientSession, sc: Scenario) -> dict:
    payload = {"conversationHistory": sc.conversation}
    try:
        async with session.post(
            f"{BASE_URL}/ai/interview/extract",
            json=payload,
            headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
            timeout=aiohttp.ClientTimeout(total=60),
        ) as resp:
            body = await resp.json()
            if resp.status != 200:
                return {"sc": sc, "error": f"HTTP {resp.status}: {body}", "summary": None}
            return {"sc": sc, "error": None, "summary": body.get("summary", {})}
    except Exception as e:
        return {"sc": sc, "error": str(e), "summary": None}


async def main(base_url: str):
    global BASE_URL, TOKEN
    BASE_URL = base_url

    async with aiohttp.ClientSession() as session:
        # Login
        async with session.post(
            f"{BASE_URL}/auth/login",
            json={"email": "radomski.adr@gmail.com", "password": "Gierek123"},
        ) as resp:
            data = await resp.json()
            TOKEN = data.get("access_token", "")
            if not TOKEN:
                print("LOGIN FAILED:", data)
                sys.exit(1)

        print(f"Logged in. Running {len(SCENARIOS)} scenarios concurrently...\n")
        tasks = [run_scenario(session, sc) for sc in SCENARIOS]
        results = await asyncio.gather(*tasks)

    # Report
    passed = 0
    failed = 0

    for r in sorted(results, key=lambda x: x["sc"].id):
        sc: Scenario = r["sc"]
        prefix = f"[{sc.id:02d}] {sc.name}"

        if r["error"]:
            print(f"FAIL {prefix}")
            print(f"     ERROR: {r['error']}\n")
            failed += 1
            continue

        summary = r["summary"]
        issues = validate(sc, summary)

        if issues:
            print(f"FAIL {prefix}")
            for issue in issues:
                print(f"      {issue}")
            if sc.notes:
                print(f"     NOTE: {sc.notes}")
            print()
            failed += 1
        else:
            vs = summary.get("vitalSigns", {})
            print(f"PASS {prefix}")
            if sc.notes:
                print(f"     NOTE: {sc.notes}")
            print(f"     pathway:    {summary.get('pathway', '')}")
            print(f"     HR/SpO2/BP: {vs.get('heartRate','—')} / {vs.get('oxygenSaturation','—')} / {vs.get('bloodPressureSystolic','—')}/{vs.get('bloodPressureDiastolic','—')}")
            print(f"     AVPU:       {vs.get('AVPU','—')}   suppO2: {vs.get('supplementalOxygen','—')}")
            print(f"     assoc:      {summary.get('associatedSymptoms','')[:80]}")
            print()
            passed += 1

    print("─" * 60)
    print(f"RESULT: {passed}/{len(SCENARIOS)} passed   {failed} failed")

    if failed:
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:4000", help="API base URL")
    args = parser.parse_args()
    asyncio.run(main(args.url))
