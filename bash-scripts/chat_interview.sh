#!/usr/bin/env bash
# Interactive terminal chat with the Marina interview endpoint.
# Usage: bash chat_interview.sh [patientLanguage] [medicalOfficerLanguage]
#   e.g. bash chat_interview.sh English Polish

set -euo pipefail

BASE=http://localhost:4000
PATIENT_LANG="${1:-English}"
MO_LANG="${2:-English}"

# ── Colours ───────────────────────────────────────────────────────────────────
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Login ─────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}Logging in...${RESET}"
LOGIN_RESP=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"radomski.adr@gmail.com","password":"Gierek123"}')

AT=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null || true)
if [ -z "$AT" ]; then
  echo "Login failed: $LOGIN_RESP"
  exit 1
fi
echo -e "${YELLOW}Logged in.${RESET}"
echo ""

# ── Helper: call the endpoint ─────────────────────────────────────────────────
# Args: $1 = JSON body string
# Prints full response JSON to stdout
call_api() {
  curl -s -X POST "$BASE/ai/interview/chat" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $AT" \
    -d "$1"
}

# ── First call (init) ─────────────────────────────────────────────────────────
INIT_BODY=$(python3 -c "
import json
print(json.dumps({'patientLanguage': '$PATIENT_LANG', 'medicalOfficerLanguage': '$MO_LANG'}))
")

RESP=$(call_api "$INIT_BODY")

STATE=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['state']))")
REPLY=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['reply'])")
DONE=$(echo "$RESP"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['done'])")

echo -e "${CYAN}${BOLD}Marina:${RESET} ${CYAN}$REPLY${RESET}"
echo ""

# ── Chat loop ─────────────────────────────────────────────────────────────────
while [ "$DONE" = "False" ]; do
  # Read user input
  echo -en "${GREEN}${BOLD}You:${RESET} "
  read -r USER_MSG

  # Blank line = skip (don't send empty messages)
  if [ -z "$USER_MSG" ]; then
    continue
  fi

  # Build request body with current state + user message
  BODY=$(python3 -c "
import json, sys
state = json.loads(sys.argv[1])
msg   = sys.argv[2]
print(json.dumps({'state': state, 'message': msg}))
" "$STATE" "$USER_MSG")

  RESP=$(call_api "$BODY")

  # Check for API-level error
  ERROR=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',''))" 2>/dev/null || true)
  if [ -n "$ERROR" ]; then
    echo -e "${YELLOW}[error] $ERROR${RESET}"
    echo ""
    continue
  fi

  STATE=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['state']))")
  REPLY=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['reply'])")
  DONE=$(echo "$RESP"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['done'])")
  STAGE=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['state']['stage'])")

  echo ""
  echo -e "${CYAN}${BOLD}Marina:${RESET} ${CYAN}$REPLY${RESET}"
  echo -e "  ${YELLOW}[stage $STAGE]${RESET}"
  echo ""
done

# ── Interview complete — print report ────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}Interview complete. Generating report...${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('report','(no report)'))"
