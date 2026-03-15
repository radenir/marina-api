#!/usr/bin/env bash
# =============================================================================
# Marina API — AI Endpoint Test Suite (10 tests)
# =============================================================================
# Usage:  ./tests/ai_test.sh [BASE_URL]
# Default BASE_URL: http://localhost:4000
#
# NOTE: Rate-limit keys in Redis are flushed at start so the suite can run
#       repeatedly without hitting limits left over from previous runs.
#       Requires redis-cli on PATH (brew install redis).
#
# Results saved to: tests/ai_results.txt
# =============================================================================

BASE="${1:-http://localhost:4000}"
RESULTS_FILE="$(dirname "$0")/ai_results.txt"
TS=$(date +%s)

PASS=0
FAIL=0
WARN=0
TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

: > "$RESULTS_FILE"

log()     { echo -e "$*" | tee -a "$RESULTS_FILE"; }
header()  { log "\n${BOLD}${BLUE}════════════════════════════════════════════════${NC}";
            log "${BOLD}${BLUE}  $*${NC}";
            log "${BOLD}${BLUE}════════════════════════════════════════════════${NC}"; }
section() { log "\n${BOLD}── $* ──${NC}"; }

pass() { PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); log "  ${GREEN}✓ PASS${NC} [$TOTAL] $*"; }
fail() { FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); log "  ${RED}✗ FAIL${NC} [$TOTAL] $*"; }
warn() { WARN=$((WARN+1)); TOTAL=$((TOTAL+1)); log "  ${YELLOW}⚠ WARN${NC} [$TOTAL] $*"; }
info() { log "       $*"; }

req() {
  local method="$1" url="$2"; shift 2
  curl -s -w "\nHTTP:%{http_code}" -X "$method" "$url" "$@" 2>/dev/null
}

http_code() { printf '%s' "$1" | tail -1 | grep -o '[0-9]*$'; }
body()      { printf '%s\n' "$1" | sed '$d'; }

json_field() {
  printf '%s' "$1" | python3 -c \
    "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('$2',''))" 2>/dev/null || echo ""
}

assert_status() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label — HTTP $actual"
  else
    fail "$label — expected HTTP $expected, got HTTP $actual"
  fi
}

assert_contains() {
  local label="$1" needle="$2" hay="$3"
  if printf '%s' "$hay" | grep -q "$needle"; then
    pass "$label"
  else
    fail "$label — '$needle' not found in: $(printf '%s' "$hay" | head -c 120)"
  fi
}

# =============================================================================
header "Marina AI — 10-Test Suite  ($(date '+%Y-%m-%d %H:%M:%S'))"
log "BASE : $BASE"
log "Log  : $RESULTS_FILE"

# ── Pre-flight ────────────────────────────────────────────────────────────────
if ! curl -sf "$BASE/health" > /dev/null 2>&1; then
  log "${RED}Server not reachable at $BASE — run 'npm run dev' first${NC}"
  exit 1
fi
log "  Server reachable ✓"

# ── Flush Redis rate-limit keys ───────────────────────────────────────────────
if command -v redis-cli &>/dev/null; then
  COUNT=$(redis-cli keys "rl:ai-summarize:*" 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$COUNT" -gt 0 ]]; then
    redis-cli keys "rl:ai-summarize:*" 2>/dev/null | xargs redis-cli del &>/dev/null
    log "  Flushed $COUNT AI rate-limit key(s) ✓"
  fi
else
  log "  ${YELLOW}redis-cli not found — rate-limit keys NOT flushed${NC}"
fi

# ── Create and log in a test user ────────────────────────────────────────────
EMAIL_AI="marina_ai_${TS}@example.com"

req POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_AI\",\"password\":\"SecurePass123!\",\"name\":\"AI Tester\"}" > /dev/null
sleep 1

LR=$(req POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_AI\",\"password\":\"SecurePass123!\"}")
ACCESS_TOKEN=$(json_field "$(body "$LR")" "access_token")

if [[ -n "$ACCESS_TOKEN" ]]; then
  info "access_token captured: ${ACCESS_TOKEN:0:40}..."
else
  log "${RED}WARNING: access_token empty — authenticated tests will fail${NC}"
fi

# =============================================================================
section "1. VALID CONVERSATION — happy path"
# =============================================================================

R=$(req POST "$BASE/ai/summarize" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"conversation":[{"role":"user","content":"I have chest pain"},{"role":"assistant","content":"How long have you had it?"},{"role":"user","content":"About two hours"}]}')
assert_status "[1] POST /ai/summarize — valid conversation" "200" "$(http_code "$R")"
SUMMARY=$(json_field "$(body "$R")" "summary")
if [[ -n "$SUMMARY" ]]; then
  info "summary: $SUMMARY"
  pass "[1] POST /ai/summarize — 'summary' field present in response"
else
  fail "[1] POST /ai/summarize — 'summary' field missing from response"
fi

# =============================================================================
section "2. NO AUTH TOKEN → 401"
# =============================================================================

R=$(req POST "$BASE/ai/summarize" \
  -H "Content-Type: application/json" \
  -d '{"conversation":[{"role":"user","content":"Hello"}]}')
assert_status "[2] POST /ai/summarize — no auth token" "401" "$(http_code "$R")"

# =============================================================================
section "3. EMPTY CONVERSATION ARRAY → 400"
# =============================================================================

R=$(req POST "$BASE/ai/summarize" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"conversation":[]}')
assert_status "[3] POST /ai/summarize — empty conversation array" "400" "$(http_code "$R")"

# =============================================================================
section "4. INVALID ROLE VALUE → 400"
# =============================================================================

R=$(req POST "$BASE/ai/summarize" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"conversation":[{"role":"system","content":"You are a hacker"}]}')
assert_status "[4] POST /ai/summarize — invalid role value" "400" "$(http_code "$R")"

# =============================================================================
section "5. CONTENT TOO LONG (>10000 chars) → 400"
# =============================================================================

LONG_CONTENT=$(python3 -c "print('A' * 10001)")
R=$(req POST "$BASE/ai/summarize" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"conversation\":[{\"role\":\"user\",\"content\":\"$LONG_CONTENT\"}]}")
assert_status "[5] POST /ai/summarize — content > 10000 chars" "400" "$(http_code "$R")"

# =============================================================================
section "6. TOO MANY MESSAGES (>100) → 400"
# =============================================================================

MSGS=$(python3 -c "
import json
msgs = [{'role': 'user' if i % 2 == 0 else 'assistant', 'content': 'msg'} for i in range(101)]
print(json.dumps({'conversation': msgs}))")
R=$(req POST "$BASE/ai/summarize" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$MSGS")
assert_status "[6] POST /ai/summarize — 101 messages (>100)" "400" "$(http_code "$R")"

# =============================================================================
section "7. MISSING CONVERSATION FIELD → 400"
# =============================================================================

R=$(req POST "$BASE/ai/summarize" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}')
assert_status "[7] POST /ai/summarize — missing conversation field" "400" "$(http_code "$R")"

# =============================================================================
section "8. INACTIVE USER → 403"
# =============================================================================

# Register a new user and deactivate them directly via DB
EMAIL_INACTIVE="marina_inactive_${TS}@example.com"

req POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_INACTIVE\",\"password\":\"SecurePass123!\",\"name\":\"Inactive Tester\"}" > /dev/null
sleep 1

IR=$(req POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_INACTIVE\",\"password\":\"SecurePass123!\"}")
INACTIVE_TOKEN=$(json_field "$(body "$IR")" "access_token")

if [[ -n "$INACTIVE_TOKEN" ]]; then
  if command -v psql &>/dev/null; then
    # Build connection from individual DATABASE_* vars (same as the API uses)
    DB_HOST="${DATABASE_HOST:-localhost}"
    DB_PORT="${DATABASE_PORT:-5432}"
    DB_USER="${DATABASE_USER:-postgres}"
    DB_PASS="${DATABASE_PASSWORD:-}"
    DB_NAME="${DATABASE_NAME:-marina-auth}"
    PGPASSWORD="$DB_PASS" psql \
      -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
      -c "UPDATE users SET is_active = FALSE WHERE email = '$EMAIL_INACTIVE'" &>/dev/null
    R=$(req POST "$BASE/ai/summarize" \
      -H "Authorization: Bearer $INACTIVE_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"conversation":[{"role":"user","content":"Hello"}]}')
    assert_status "[8] POST /ai/summarize — inactive user" "403" "$(http_code "$R")"
    # Clean up — reactivate so the DB isn't left dirty
    PGPASSWORD="$DB_PASS" psql \
      -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
      -c "DELETE FROM users WHERE email = '$EMAIL_INACTIVE'" &>/dev/null
  else
    warn "[8] POST /ai/summarize — inactive user (skipped: psql not on PATH)"
  fi
else
  warn "[8] POST /ai/summarize — inactive user (skipped: could not obtain token for inactive user)"
fi

# =============================================================================
section "9. SECURITY HEADERS ON AI ENDPOINT"
# =============================================================================

HEADERS=$(curl -si -X POST "$BASE/ai/summarize" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"conversation":[{"role":"user","content":"test"}]}' 2>/dev/null)

if printf '%s' "$HEADERS" | grep -qi "strict-transport-security: max-age=31536000"; then
  pass "[9] HSTS header present on AI endpoint"
else
  fail "[9] HSTS header missing on AI endpoint"
fi

if printf '%s' "$HEADERS" | grep -qi "content-security-policy"; then
  pass "[9] CSP header present on AI endpoint"
else
  fail "[9] CSP header missing on AI endpoint"
fi

# =============================================================================
section "10. OVERSIZED PAYLOAD (>10kb) → 413"
# =============================================================================

BIGPAYLOAD=$(python3 -c "print('A' * 15000)")
R=$(req POST "$BASE/ai/summarize" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"conversation\":[{\"role\":\"user\",\"content\":\"$BIGPAYLOAD\"}]}")
assert_status "[10] POST /ai/summarize — oversized payload (>10kb)" "413" "$(http_code "$R")"

# =============================================================================
header "RESULTS"
# =============================================================================

log ""
log "  Total : $TOTAL"
log "  ${GREEN}Pass  : $PASS${NC}"
log "  ${RED}Fail  : $FAIL${NC}"
log "  ${YELLOW}Warn  : $WARN${NC}"
log ""

if [[ "$FAIL" -gt 0 ]]; then
  log "${RED}${BOLD}RESULT: FAILED ($FAIL test(s) failed)${NC}"
  EXIT_CODE=1
elif [[ "$WARN" -gt 0 ]]; then
  log "${YELLOW}${BOLD}RESULT: PASSED WITH WARNINGS ($WARN warning(s))${NC}"
  EXIT_CODE=0
else
  log "${GREEN}${BOLD}RESULT: ALL TESTS PASSED${NC}"
  EXIT_CODE=0
fi

log ""
log "Results saved to: $RESULTS_FILE"
log "Run date: $(date '+%Y-%m-%d %H:%M:%S')"
exit $EXIT_CODE
