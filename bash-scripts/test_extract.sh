#!/usr/bin/env bash
# =============================================================================
# Marina API — Extract Prompt Quality Test Script
# =============================================================================
# Usage:  ./bash-scripts/test_extract.sh [BASE_URL]
# Default BASE_URL: http://localhost:4000
#
# Tests the POST /ai/extract endpoint against realistic clinical conversations,
# checking that specific fields are correctly extracted from the summary.
# =============================================================================

BASE="${1:-http://localhost:4000}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0; FAIL=0; WARN=0; TOTAL=0

pass() { PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); echo -e "  ${GREEN}✓ PASS${NC} [$TOTAL] $*"; }
fail() { FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); echo -e "  ${RED}✗ FAIL${NC} [$TOTAL] $*"; }
warn() { WARN=$((WARN+1)); TOTAL=$((TOTAL+1)); echo -e "  ${YELLOW}⚠ WARN${NC} [$TOTAL] $*"; }
info() { echo -e "       $*"; }
section() { echo -e "\n${BOLD}── $* ──${NC}"; }
header()  { echo -e "\n${BOLD}${BLUE}════════════════════════════════════════════════${NC}";
            echo -e "${BOLD}${BLUE}  $*${NC}";
            echo -e "${BOLD}${BLUE}════════════════════════════════════════════════${NC}"; }

# Login
AT=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"radomski.adr@gmail.com","password":"Gierek123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [[ -z "$AT" ]]; then
  echo -e "${RED}Could not obtain access token — is the server running?${NC}"
  exit 1
fi
echo -e "Token: ${AT:0:40}..."

# ---------------------------------------------------------------------------
# assert_extract LABEL CONVERSATION_JSON FIELD EXPECTED_SUBSTR
#
# Sends the conversation to /ai/extract, reads summary.FIELD, and checks
# that it contains EXPECTED_SUBSTR (case-insensitive).
# On 502 warns instead of failing (Nebius may be down).
# ---------------------------------------------------------------------------
assert_extract() {
  local label="$1" payload="$2" field="$3" expected="$4"
  local resp code value

  resp=$(curl -s -w "\nHTTP:%{http_code}" -X POST "$BASE/ai/extract" \
    -H "Authorization: Bearer $AT" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>/dev/null)

  code=$(printf '%s' "$resp" | tail -1 | grep -o '[0-9]*$')
  body=$(printf '%s\n' "$resp" | sed '$d')

  if [[ "$code" == "502" ]]; then
    warn "$label — Nebius unavailable (502)"
    return
  fi

  if [[ "$code" != "200" ]]; then
    fail "$label — expected HTTP 200, got HTTP $code"
    return
  fi

  value=$(printf '%s' "$body" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('summary',{}).get('$field',''))" 2>/dev/null)

  if [[ -z "$value" ]]; then
    fail "$label — field '$field' is empty"
    return
  fi

  if printf '%s' "$value" | grep -qi "$expected"; then
    pass "$label"
    info "  $field: $value"
  else
    fail "$label — '$expected' not found in $field: $value"
  fi
}

# assert_extract_bool LABEL CONVERSATION_JSON FIELD
# Checks that summary.FIELD is true (boolean).
assert_extract_bool() {
  local label="$1" payload="$2" field="$3"
  local resp code value

  resp=$(curl -s -w "\nHTTP:%{http_code}" -X POST "$BASE/ai/extract" \
    -H "Authorization: Bearer $AT" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>/dev/null)

  code=$(printf '%s' "$resp" | tail -1 | grep -o '[0-9]*$')
  body=$(printf '%s\n' "$resp" | sed '$d')

  if [[ "$code" == "502" ]]; then
    warn "$label — Nebius unavailable (502)"
    return
  fi

  if [[ "$code" != "200" ]]; then
    fail "$label — expected HTTP 200, got HTTP $code"
    return
  fi

  value=$(printf '%s' "$body" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('summary',{}).get('$field',''))" 2>/dev/null)

  if [[ "$value" == "True" ]]; then
    pass "$label — $field is true"
  else
    fail "$label — expected '$field' to be true, got: $value"
  fi
}

# ---------------------------------------------------------------------------
header "Extract Prompt Quality Tests  ($(date '+%Y-%m-%d %H:%M:%S'))"
echo "BASE: $BASE"
# ---------------------------------------------------------------------------

# =============================================================================
section "EQ1. CHIEF COMPLAINT — chest pain"
# =============================================================================
assert_extract "[EQ1] chiefComplaint contains 'chest'" \
  '{"conversation":[
    {"role":"user","content":"I have chest pain since this morning"},
    {"role":"assistant","content":"How severe is the pain on a scale of 1-10?"},
    {"role":"user","content":"About 7 out of 10"}
  ]}' \
  "chiefComplaint" "chest"

# =============================================================================
section "EQ2. PATIENT NAME — first and last name"
# =============================================================================
assert_extract "[EQ2] patientFirstName contains 'John'" \
  '{"conversation":[
    {"role":"assistant","content":"What is your name?"},
    {"role":"user","content":"My name is John Smith"},
    {"role":"assistant","content":"How can I help you today?"},
    {"role":"user","content":"I have a headache"}
  ]}' \
  "patientFirstName" "John"

assert_extract "[EQ2] patientLastName contains 'Smith'" \
  '{"conversation":[
    {"role":"assistant","content":"What is your name?"},
    {"role":"user","content":"My name is John Smith"},
    {"role":"assistant","content":"How can I help you today?"},
    {"role":"user","content":"I have a headache"}
  ]}' \
  "patientLastName" "Smith"

# =============================================================================
section "EQ3. VITAL SIGNS — pulse extraction"
# =============================================================================
assert_extract "[EQ3] circulation_pulse_per_min contains '92'" \
  '{"conversation":[
    {"role":"assistant","content":"I am going to check your vital signs now."},
    {"role":"user","content":"Okay"},
    {"role":"assistant","content":"Your pulse is 92 beats per minute, blood pressure 140 over 90, oxygen saturation 96 percent."},
    {"role":"user","content":"Is that normal?"}
  ]}' \
  "circulation_pulse_per_min" "92"

# =============================================================================
section "EQ4. VITAL SIGNS — blood pressure"
# =============================================================================
assert_extract "[EQ4] circulation_systole contains '140'" \
  '{"conversation":[
    {"role":"assistant","content":"Blood pressure is 140 over 90 mmHg."},
    {"role":"user","content":"Thank you"}
  ]}' \
  "circulation_systole" "140"

# =============================================================================
section "EQ5. MEDICATION — ibuprofen in treatment"
# =============================================================================
assert_extract "[EQ5] treatment contains 'ibuprofen'" \
  '{"conversation":[
    {"role":"user","content":"I have a severe headache"},
    {"role":"assistant","content":"I will administer ibuprofen 400mg orally. Please rest and drink water."},
    {"role":"user","content":"Thank you"}
  ]}' \
  "treatment" "ibuprofen"

# =============================================================================
section "EQ6. MEDICATION FIELD — explicit medication slot"
# =============================================================================
assert_extract "[EQ6] medications_field1 contains 'aspirin'" \
  '{"conversation":[
    {"role":"user","content":"I have chest pain radiating to my left arm"},
    {"role":"assistant","content":"I am giving you aspirin 300mg sublingually now at 14:30."},
    {"role":"user","content":"Okay"}
  ]}' \
  "medications_field1" "aspirin"

# =============================================================================
section "EQ7. RED FLAG — chest pain with radiation"
# =============================================================================
assert_extract "[EQ7] redFlag is 'yes'" \
  '{"conversation":[
    {"role":"user","content":"I have crushing chest pain radiating down my left arm for the past 30 minutes"},
    {"role":"assistant","content":"This sounds serious. Are you sweating or feeling nauseous?"},
    {"role":"user","content":"Yes, I am sweating and feel like I might pass out"}
  ]}' \
  "redFlag" "yes"

# =============================================================================
section "EQ8. HISTORY — past medical history"
# =============================================================================
assert_extract "[EQ8] pastHistory contains 'diabetes'" \
  '{"conversation":[
    {"role":"assistant","content":"Do you have any past medical conditions?"},
    {"role":"user","content":"Yes, I have type 2 diabetes and high blood pressure"},
    {"role":"assistant","content":"Are you taking any medications?"},
    {"role":"user","content":"Metformin 500mg twice daily and lisinopril 10mg"}
  ]}' \
  "pastHistory" "diabetes"

# =============================================================================
section "EQ9. ALLERGIES"
# =============================================================================
assert_extract "[EQ9] allergies contains 'penicillin'" \
  '{"conversation":[
    {"role":"assistant","content":"Do you have any known allergies?"},
    {"role":"user","content":"Yes, I am allergic to penicillin — it gives me a rash"},
    {"role":"assistant","content":"Noted. We will avoid penicillin-based antibiotics."}
  ]}' \
  "allergies" "penicillin"

# =============================================================================
section "EQ10. NO MEDICATIONS checkbox"
# =============================================================================
assert_extract_bool "[EQ10] no_medicine is true" \
  '{"conversation":[
    {"role":"assistant","content":"Are you currently taking any medications?"},
    {"role":"user","content":"No, I do not take any medications at all."}
  ]}' \
  "no_medicine"

# =============================================================================
section "EQ11. SHIP NAME — vessel identification"
# =============================================================================
assert_extract "[EQ11] shipName contains 'Atlantic'" \
  '{"conversation":[
    {"role":"assistant","content":"What is the name of your vessel?"},
    {"role":"user","content":"We are aboard the MV Atlantic Carrier"},
    {"role":"assistant","content":"And what is your position?"},
    {"role":"user","content":"We are at coordinates 52 North, 18 West"}
  ]}' \
  "shipName" "Atlantic"

# =============================================================================
section "EQ12. PROBLEM DESCRIPTION — composite narrative"
# =============================================================================
assert_extract "[EQ12] problemDescription contains 'chest'" \
  '{"conversation":[
    {"role":"user","content":"I have had chest pain since 08:00 this morning"},
    {"role":"assistant","content":"How severe is it?"},
    {"role":"user","content":"About 8 out of 10, it is crushing and goes to my left arm"},
    {"role":"assistant","content":"Are you short of breath?"},
    {"role":"user","content":"Yes, and I am sweating a lot"}
  ]}' \
  "problemDescription" "chest"

# =============================================================================
section "EQ13. NON-ENGLISH INPUT — Polish conversation extracted in English"
# =============================================================================
assert_extract "[EQ13] chiefComplaint extracted in English from Polish" \
  '{"conversation":[
    {"role":"assistant","content":"Co panu dolega?"},
    {"role":"user","content":"Mam silny ból głowy od dwóch godzin"},
    {"role":"assistant","content":"Jak silny ból w skali 1 do 10?"},
    {"role":"user","content":"Około 8"}
  ]}' \
  "chiefComplaint" "headache"

# =============================================================================
section "EQ14. USERPROFILE — pre-population of ship name"
# =============================================================================
assert_extract "[EQ14] shipName from userProfile when not in conversation" \
  '{"conversation":[
    {"role":"user","content":"I have a fever of 39 degrees"},
    {"role":"assistant","content":"How long have you had the fever?"},
    {"role":"user","content":"Since yesterday evening"}
  ],"userProfile":{"ship_name":"MV Nordic Star"}}' \
  "shipName" "Nordic"

# =============================================================================
section "EQ15. OXYGEN SATURATION"
# =============================================================================
assert_extract "[EQ15] breathing_oxygen_saturation contains '94'" \
  '{"conversation":[
    {"role":"assistant","content":"Oxygen saturation measured at 94 percent on room air."},
    {"role":"user","content":"Is that low?"},
    {"role":"assistant","content":"It is slightly below normal. I will administer supplemental oxygen at 4 litres per minute."}
  ]}' \
  "breathing_oxygen_saturation" "94"

# =============================================================================
header "RESULTS"
# =============================================================================

echo ""
echo -e "  Total : $TOTAL"
echo -e "  ${GREEN}Pass  : $PASS${NC}"
echo -e "  ${RED}Fail  : $FAIL${NC}"
echo -e "  ${YELLOW}Warn  : $WARN${NC}"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  echo -e "${RED}${BOLD}RESULT: FAILED ($FAIL test(s) failed)${NC}"
  exit 1
elif [[ "$WARN" -gt 0 ]]; then
  echo -e "${YELLOW}${BOLD}RESULT: PASSED WITH WARNINGS ($WARN warning(s))${NC}"
  exit 0
else
  echo -e "${GREEN}${BOLD}RESULT: ALL TESTS PASSED${NC}"
  exit 0
fi
