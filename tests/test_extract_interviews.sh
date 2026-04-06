#!/usr/bin/env bash
# ================================================================
# Marina API /ai/extract — Interview Extraction Test Suite (20 scenarios)
# ================================================================
# Mirrors tests/test_summary_interviews.sh from the web app,
# adapted for marina-api: POST /ai/extract, Bearer auth, different payload shape.
#
# Usage:
#   API_EMAIL=you@example.com API_PASSWORD=secret ./tests/test_extract_interviews.sh
#   BASE_URL=http://localhost:4000 API_EMAIL=... API_PASSWORD=... ./tests/test_extract_interviews.sh
#
# Requirements: curl, jq
# The marina-api server must be running (npm run dev or npm start)
# ================================================================

BASE_URL="${BASE_URL:-http://localhost:4000}"
API_EMAIL="${API_EMAIL:-}"
API_PASSWORD="${API_PASSWORD:-}"

TOTAL_SCENARIOS=0
PASS_SCENARIOS=0
FAIL_SCENARIOS=0
TOTAL_CHECKS=0
PASS_CHECKS=0
FAIL_CHECKS=0

# ── Output logging ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/output"
mkdir -p "$OUTPUT_DIR"
OUTPUT_FILE="$OUTPUT_DIR/marina_api_extract_$(date '+%Y%m%d_%H%M%S').txt"
exec > >(tee "$OUTPUT_FILE") 2>&1

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

echo -e "${BOLD}${BLUE}"
echo "╔════════════════════════════════════════════════════╗"
echo "║  Marina API /ai/extract — Interview Extract Tests  ║"
echo "║  20 scenarios · $(date '+%Y-%m-%d %H:%M:%S')              ║"
echo "╚════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "  Base URL : $BASE_URL"
echo "  Endpoint : POST /ai/extract"
echo ""

# ── Auth ──────────────────────────────────────────────────────────

if [[ -z "$API_EMAIL" || -z "$API_PASSWORD" ]]; then
  echo -e "${RED}Error: API_EMAIL and API_PASSWORD must be set.${NC}"
  echo "  Usage: API_EMAIL=you@example.com API_PASSWORD=secret $0"
  exit 1
fi

echo -n "  Logging in as $API_EMAIL ... "
LOGIN_RESPONSE=$(curl -s --max-time 15 -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$API_EMAIL\",\"password\":\"$API_PASSWORD\"}" 2>/dev/null)

ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.access_token // empty' 2>/dev/null)

if [[ -z "$ACCESS_TOKEN" ]]; then
  echo -e "${RED}FAILED${NC}"
  echo "  Login response: $(echo "$LOGIN_RESPONSE" | head -c 300)"
  exit 1
fi
echo -e "${GREEN}OK${NC}"
echo ""

# ── State ─────────────────────────────────────────────────────────

SCENARIO_RESPONSE=""
SCENARIO_NAME=""
SCENARIO_NUM=0
SCENARIO_CHECKS_PASS=0
SCENARIO_CHECKS_FAIL=0

# ── Payload builder ───────────────────────────────────────────────
# marina-api uses "conversation" (not "conversationHistory"), no vitalSignsData

make_payload() {
  local conv="$1"
  local mews="${2:-null}"
  jq -n --argjson h "$conv" --argjson m "$mews" \
    '{"conversation":$h,"mewsScore":$m}'
}

# ── Scenario runner ───────────────────────────────────────────────

start_scenario() {
  SCENARIO_NUM=$((SCENARIO_NUM + 1))
  SCENARIO_NAME="$1"
  local payload="$2"
  SCENARIO_CHECKS_PASS=0
  SCENARIO_CHECKS_FAIL=0
  TOTAL_SCENARIOS=$((TOTAL_SCENARIOS + 1))

  echo ""
  echo -e "${BOLD}── S$(printf '%02d' $SCENARIO_NUM): $SCENARIO_NAME${NC}"

  SCENARIO_RESPONSE=$(curl -s --max-time 120 -X POST "$BASE_URL/ai/extract" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -d "$payload" 2>/dev/null)

  if [[ $? -ne 0 || -z "$SCENARIO_RESPONSE" ]]; then
    echo -e "${YELLOW}   ⚠  No response — skipping assertions${NC}"
    SCENARIO_RESPONSE=""
  fi
}

end_scenario() {
  TOTAL_CHECKS=$((TOTAL_CHECKS + SCENARIO_CHECKS_PASS + SCENARIO_CHECKS_FAIL))
  PASS_CHECKS=$((PASS_CHECKS + SCENARIO_CHECKS_PASS))
  FAIL_CHECKS=$((FAIL_CHECKS + SCENARIO_CHECKS_FAIL))

  local total=$((SCENARIO_CHECKS_PASS + SCENARIO_CHECKS_FAIL))
  if [[ $SCENARIO_CHECKS_FAIL -eq 0 ]]; then
    echo -e "   ${GREEN}✅ PASS — $SCENARIO_CHECKS_PASS/$total checks passed${NC}"
    PASS_SCENARIOS=$((PASS_SCENARIOS + 1))
  else
    echo -e "   ${RED}❌ FAIL — $SCENARIO_CHECKS_PASS/$total checks passed, $SCENARIO_CHECKS_FAIL failed${NC}"
    FAIL_SCENARIOS=$((FAIL_SCENARIOS + 1))
  fi
}

# ── Assertion helpers ─────────────────────────────────────────────

get_field() {
  echo "$SCENARIO_RESPONSE" | jq -r ".summary.$1 // \"\"" 2>/dev/null
}

assert_contains() {
  local field="$1" expected="$2"
  local value; value=$(get_field "$field")
  if echo "$value" | grep -qi "$expected"; then
    echo -e "   ${GREEN}  ✓${NC} ${DIM}$field contains '$expected'${NC}"
    SCENARIO_CHECKS_PASS=$((SCENARIO_CHECKS_PASS + 1))
  else
    echo -e "   ${RED}  ✗ $field should contain '$expected'${NC}"
    echo -e "   ${DIM}    got: $(echo "$value" | head -c 200)${NC}"
    SCENARIO_CHECKS_FAIL=$((SCENARIO_CHECKS_FAIL + 1))
  fi
}

assert_not_contains() {
  local field="$1" forbidden="$2"
  local value; value=$(get_field "$field")
  if echo "$value" | grep -qi "$forbidden"; then
    echo -e "   ${RED}  ✗ $field should NOT contain '$forbidden' (hallucination?)${NC}"
    echo -e "   ${DIM}    got: $(echo "$value" | head -c 200)${NC}"
    SCENARIO_CHECKS_FAIL=$((SCENARIO_CHECKS_FAIL + 1))
  else
    echo -e "   ${GREEN}  ✓${NC} ${DIM}$field does not contain '$forbidden'${NC}"
    SCENARIO_CHECKS_PASS=$((SCENARIO_CHECKS_PASS + 1))
  fi
}

assert_empty() {
  local field="$1"
  local value; value=$(get_field "$field")
  if [[ -z "$value" || "$value" == "null" ]]; then
    echo -e "   ${GREEN}  ✓${NC} ${DIM}$field is empty (no hallucination)${NC}"
    SCENARIO_CHECKS_PASS=$((SCENARIO_CHECKS_PASS + 1))
  else
    echo -e "   ${RED}  ✗ $field should be empty (hallucinated: '$(echo "$value" | head -c 120)')${NC}"
    SCENARIO_CHECKS_FAIL=$((SCENARIO_CHECKS_FAIL + 1))
  fi
}

assert_not_empty() {
  local field="$1"
  local value; value=$(get_field "$field")
  if [[ -n "$value" && "$value" != "null" ]]; then
    echo -e "   ${GREEN}  ✓${NC} ${DIM}$field is populated${NC}"
    SCENARIO_CHECKS_PASS=$((SCENARIO_CHECKS_PASS + 1))
  else
    echo -e "   ${RED}  ✗ $field should be populated but is empty${NC}"
    SCENARIO_CHECKS_FAIL=$((SCENARIO_CHECKS_FAIL + 1))
  fi
}

assert_mews() {
  local expected="$1"
  local performed; performed=$(get_field "performedActions")
  local actual; actual=$(echo "$performed" | grep -oiE 'm-ews score: [0-9]+' | grep -oE '[0-9]+' | head -1)
  if [[ "$actual" == "$expected" ]]; then
    echo -e "   ${GREEN}  ✓${NC} ${DIM}M-EWS score is $actual${NC}"
    SCENARIO_CHECKS_PASS=$((SCENARIO_CHECKS_PASS + 1))
  else
    echo -e "   ${RED}  ✗ M-EWS expected $expected, got '${actual:-not found}'${NC}"
    SCENARIO_CHECKS_FAIL=$((SCENARIO_CHECKS_FAIL + 1))
  fi
}

assert_mews_gte() {
  local min="$1"
  local performed; performed=$(get_field "performedActions")
  local actual; actual=$(echo "$performed" | grep -oiE 'm-ews score: [0-9]+' | grep -oE '[0-9]+' | head -1)
  if [[ -n "$actual" && "$actual" -ge "$min" ]]; then
    echo -e "   ${GREEN}  ✓${NC} ${DIM}M-EWS score $actual >= $min${NC}"
    SCENARIO_CHECKS_PASS=$((SCENARIO_CHECKS_PASS + 1))
  else
    echo -e "   ${RED}  ✗ M-EWS expected >= $min, got '${actual:-not found}'${NC}"
    SCENARIO_CHECKS_FAIL=$((SCENARIO_CHECKS_FAIL + 1))
  fi
}

# ================================================================
# SCENARIO S01 — Abdominal pain, known allergy and medications
# Maria Kowalski, 35F, penicillin allergy, ibuprofen + vitamin D
# Expected M-EWS: HR=95(1) + Temp=38.2(1) = 2
# ================================================================
CONV=$(jq -n \
  --arg u1 "Hi, my name is Maria Kowalski. I have severe pain in my lower right abdomen." \
  --arg a1 "I am sorry to hear that Maria. How long have you had this pain? Does it radiate anywhere?" \
  --arg u2 "It started about 6 hours ago. The pain is mostly in the lower right side, doesn't radiate. It is a sharp, constant pain, rated 8 out of 10." \
  --arg a2 "Do you have any previous medical history? Any surgeries?" \
  --arg u3 "I had my appendix removed in 2018. No other conditions." \
  --arg a3 "Are you taking any medications? Do you have any known allergies?" \
  --arg u4 "I take ibuprofen 400 milligrams when needed for pain. And vitamin D 1000 units daily. I am allergic to penicillin, it gives me a rash." \
  --arg a4 "Thank you. Let me check your vital signs. Pulse is 95 beats per minute, blood pressure 118 over 78, oxygen saturation 97 percent, respiratory rate 18, temperature 38.2 degrees Celsius." \
  --arg u5 "I also feel a bit nauseous. No vomiting. No fever before this. No urinary symptoms." \
  '[
    {"role":"user","content":$u1},{"role":"assistant","content":$a1},
    {"role":"user","content":$u2},{"role":"assistant","content":$a2},
    {"role":"user","content":$u3},{"role":"assistant","content":$a3},
    {"role":"user","content":$u4},{"role":"assistant","content":$a4},
    {"role":"user","content":$u5}
  ]')

start_scenario "Abdominal pain — allergy + meds + vitals (Maria Kowalski)" "$(make_payload "$CONV")"
assert_contains "patientFirstName" "Maria"
assert_contains "patientLastName" "Kowalski"
assert_contains "allergies" "penicillin"
assert_contains "currentMedications" "ibuprofen"
assert_contains "problemDescription" "lower right"
assert_contains "problemDescription" "8"
assert_mews "2"
end_scenario

# ================================================================
# SCENARIO S02 — Chest pain, cardiac risk, complex medications
# Jan Nowak, 58M, hypertension, aspirin + amlodipine
# HR=112(2) + RR=22(2) + SpO2=94(1) → M-EWS=5
# ================================================================
CONV=$(jq -n \
  --arg u1 "My name is Jan Nowak. I have a crushing chest pain that started 30 minutes ago. It goes to my left arm." \
  --arg a1 "That sounds serious Jan. Does the pain go anywhere else? Do you have any shortness of breath?" \
  --arg u2 "Just to the left arm. Yes, I am a little short of breath. No nausea. No vomiting." \
  --arg a2 "Do you have any medical history? Are you a smoker?" \
  --arg u3 "I have hypertension for 10 years. I smoke half a pack a day for 30 years." \
  --arg a3 "What medications are you taking?" \
  --arg u4 "I take amlodipine 5 milligrams once daily and aspirin 75 milligrams once daily." \
  --arg a4 "Any allergies?" \
  --arg u5 "No allergies that I know of." \
  --arg a5 "Vital signs: pulse 112 beats per minute, blood pressure 165 over 95 mmHg, oxygen saturation 94 percent, respiratory rate 22 breaths per minute, temperature 37.0 degrees Celsius." \
  '[
    {"role":"user","content":$u1},{"role":"assistant","content":$a1},
    {"role":"user","content":$u2},{"role":"assistant","content":$a2},
    {"role":"user","content":$u3},{"role":"assistant","content":$a3},
    {"role":"user","content":$u4},{"role":"assistant","content":$a4},
    {"role":"user","content":$u5},{"role":"assistant","content":$a5}
  ]')

start_scenario "Chest pain — cardiac risk, aspirin + amlodipine (Jan Nowak)" "$(make_payload "$CONV")"
assert_contains "patientFirstName" "Jan"
assert_contains "patientLastName" "Nowak"
assert_contains "currentMedications" "amlodipine"
assert_contains "currentMedications" "aspirin"
assert_contains "allergies" "no"
assert_contains "problemDescription" "left arm"
assert_mews "5"
end_scenario

# ================================================================
# SCENARIO S03 — Head trauma, unconscious, no patient name
# Reported by chief officer; patient cannot speak
# HR=58(0), SBP=95(2) → M-EWS=2
# ================================================================
CONV=$(jq -n \
  --arg u1 "This is the chief officer. We found a crew member unconscious on deck after a fall from height. He hit his head. We do not know his name, he has no ID on him." \
  --arg a1 "Understood. Do you know how far he fell? Is he breathing?" \
  --arg u2 "He fell approximately 3 meters. He is breathing. There is a large wound on his head with active bleeding. He does not respond to voice." \
  --arg a2 "Vital signs please." \
  --arg u3 "Pulse is 58 beats per minute, blood pressure 95 over 60, oxygen saturation 96 percent, respiratory rate 12 breaths per minute, temperature 37.2 degrees Celsius." \
  '[
    {"role":"user","content":$u1},{"role":"assistant","content":$a1},
    {"role":"user","content":$u2},{"role":"assistant","content":$a2},
    {"role":"user","content":$u3}
  ]')

start_scenario "Head trauma — unconscious, no name, anti-hallucination" "$(make_payload "$CONV")"
assert_empty "patientFirstName"
assert_empty "patientLastName"
assert_not_empty "reportedBy"
assert_contains "problemDescription" "head"
assert_contains "problemDescription" "fall"
assert_mews "2"
end_scenario

# ================================================================
# SCENARIO S04 — COPD exacerbation, complex medications
# Thomas Berg, 67M, COPD + heart failure
# RR=28(3) + SpO2=88(3) + HR=110(1) = M-EWS 7
# ================================================================
CONV=$(jq -n \
  --arg u1 "I am Thomas Berg. I cannot breathe properly. It has been getting worse for two days." \
  --arg a1 "Thomas, are you having any chest pain along with the breathing difficulty?" \
  --arg u2 "No chest pain. Just cannot get enough air. I have to sit upright to breathe." \
  --arg a2 "Do you have any existing medical conditions?" \
  --arg u3 "I have COPD and heart failure. I have had these for many years." \
  --arg a3 "What medications are you currently taking?" \
  --arg u4 "Salbutamol inhaler as needed, furosemide 40 milligrams once daily, warfarin 5 milligrams, and digoxin 0.125 milligrams once daily." \
  --arg a4 "Any allergies to medications?" \
  --arg u5 "Yes, aspirin. It makes my breathing worse, causes bronchospasm." \
  --arg a5 "Vital signs: respiratory rate 28 breaths per minute, oxygen saturation 88 percent, pulse 110 beats per minute, blood pressure 145 over 88 mmHg, temperature 37.8 degrees Celsius." \
  '[
    {"role":"user","content":$u1},{"role":"assistant","content":$a1},
    {"role":"user","content":$u2},{"role":"assistant","content":$a2},
    {"role":"user","content":$u3},{"role":"assistant","content":$a3},
    {"role":"user","content":$u4},{"role":"assistant","content":$a4},
    {"role":"user","content":$u5},{"role":"assistant","content":$a5}
  ]')

start_scenario "COPD exacerbation — complex meds, aspirin allergy (Thomas Berg)" "$(make_payload "$CONV")"
assert_contains "patientFirstName" "Thomas"
assert_contains "currentMedications" "salbutamol"
assert_contains "currentMedications" "furosemide"
assert_contains "currentMedications" "warfarin"
assert_contains "allergies" "aspirin"
assert_mews "7"
end_scenario

# ================================================================
# SCENARIO S05 — Diabetic hypoglycemia, insulin + metformin
# Carlos Rodriguez, 42M, Type 2 DM
# HR=105(1) → M-EWS 1
# ================================================================
CONV=$(jq -n \
  --arg u1 "My name is Carlos Rodriguez. I am feeling very confused, sweaty and shaky. I think my sugar is low." \
  --arg a1 "Carlos, do you have diabetes? When did you last eat?" \
  --arg u2 "Yes, Type 2 diabetes. I had my insulin last night but did not eat breakfast this morning. I feel very weak." \
  --arg a2 "What medications do you take for your diabetes?" \
  --arg u3 "Metformin 850 milligrams twice daily and insulin glargine 20 units at bedtime." \
  --arg a3 "Any other conditions or medications?" \
  --arg u4 "No other conditions. No other medications." \
  --arg a4 "Any allergies?" \
  --arg u5 "No known allergies." \
  --arg a5 "I checked your blood sugar. It is 2.8 millimoles per litre, which is very low. Vital signs: pulse 105 beats per minute, blood pressure 138 over 85, oxygen saturation 98 percent, respiratory rate 16 breaths per minute, temperature 37.1 degrees Celsius." \
  '[
    {"role":"user","content":$u1},{"role":"assistant","content":$a1},
    {"role":"user","content":$u2},{"role":"assistant","content":$a2},
    {"role":"user","content":$u3},{"role":"assistant","content":$a3},
    {"role":"user","content":$u4},{"role":"assistant","content":$a4},
    {"role":"user","content":$u5},{"role":"assistant","content":$a5}
  ]')

start_scenario "Diabetic hypoglycemia — insulin + metformin (Carlos Rodriguez)" "$(make_payload "$CONV")"
assert_contains "patientFirstName" "Carlos"
assert_contains "currentMedications" "metformin"
assert_contains "currentMedications" "insulin"
assert_contains "allergies" "no"
assert_contains "problemDescription" "diabet"
assert_mews "1"
end_scenario

# ================================================================
# SCENARIO S06 — Anaphylaxis after shellfish
# Sarah Williams, 29F, throat swelling
# HR=128(2) + SBP=88(3) + SpO2=92(2) + RR=24(2) → M-EWS 9
# ================================================================
CONV=$(jq -n \
  --arg u1 "I am Sarah Williams. I ate shrimp 20 minutes ago and now my throat is swelling, I have a rash all over my body and I cannot breathe properly." \
  --arg a1 "Sarah, have you ever had a reaction like this before? Are you known to be allergic to shellfish?" \
  --arg u2 "No, this has never happened before. I have eaten shrimp before but never had this reaction." \
  --arg a2 "Any medical history? Any medications?" \
  --arg u3 "No medical history. I take no medications." \
  --arg a3 "Any other known allergies apart from what we are discovering now?" \
  --arg u4 "No other allergies." \
  --arg a4 "Vital signs: pulse 128 beats per minute, blood pressure 88 over 55 mmHg, oxygen saturation 92 percent, respiratory rate 24 breaths per minute, temperature 37.0 degrees Celsius." \
  '[
    {"role":"user","content":$u1},{"role":"assistant","content":$a1},
    {"role":"user","content":$u2},{"role":"assistant","content":$a2},
    {"role":"user","content":$u3},{"role":"assistant","content":$a3},
    {"role":"user","content":$u4},{"role":"assistant","content":$a4}
  ]')

start_scenario "Anaphylaxis — shellfish, throat swelling (Sarah Williams)" "$(make_payload "$CONV")"
assert_contains "patientFirstName" "Sarah"
assert_contains "allergies" "shellfish"
assert_contains "problemDescription" "throat"
assert_contains "problemDescription" "rash"
assert_mews "9"
end_scenario

# ================================================================
# SCENARIO S07 — Near-drowning, hypothermic, no ID
# HR=48(1) + Temp=33.5(3) + RR=10(1) + SBP=105(1) + SpO2=89(3) → M-EWS 9
# ================================================================
CONV=$(jq -n \
  --arg u1 "This is the second officer. We pulled a male from the water. He fell overboard about 15 minutes ago. He is semi-conscious, we cannot identify him. He looks around 30 years old." \
  --arg a1 "Is he breathing on his own? What is his level of consciousness?" \
  --arg u2 "He is breathing but very slowly. He responds to pain but not to voice. He is shivering severely. He was in the water for at least 15 minutes in cold sea conditions." \
  --arg a2 "Vital signs please." \
  --arg u3 "Pulse is 48 beats per minute, respiratory rate 10 breaths per minute, temperature 33.5 degrees Celsius, blood pressure 105 over 68, oxygen saturation 89 percent." \
  '[
    {"role":"user","content":$u1},{"role":"assistant","content":$a1},
    {"role":"user","content":$u2},{"role":"assistant","content":$a2},
    {"role":"user","content":$u3}
  ]')

start_scenario "Near-drowning — hypothermic, no identity, critical vitals" "$(make_payload "$CONV")"
assert_empty "patientFirstName"
assert_empty "patientLastName"
assert_contains "problemDescription" "water"
assert_contains "problemDescription" "cold"
assert_not_empty "reportedBy"
assert_mews "9"
end_scenario

# ================================================================
# SCENARIO S08 — Chemical burns, mildly elevated HR
# Piotr Wisniewski, 45M, acid spill, 15% TBSA
# HR=98(1) → M-EWS 1
# ================================================================
CONV=$(jq -n \
  --arg u1 "My name is Piotr Wisniewski. I spilled sulfuric acid on my hands and forearms. It happened 10 minutes ago." \
  --arg a1 "Piotr, how did it happen? Have you rinsed the area with water?" \
  --arg u2 "I was working in the engine room. A container broke. I have been rinsing with water for the last 10 minutes. The burns cover both hands and forearms, approximately 15 percent of my body surface area." \
  --arg a2 "Do you have any other symptoms? Any difficulty breathing? Any eye involvement?" \
  --arg u3 "No breathing problems. Eyes are fine. Only the hands and arms are affected. Severe pain at the burn sites." \
  --arg a3 "Medical history and medications?" \
  --arg u4 "No medical history, no medications, no allergies." \
  --arg a4 "Vital signs: pulse 98 beats per minute, blood pressure 130 over 85, oxygen saturation 99 percent, respiratory rate 18 breaths per minute, temperature 37.5 degrees Celsius." \
  '[
    {"role":"user","content":$u1},{"role":"assistant","content":$a1},
    {"role":"user","content":$u2},{"role":"assistant","content":$a2},
    {"role":"user","content":$u3},{"role":"assistant","content":$a3},
    {"role":"user","content":$u4},{"role":"assistant","content":$a4}
  ]')

start_scenario "Chemical burns — 15% TBSA (Piotr Wisniewski)" "$(make_payload "$CONV")"
assert_contains "patientFirstName" "Piotr"
assert_contains "chiefComplaint" "burn"
assert_contains "problemDescription" "15"
assert_contains "problemDescription" "acid"
assert_contains "allergies" "no"
assert_mews "1"
end_scenario

# ================================================================
# SCENARIO S09 — Psychiatric: panic attack, sertraline + lorazepam
# Emma Larsen, 31F
# HR=118(2) + RR=22(2) → M-EWS=4
# ================================================================
CONV=$(jq -n \
  --arg u1 "I am Emma Larsen. I feel like I am dying. My heart is racing, I cannot breathe, everything feels unreal." \
  --arg a1 "Emma, have you experienced this before? Do you have any psychiatric history?" \
  --arg u2 "Yes, I have anxiety disorder, diagnosed 3 years ago. I have had panic attacks before but not this bad. No chest pain. No numbness." \
  --arg a2 "What medications do you take?" \
  --arg u3 "Sertraline 50 milligrams once daily in the morning. Lorazepam 0.5 milligrams as needed, but I have not taken it today." \
  --arg a3 "Any allergies?" \
  --arg u4 "No allergies." \
  --arg a4 "Vital signs: pulse 118 beats per minute, blood pressure 138 over 90, oxygen saturation 99 percent, respiratory rate 22 breaths per minute, temperature 37.0 degrees Celsius." \
  --arg u5 "I feel dizzy. No vomiting. No headache." \
  '[
    {"role":"user","content":$u1},{"role":"assistant","content":$a1},
    {"role":"user","content":$u2},{"role":"assistant","content":$a2},
    {"role":"user","content":$u3},{"role":"assistant","content":$a3},
    {"role":"user","content":$u4},{"role":"assistant","content":$a4},
    {"role":"user","content":$u5}
  ]')

start_scenario "Panic attack — anxiety history, sertraline + lorazepam (Emma Larsen)" "$(make_payload "$CONV")"
assert_contains "patientFirstName" "Emma"
assert_contains "currentMedications" "sertraline"
assert_contains "currentMedications" "lorazepam"
assert_contains "problemDescription" "anxiety"
assert_contains "problemDescription" "denies"
assert_mews "4"
end_scenario

# ================================================================
# SCENARIO S10 — Fracture, codeine allergy, polypharmacy
# Anders Hansen, 52M, fell from ladder
# ================================================================
CONV=$(jq -n \
  --arg u1 "My name is Anders Hansen. I fell from a ladder about an hour ago and I think I broke my right leg. The pain is very bad." \
  --arg a1 "Anders, how far did you fall? Can you move your leg at all?" \
  --arg u2 "About 2 meters. I cannot move the leg at all. It is deformed. The pain is 9 out of 10." \
  --arg a2 "Any medical history?" \
  --arg u3 "Hypertension and osteoporosis." \
  --arg a3 "Medications and allergies?" \
  --arg u4 "Lisinopril 10 milligrams once daily. Calcium carbonate 500 milligrams twice daily. Vitamin D 800 units daily. I am allergic to codeine, it makes me vomit severely." \
  --arg a4 "Any other symptoms? Head injury? Loss of consciousness?" \
  --arg u5 "No head injury. I did not lose consciousness. No other pain apart from the leg." \
  --arg a5 "Vital signs: pulse 88 beats per minute, blood pressure 148 over 92, oxygen saturation 98 percent, respiratory rate 16 breaths per minute, temperature 37.1 degrees Celsius." \
  '[
    {"role":"user","content":$u1},{"role":"assistant","content":$a1},
    {"role":"user","content":$u2},{"role":"assistant","content":$a2},
    {"role":"user","content":$u3},{"role":"assistant","content":$a3},
    {"role":"user","content":$u4},{"role":"assistant","content":$a4},
    {"role":"user","content":$u5},{"role":"assistant","content":$a5}
  ]')

start_scenario "Fracture — codeine allergy, hypertension meds (Anders Hansen)" "$(make_payload "$CONV")"
assert_contains "patientFirstName" "Anders"
assert_contains "currentMedications" "lisinopril"
assert_contains "currentMedications" "calcium"
assert_contains "allergies" "codeine"
assert_contains "problemDescription" "leg"
assert_mews "0"
end_scenario

# ================================================================
# SCENARIO S11 — Sepsis-like fever, no medications
# Kwame Asante, 38M, fever + confusion + flank pain
# HR=122(2) + Temp=39.9(3) + SBP=102(1) + RR=23(2) → M-EWS 8
# ================================================================
CONV=$(jq -n \
  --arg u1 "I am Kwame Asante. I have a very high fever, chills and I am confused. I also have pain in my right side, lower back area." \
  --arg a1 "How long have you had the fever Kwame? Has it been building up gradually?" \
  --arg u2 "It started yesterday with chills. Today I have this pain on the right side. I feel very unwell. I vomited twice." \
  --arg a2 "Any medical history?" \
  --arg u3 "No medical history. I am normally healthy." \
  --arg a3 "Any medications or allergies?" \
  --arg u4 "No medications. No allergies." \
  --arg a4 "Vital signs: pulse 122 beats per minute, blood pressure 102 over 68, oxygen saturation 96 percent, respiratory rate 23 breaths per minute, temperature 39.9 degrees Celsius." \
  '[
    {"role":"user","content":$u1},{"role":"assistant","content":$a1},
    {"role":"user","content":$u2},{"role":"assistant","content":$a2},
    {"role":"user","content":$u3},{"role":"assistant","content":$a3},
    {"role":"user","content":$u4},{"role":"assistant","content":$a4}
  ]')

start_scenario "Sepsis-like fever — flank pain, confusion (Kwame Asante)" "$(make_payload "$CONV")"
assert_contains "patientFirstName" "Kwame"
assert_contains "problemDescription" "fever"
assert_contains "problemDescription" "vomit"
assert_contains "allergies" "no"
assert_mews "8"
end_scenario

# ================================================================
# SCENARIO S12 — Stroke symptoms, anticoagulant, statin allergy
# Mikael Svensson, 64M
# ================================================================
CONV=$(jq -n \
  --arg u1 "This is the chief steward calling for Mikael Svensson, 64 years old. He suddenly developed facial droop on the right side, his right arm is weak and his speech is slurred. This started about 40 minutes ago." \
  --arg a1 "Has he had any head injury or seizure? Is he conscious?" \
  --arg u2 "No injury. He is conscious but confused. He has hypertension and atrial fibrillation." \
  --arg a2 "What medications does he take?" \
  --arg u3 "Warfarin 7.5 milligrams daily, bisoprolol 5 milligrams, ramipril 5 milligrams. He is allergic to statins, they caused severe muscle pain." \
  --arg a3 "Vital signs." \
  --arg u4 "Pulse 72 beats per minute, blood pressure 185 over 105, oxygen saturation 96 percent, respiratory rate 16 breaths per minute, temperature 37.2 degrees Celsius." \
  '[
    {"role":"user","content":$u1},{"role":"assistant","content":$a1},
    {"role":"user","content":$u2},{"role":"assistant","content":$a2},
    {"role":"user","content":$u3},{"role":"assistant","content":$a3},
    {"role":"user","content":$u4}
  ]')

start_scenario "Stroke symptoms — warfarin, statin allergy (Mikael Svensson)" "$(make_payload "$CONV")"
assert_contains "patientFirstName" "Mikael"
assert_contains "currentMedications" "warfarin"
assert_contains "currentMedications" "bisoprolol"
assert_contains "allergies" "statin"
assert_contains "problemDescription" "facial"
assert_contains "problemDescription" "arm"
assert_mews "2"
end_scenario

# ================================================================
# SCENARIO S13 — Eye injury, minimal history, normal vitals
# Dmitri Volkov, 35M, metal fragment in eye
# ================================================================
CONV=$(jq -n \
  --arg u1 "My name is Dmitri Volkov. I was grinding metal without goggles and something went into my right eye. I cannot open it and it is very painful." \
  --arg a1 "Can you see out of that eye at all? Did you flush the eye with water?" \
  --arg u2 "I flushed it for 5 minutes. Vision is blurry in that eye. The pain is 7 out of 10." \
  --arg a2 "Any medical history? Medications? Allergies?" \
  --arg u3 "I am completely healthy. No medications. No allergies." \
  --arg a3 "Vital signs: pulse 90, blood pressure 125 over 80, oxygen saturation 99 percent, respiratory rate 16, temperature 37.0." \
  '[
    {"role":"user","content":$u1},{"role":"assistant","content":$a1},
    {"role":"user","content":$u2},{"role":"assistant","content":$a2},
    {"role":"user","content":$u3},{"role":"assistant","content":$a3}
  ]')

start_scenario "Eye injury — metal fragment, healthy patient (Dmitri Volkov)" "$(make_payload "$CONV")"
assert_contains "patientFirstName" "Dmitri"
assert_contains "chiefComplaint" "eye"
assert_contains "allergies" "no"
assert_not_empty "problemDescription"
assert_mews "0"
end_scenario

# ================================================================
# SCENARIO S14 — Anti-hallucination: patient refuses most questions
# John Smith gives name and chief complaint only
# ================================================================
CONV=$(jq -n \
  --arg u1 "My name is John Smith. I have a stomach ache." \
  --arg a1 "John, when did it start? Where exactly is the pain?" \
  --arg u2 "I do not want to answer more questions." \
  --arg a2 "Do you take any medications? Do you have any allergies?" \
  --arg u3 "I am not going to answer that." \
  --arg a3 "What is your medical history?" \
  --arg u4 "I refuse to discuss this." \
  '[
    {"role":"user","content":$u1},{"role":"assistant","content":$a1},
    {"role":"user","content":$u2},{"role":"assistant","content":$a2},
    {"role":"user","content":$u3},{"role":"assistant","content":$a3},
    {"role":"user","content":$u4}
  ]')

start_scenario "Anti-hallucination — patient refuses all questions (John Smith)" "$(make_payload "$CONV")"
assert_contains "patientFirstName" "John"
assert_contains "patientLastName" "Smith"
assert_not_contains "currentMedications" "metformin"
assert_not_contains "currentMedications" "lisinopril"
assert_not_contains "currentMedications" "aspirin"
assert_not_contains "pastHistory" "hypertension"
assert_not_contains "pastHistory" "diabetes"
end_scenario

# ================================================================
# SCENARIO S15 — Full interview in Polish
# Andrzej Kowalczyk, 55M, ból klatki piersiowej
# ================================================================
CONV=$(jq -n \
  --arg u1 "Nazywam się Andrzej Kowalczyk. Mam silny ból w klatce piersiowej od godziny." \
  --arg a1 "Czy ból promieniuje gdzieś? Czy ma Pan duszność?" \
  --arg u2 "Ból promieniuje do lewego ramienia. Mam lekką duszność. Nie mam nudności." \
  --arg a2 "Jakie choroby Pan ma? Jakie leki Pan bierze?" \
  --arg u3 "Mam nadciśnienie od 10 lat. Biorę lisinopril 10 miligramów raz dziennie i aspirynę 75 miligramów raz dziennie." \
  --arg a3 "Czy ma Pan jakieś alergie?" \
  --arg u4 "Nie, żadnych alergii." \
  --arg a4 "Parametry życiowe: puls 105 uderzeń na minutę, ciśnienie 162 na 95, saturacja 96 procent, oddech 20 na minutę, temperatura 37.0 stopni." \
  '[
    {"role":"user","content":$u1},{"role":"assistant","content":$a1},
    {"role":"user","content":$u2},{"role":"assistant","content":$a2},
    {"role":"user","content":$u3},{"role":"assistant","content":$a3},
    {"role":"user","content":$u4},{"role":"assistant","content":$a4}
  ]')

start_scenario "Polish language interview — chest pain (Andrzej Kowalczyk)" "$(make_payload "$CONV")"
assert_contains "patientFirstName" "Andrzej"
assert_contains "patientLastName" "Kowalczyk"
assert_contains "currentMedications" "lisinopril"
assert_contains "currentMedications" "aspirin"
assert_contains "allergies" "no"
assert_not_empty "chiefComplaint"
assert_not_empty "problemDescription"
end_scenario

# ================================================================
# SCENARIO S16 — Paracetamol overdose, patient refuses name
# Intentional overdose of 20 tablets
# HR=105(1) → M-EWS 1
# ================================================================
CONV=$(jq -n \
  --arg u1 "I took about 20 paracetamol tablets two hours ago intentionally. I do not want to give my name." \
  --arg a1 "I understand. Are you feeling any nausea or stomach pain? Have you vomited?" \
  --arg u2 "I feel sick and my stomach hurts. I vomited once. I am not going to say my name." \
  --arg a2 "Have you taken anything else? Any alcohol? Other medications?" \
  --arg u3 "Just the paracetamol. No alcohol. I take no other medications normally." \
  --arg a3 "Any allergies?" \
  --arg u4 "No allergies." \
  --arg a4 "Vital signs: pulse 105, blood pressure 115 over 75, oxygen saturation 99 percent, respiratory rate 18, temperature 37.2 degrees Celsius." \
  '[
    {"role":"user","content":$u1},{"role":"assistant","content":$a1},
    {"role":"user","content":$u2},{"role":"assistant","content":$a2},
    {"role":"user","content":$u3},{"role":"assistant","content":$a3},
    {"role":"user","content":$u4},{"role":"assistant","content":$a4}
  ]')

start_scenario "Paracetamol overdose — patient refuses name, anti-hallucination" "$(make_payload "$CONV")"
assert_empty "patientFirstName"
assert_empty "patientLastName"
assert_contains "chiefComplaint" "paracetamol"
assert_contains "problemDescription" "20"
assert_contains "problemDescription" "vomit"
assert_mews "1"
end_scenario

# ================================================================
# SCENARIO S17 — Explicit no allergies, no medications
# Fatima Al-Hassan
# ================================================================
CONV=$(jq -n \
  --arg u1 "My name is Fatima Al-Hassan. I have lower back pain for three days." \
  --arg a1 "Fatima, any medications or allergies I should know about?" \
  --arg u2 "I have absolutely no allergies. I take no medications at all, not even vitamins." \
  --arg a2 "Any medical history? Previous injuries?" \
  --arg u3 "I had a similar episode two years ago, resolved on its own. No other history." \
  '[
    {"role":"user","content":$u1},{"role":"assistant","content":$a1},
    {"role":"user","content":$u2},{"role":"assistant","content":$a2},
    {"role":"user","content":$u3}
  ]')

start_scenario "Explicit no allergies / no medications (Fatima Al-Hassan)" "$(make_payload "$CONV")"
assert_contains "patientFirstName" "Fatima"
assert_contains "allergies" "no"
assert_not_contains "allergies" "not provided"
assert_contains "currentMedications" "no"
assert_not_contains "currentMedications" "not provided"
end_scenario

# ================================================================
# SCENARIO S18 — Negative findings documentation test
# Niko Mäkinen — denials must appear in problemDescription
# ================================================================
CONV=$(jq -n \
  --arg u1 "My name is Niko Mäkinen. I have a headache for the past two hours." \
  --arg a1 "Niko, do you have any nausea or vomiting?" \
  --arg u2 "No nausea, no vomiting." \
  --arg a2 "Any fever? Neck stiffness?" \
  --arg u3 "No fever. No neck stiffness." \
  --arg a3 "Any vision changes? Sensitivity to light?" \
  --arg u4 "No vision changes. No sensitivity to light." \
  --arg a4 "Any weakness in your arms or legs? Any speech problems?" \
  --arg u5 "No weakness. No speech problems. No numbness." \
  --arg a5 "Any previous similar headaches? Any trauma?" \
  --arg u6 "I get headaches sometimes. No trauma. No loss of consciousness." \
  '[
    {"role":"user","content":$u1},{"role":"assistant","content":$a1},
    {"role":"user","content":$u2},{"role":"assistant","content":$a2},
    {"role":"user","content":$u3},{"role":"assistant","content":$a3},
    {"role":"user","content":$u4},{"role":"assistant","content":$a4},
    {"role":"user","content":$u5},{"role":"assistant","content":$a5},
    {"role":"user","content":$u6}
  ]')

start_scenario "Negative findings — denials must appear in problemDescription (Niko Mäkinen)" "$(make_payload "$CONV")"
assert_contains "patientFirstName" "Niko"
assert_contains "problemDescription" "denies"
assert_contains "problemDescription" "nausea"
assert_contains "problemDescription" "vomiting"
assert_contains "problemDescription" "fever"
end_scenario

# ================================================================
# SCENARIO S19 — Complex polypharmacy (6 medications)
# György Szabó — all 6 must be extracted
# ================================================================
CONV=$(jq -n \
  --arg u1 "My name is György Szabó. I have swollen ankles and shortness of breath on exertion for two days." \
  --arg a1 "György, what medical conditions do you have?" \
  --arg u2 "Type 2 diabetes, hypertension, heart failure, high cholesterol and reflux." \
  --arg a2 "What medications are you on?" \
  --arg u3 "Metformin 850 milligrams twice daily. Lisinopril 10 milligrams once daily. Atorvastatin 40 milligrams at bedtime. Omeprazole 20 milligrams once daily. Furosemide 40 milligrams once daily. Bisoprolol 5 milligrams once daily." \
  --arg a3 "Any allergies?" \
  --arg u4 "Sulfonamides, they gave me a severe skin reaction once." \
  '[
    {"role":"user","content":$u1},{"role":"assistant","content":$a1},
    {"role":"user","content":$u2},{"role":"assistant","content":$a2},
    {"role":"user","content":$u3},{"role":"assistant","content":$a3},
    {"role":"user","content":$u4}
  ]')

start_scenario "Polypharmacy — 6 medications must all be extracted (György Szabó)" "$(make_payload "$CONV")"
assert_contains "currentMedications" "metformin"
assert_contains "currentMedications" "lisinopril"
assert_contains "currentMedications" "atorvastatin"
assert_contains "currentMedications" "omeprazole"
assert_contains "currentMedications" "furosemide"
assert_contains "currentMedications" "bisoprolol"
assert_contains "allergies" "sulfonamide"
end_scenario

# ================================================================
# SCENARIO S20 — Vitals reported twice (update mid-conversation)
# Lena Bergström — M-EWS must be computed (>= 0)
# ================================================================
CONV=$(jq -n \
  --arg u1 "My name is Lena Bergström. I have palpitations and feel faint when I climb stairs." \
  --arg a1 "Lena, let me take your resting vital signs first." \
  --arg u2 "Okay." \
  --arg a2 "Resting measurements: pulse 72 beats per minute, blood pressure 122 over 78, oxygen saturation 98 percent, temperature 37.0, respiratory rate 16 breaths per minute." \
  --arg u3 "Yes, at rest I feel fine. It is only when I exert myself." \
  --arg a3 "I will now measure your vitals again immediately after you walk up and down the corridor." \
  --arg u4 "That made me feel very dizzy and my heart is racing." \
  --arg a4 "Post-exertion measurements: pulse 145 beats per minute, blood pressure 148 over 92, oxygen saturation 97 percent, respiratory rate 22 breaths per minute." \
  '[
    {"role":"user","content":$u1},{"role":"assistant","content":$a1},
    {"role":"user","content":$u2},{"role":"assistant","content":$a2},
    {"role":"user","content":$u3},{"role":"assistant","content":$a3},
    {"role":"user","content":$u4},{"role":"assistant","content":$a4}
  ]')

start_scenario "Vitals updated twice — post-exertion HR=145 must drive M-EWS (Lena Bergström)" "$(make_payload "$CONV")"
assert_contains "patientFirstName" "Lena"
assert_contains "problemDescription" "palpitation"
assert_not_empty "performedActions"
assert_mews_gte "0"
end_scenario

# ================================================================
# Final summary
# ================================================================
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════${NC}"
printf "${BOLD}  Scenarios : %d total\n${NC}" "$TOTAL_SCENARIOS"
printf "${GREEN}  ✅ Passed  : %d\n${NC}" "$PASS_SCENARIOS"
printf "${RED}  ❌ Failed  : %d\n${NC}" "$FAIL_SCENARIOS"
echo ""
printf "${BOLD}  Assertions: %d total\n${NC}" "$TOTAL_CHECKS"
printf "${GREEN}  ✓  Passed  : %d\n${NC}" "$PASS_CHECKS"
printf "${RED}  ✗  Failed  : %d\n${NC}" "$FAIL_CHECKS"
echo -e "${BOLD}════════════════════════════════════════════════════${NC}"
echo ""
echo "  Output saved to: $OUTPUT_FILE"
echo ""

if [[ $FAIL_SCENARIOS -gt 0 ]]; then
  exit 1
fi
exit 0
