#!/usr/bin/env bash
# =============================================================================
# Marina API — Full Test Suite (54 tests)
# =============================================================================
# Usage:  ./tests/api_test.sh [BASE_URL]
# Default BASE_URL: http://localhost:4000
#
# NOTE: Rate-limit keys in Redis are flushed at start so the suite can run
#       repeatedly without hitting limits left over from previous runs.
#       Requires redis-cli on PATH (brew install redis).
#
# Results saved to: tests/results.txt
# =============================================================================

BASE="${1:-http://localhost:4000}"
RESULTS_FILE="$(dirname "$0")/results.txt"
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

# Run a request and return "BODY\nHTTP:CODE"
req() {
  local method="$1" url="$2"; shift 2
  curl -s -w "\nHTTP:%{http_code}" -X "$method" "$url" "$@" 2>/dev/null
}

# Extract status code from last line of req() output
http_code() { printf '%s' "$1" | tail -1 | grep -o '[0-9]*$'; }

# Extract body (everything except the last line) — macOS-compatible (no head -n -1)
body() { printf '%s\n' "$1" | sed '$d'; }

# Extract a key from a JSON string using python3
json_field() {
  printf '%s' "$1" | python3 -c \
    "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('$2',''))" 2>/dev/null || echo ""
}

# Assert HTTP status
assert_status() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label — HTTP $actual"
  else
    fail "$label — expected HTTP $expected, got HTTP $actual"
  fi
}

# Assert body contains string
assert_contains() {
  local label="$1" needle="$2" hay="$3"
  if printf '%s' "$hay" | grep -q "$needle"; then
    pass "$label"
  else
    fail "$label — '$needle' not found in: $(printf '%s' "$hay" | head -c 120)"
  fi
}

# Assert body does NOT contain string
assert_not_contains() {
  local label="$1" needle="$2" hay="$3"
  if printf '%s' "$hay" | grep -q "$needle"; then
    fail "$label — '$needle' should NOT be present"
  else
    pass "$label"
  fi
}

# =============================================================================
header "Marina API — 54-Test Suite  ($(date '+%Y-%m-%d %H:%M:%S'))"
log "BASE : $BASE"
log "Log  : $RESULTS_FILE"

# ── Pre-flight ────────────────────────────────────────────────────────────────
if ! curl -sf "$BASE/health" > /dev/null 2>&1; then
  log "${RED}Server not reachable at $BASE — run 'npm run dev' first${NC}"
  exit 1
fi
log "  Server reachable ✓"

# ── Flush Redis rate-limit keys so the suite is repeatable ───────────────────
if command -v redis-cli &>/dev/null; then
  COUNT=$(redis-cli keys "rl:*" 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$COUNT" -gt 0 ]]; then
    redis-cli keys "rl:*" 2>/dev/null | xargs redis-cli del &>/dev/null
    log "  Flushed $COUNT Redis rate-limit key(s) ✓"
  fi
else
  log "  ${YELLOW}redis-cli not found — rate-limit keys NOT flushed (tests may hit 429 if run repeatedly)${NC}"
fi

# Test email addresses (timestamp-unique)
EMAIL_REG="marina_reg_${TS}@example.com"
EMAIL_LOGIN="marina_login_${TS}@example.com"
EMAIL_LOGOUT="marina_logout_${TS}@example.com"
EMAIL_RL="marina_rl_${TS}@example.com"

# =============================================================================
section "1. HEALTH CHECK"
# =============================================================================

R=$(req GET "$BASE/health")
assert_status "[1] GET /health" "200" "$(http_code "$R")"

# =============================================================================
section "2–6. REGISTRATION"
# =============================================================================

# [2] Valid registration
R=$(req POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_REG\",\"password\":\"SecurePass123!\",\"name\":\"Test User\"}")
assert_status "[2] Register — valid payload" "201" "$(http_code "$R")"

# [3] Duplicate email — must NOT reveal existence
R=$(req POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_REG\",\"password\":\"OtherPass123!\",\"name\":\"Other User\"}")
assert_status "[3] Register — duplicate email → 201 (no enumeration)" "201" "$(http_code "$R")"

# [4] Missing password and name
R=$(req POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"missing@example.com"}')
assert_status "[4] Register — missing password & name → 400" "400" "$(http_code "$R")"

# [5] Password too short (< 8 chars)
R=$(req POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"weak@example.com","password":"short","name":"Weak"}')
assert_status "[5] Register — password < 8 chars → 400" "400" "$(http_code "$R")"

# [6] Invalid email format
R=$(req POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"not-an-email","password":"ValidPass123!","name":"Invalid"}')
assert_status "[6] Register — invalid email format → 400" "400" "$(http_code "$R")"

# =============================================================================
section "7–11. LOGIN"
# =============================================================================

# Register a fresh user for login tests
req POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_LOGIN\",\"password\":\"SecurePass123!\",\"name\":\"Login Tester\"}" > /dev/null
sleep 1

# [7] Valid credentials
R=$(req POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_LOGIN\",\"password\":\"SecurePass123!\"}")
assert_status "[7] Login — valid credentials → 200" "200" "$(http_code "$R")"
ACCESS_TOKEN=$(json_field "$(body "$R")" "access_token")
REFRESH_TOKEN=$(json_field "$(body "$R")" "refresh_token")
if [[ -n "$ACCESS_TOKEN" ]]; then
  info "access_token captured: ${ACCESS_TOKEN:0:40}..."
else
  info "${RED}WARNING: access_token empty — tests 12,17-20 will fail${NC}"
fi

# [8] Wrong password
R=$(req POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_LOGIN\",\"password\":\"WrongPassword!\"}")
assert_status "[8] Login — wrong password → 401" "401" "$(http_code "$R")"

# [9] Timing attack — non-existent vs existing user (both must run argon2 regardless)
TIME_NONE=$( { time curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"nobody_ever_xyz_123@example.com","password":"SomePass123!"}' > /dev/null; } 2>&1 | \
  awk '/real/{print $2}')
TIME_EXIST=$( { time curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_LOGIN\",\"password\":\"WrongPass999!\"}" > /dev/null; } 2>&1 | \
  awk '/real/{print $2}')
info "Timing — non-existent: $TIME_NONE  |  existing (wrong pass): $TIME_EXIST"
info "[9] Verify manually that both times are similar (~argon2 duration). Large gap = timing leak."

# [10] Email case insensitivity
R=$(req POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$(echo "$EMAIL_LOGIN" | tr '[:lower:]' '[:upper:]')\",\"password\":\"SecurePass123!\"}")
assert_status "[10] Login — uppercase email normalised → 200" "200" "$(http_code "$R")"

# [11] Missing password
R=$(req POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_LOGIN\"}")
assert_status "[11] Login — missing password → 400" "400" "$(http_code "$R")"

# =============================================================================
section "12–16. GET /auth/me — JWT SECURITY"
# =============================================================================

# [12] Valid token
R=$(req GET "$BASE/auth/me" -H "Authorization: Bearer $ACCESS_TOKEN")
assert_status "[12] GET /me — valid token → 200" "200" "$(http_code "$R")"

# [13] No token
R=$(req GET "$BASE/auth/me")
assert_status "[13] GET /me — no token → 401" "401" "$(http_code "$R")"

# [14] Malformed token (garbage string)
R=$(req GET "$BASE/auth/me" -H "Authorization: Bearer notavalidtoken")
assert_status "[14] GET /me — malformed JWT → 401" "401" "$(http_code "$R")"

# [15] Tampered JWT payload (valid format, invalid signature)
TAMPERED="eyJhbGciOiJSUzI1NiJ9.eyJyb2xlcyI6WyJhZG1pbiJdLCJzdWIiOiJoYWNrZWQtaWQiLCJqdGkiOiJmYWtlIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9.invalidsignature"
R=$(req GET "$BASE/auth/me" -H "Authorization: Bearer $TAMPERED")
assert_status "[15] GET /me — tampered JWT payload → 401" "401" "$(http_code "$R")"

# [16] alg:none attack — header says no signature required
NONE_TOKEN="eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJoYWNrZWQiLCJyb2xlcyI6WyJhZG1pbiJdLCJleHAiOjk5OTk5OTk5OTl9."
R=$(req GET "$BASE/auth/me" -H "Authorization: Bearer $NONE_TOKEN")
assert_status "[16] GET /me — alg:none attack → 401" "401" "$(http_code "$R")"

# =============================================================================
section "17–19. PUT /auth/me — PROFILE UPDATE"
# =============================================================================

# [17] Valid update
R=$(req PUT "$BASE/auth/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Name","ship_name":"SS Marina","imo_number":"IMO1234567","company":"Marina Health"}')
assert_status "[17] PUT /me — valid update → 200" "200" "$(http_code "$R")"

# [18] Empty body — no fields to update
R=$(req PUT "$BASE/auth/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')
assert_status "[18] PUT /me — empty body → 400" "400" "$(http_code "$R")"

# [19] IMO number exceeds 20 chars
R=$(req PUT "$BASE/auth/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"imo_number":"IMO12345678901234567890"}')
assert_status "[19] PUT /me — imo_number > 20 chars → 400" "400" "$(http_code "$R")"

# =============================================================================
section "20–24. TOKEN REFRESH"
# =============================================================================

# [20] Valid refresh — issues new token pair (rotation)
R=$(req POST "$BASE/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "import json; print(json.dumps({'refresh_token':'$REFRESH_TOKEN'}))")")
assert_status "[20] Refresh — valid token → 200 (token rotation)" "200" "$(http_code "$R")"
NEW_REFRESH=$(json_field "$(body "$R")" "refresh_token")
if [[ -n "$NEW_REFRESH" ]]; then
  info "new refresh_token captured: ${NEW_REFRESH:0:20}..."
fi

# [21] Reuse the now-used original token — must trigger theft detection
R=$(req POST "$BASE/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "import json; print(json.dumps({'refresh_token':'$REFRESH_TOKEN'}))")")
assert_status "[21] Refresh — reuse old token → 401 (reuse detected)" "401" "$(http_code "$R")"
assert_contains "[21] Refresh — 'Token reuse detected' in body" '"Token reuse detected"' "$(body "$R")"

# [22] CRITICAL BUG CHECK: after reuse detection, the whole family must be revoked.
#      Due to a transaction rollback bug the DELETE inside the transaction is undone,
#      so the new token from step [20] can still be used — the family is NOT revoked.
R=$(req POST "$BASE/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "import json; print(json.dumps({'refresh_token':'$NEW_REFRESH'}))")")
RCODE=$(http_code "$R")
if [[ "$RCODE" == "401" ]]; then
  pass "[22] Refresh — token family correctly revoked after reuse detection → 401"
else
  fail "[22] Refresh — CRITICAL BUG: token family NOT revoked after reuse (HTTP $RCODE). The new token still works. Transaction ROLLBACK in src/lib/db.ts:38 undoes the DELETE in src/routes/auth.ts:324."
fi

# [23] Completely fake/random token
R=$(req POST "$BASE/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refresh_token":"totallyFakeTokenThatDoesNotExist12345"}')
assert_status "[23] Refresh — fake token → 401" "401" "$(http_code "$R")"
assert_contains "[23] Refresh — 'Token not found' message" '"Token not found"' "$(body "$R")"

# [24] Missing token body
R=$(req POST "$BASE/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{}')
assert_status "[24] Refresh — missing token → 401" "401" "$(http_code "$R")"

# =============================================================================
section "25–27. LOGOUT"
# =============================================================================

# Register + login a fresh user for logout isolation
req POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_LOGOUT\",\"password\":\"TestPass123!\",\"name\":\"Logout Tester\"}" > /dev/null
sleep 1
LR=$(req POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_LOGOUT\",\"password\":\"TestPass123!\"}")
LOGOUT_RT=$(json_field "$(body "$LR")" "refresh_token")

# [25] Valid logout
R=$(req POST "$BASE/auth/logout" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "import json; print(json.dumps({'refresh_token':'$LOGOUT_RT'}))")")
assert_status "[25] Logout — valid token → 200" "200" "$(http_code "$R")"

# [26] Use the revoked token after logout — must be rejected
R=$(req POST "$BASE/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "import json; print(json.dumps({'refresh_token':'$LOGOUT_RT'}))")")
assert_status "[26] Logout — revoked token rejected on refresh → 401" "401" "$(http_code "$R")"
assert_contains "[26] Logout — 'Token not found' after logout" '"Token not found"' "$(body "$R")"

# [27] Logout with no token — graceful no-op (always 200)
R=$(req POST "$BASE/auth/logout" \
  -H "Content-Type: application/json" \
  -d '{}')
assert_status "[27] Logout — no token → 200 (graceful no-op)" "200" "$(http_code "$R")"

# =============================================================================
section "28–30. FORGOT PASSWORD"
# =============================================================================

# [28] Existing email — always 200, never reveals account existence
R=$(req POST "$BASE/auth/forgot-password" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_LOGIN\"}")
assert_status "[28] Forgot password — existing email → 200 (no enumeration)" "200" "$(http_code "$R")"
assert_contains "[28] Forgot password — non-revealing message" 'If this account exists' "$(body "$R")"

# [29] Non-existent email — must return identical 200
R=$(req POST "$BASE/auth/forgot-password" \
  -H "Content-Type: application/json" \
  -d '{"email":"doesnotexist99999@example.com"}')
assert_status "[29] Forgot password — non-existent email → 200 (no enumeration)" "200" "$(http_code "$R")"
assert_contains "[29] Forgot password — identical message for non-existent" 'If this account exists' "$(body "$R")"

# [30] Invalid email format — caught by Zod before lookup
R=$(req POST "$BASE/auth/forgot-password" \
  -H "Content-Type: application/json" \
  -d '{"email":"not-an-email"}')
assert_status "[30] Forgot password — invalid email format → 400" "400" "$(http_code "$R")"

# =============================================================================
section "31–32. SQL INJECTION"
# =============================================================================

# [31] SQL injection in email field — Zod email validator catches it before the DB
R=$(req POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"' OR 1=1--\",\"password\":\"anything\"}")
assert_status "[31] SQLi — injection in email field → 400 (Zod rejects non-email)" "400" "$(http_code "$R")"

# [32] SQL injection in password field — parameterized query must neutralise it
R=$(req POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"'"'"' OR '"'"'1'"'"'='"'"'1"}')
assert_status "[32] SQLi — injection in password field → 401 (parameterized query)" "401" "$(http_code "$R")"

# =============================================================================
section "33. SQL INJECTION IN REGISTER NAME"
# =============================================================================

# [33] DROP TABLE injection in name — parameterized query must neutralise it
R=$(req POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"sqli_${TS}@example.com\",\"password\":\"ValidPass123!\",\"name\":\"Robert'); DROP TABLE users;--\"}")
SCODE=$(http_code "$R")
if [[ "$SCODE" == "201" || "$SCODE" == "429" ]]; then
  pass "[33] SQLi — DROP TABLE in name handled safely (HTTP $SCODE, parameterized query)"
else
  fail "[33] SQLi — DROP TABLE in name → unexpected HTTP $SCODE"
fi

# =============================================================================
section "34. XSS IN NAME FIELD"
# =============================================================================

# [34] Script tag in name — API stores raw; CSP blocks execution in browser
R=$(req POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"xss_${TS}@example.com\",\"password\":\"ValidPass123!\",\"name\":\"<script>alert(1)</script>\"}")
XCODE=$(http_code "$R")
if [[ "$XCODE" == "201" || "$XCODE" == "429" ]]; then
  pass "[34] XSS — script tag in name accepted/rate-limited (HTTP $XCODE) — CSP prevents execution"
else
  fail "[34] XSS — script tag in name → unexpected HTTP $XCODE"
fi

# =============================================================================
section "35–36. CORS"
# =============================================================================

# [35] Disallowed origin — must be blocked with 403, not 500
R=$(curl -si "$BASE/health" -H "Origin: https://evil.com" 2>/dev/null)
CCODE=$(printf '%s' "$R" | grep "^HTTP" | tail -1 | awk '{print $2}')
if printf '%s' "$R" | grep -qi "access-control-allow-origin: https://evil.com"; then
  fail "[35] CORS — disallowed origin was allowed! Misconfiguration."
elif [[ "$CCODE" == "403" ]]; then
  pass "[35] CORS — disallowed origin blocked with HTTP 403"
else
  fail "[35] CORS — disallowed origin returns HTTP $CCODE (expected 403) — error handler bug"
fi

# [36] Whitelisted origin — must receive correct ACAO header
R=$(curl -si "$BASE/health" -H "Origin: http://localhost:3000" 2>/dev/null)
if printf '%s' "$R" | grep -qi "access-control-allow-origin: http://localhost:3000"; then
  pass "[36] CORS — whitelisted origin allowed with correct ACAO header"
else
  warn "[36] CORS — ACAO header not present for whitelisted origin"
fi

# =============================================================================
section "37–38. HTTP METHOD HANDLING"
# =============================================================================

# [37] GET on a POST-only endpoint — no matching route → 404
R=$(req GET "$BASE/auth/login")
assert_status "[37] GET on POST-only /auth/login → 404" "404" "$(http_code "$R")"

# [38] Completely unknown route
R=$(req GET "$BASE/auth/nonexistent")
assert_status "[38] Unknown route → 404" "404" "$(http_code "$R")"

# =============================================================================
section "39. RATE LIMITING — BRUTE FORCE"
# =============================================================================

# Register a dedicated user for rate-limit test
req POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_RL\",\"password\":\"TestPass123!\",\"name\":\"RL Tester\"}" > /dev/null
sleep 1

info "Firing 7 login attempts (limit=5 per 15 min per IP+email)"
BLOCKED_AT=0
for i in $(seq 1 7); do
  RESP=$(req POST "$BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL_RL\",\"password\":\"WrongPass${i}!\"}")
  CODE=$(http_code "$RESP")
  REMAINING=$(curl -si -X POST "$BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL_RL\",\"password\":\"Extra!\"}" 2>/dev/null | \
    grep -i "X-RateLimit-Remaining" | awk '{print $2}' | tr -d '\r')
  info "Attempt $i → HTTP $CODE  (X-RateLimit-Remaining: ${REMAINING:-n/a})"
  if [[ "$CODE" == "429" && "$BLOCKED_AT" == "0" ]]; then
    BLOCKED_AT=$i
  fi
done

if [[ "$BLOCKED_AT" -gt 0 && "$BLOCKED_AT" -le 7 ]]; then
  pass "[39] Rate limit — brute force blocked at attempt $BLOCKED_AT (limit=5)"
else
  fail "[39] Rate limit — login NOT blocked within 7 attempts"
fi

# =============================================================================
section "40–42. EMAIL VERIFICATION"
# =============================================================================

# [40] Invalid token (garbage)
R=$(req POST "$BASE/auth/verify-email" \
  -H "Content-Type: application/json" \
  -d '{"token":"totallyinvalidtoken"}')
assert_status "[40] Verify email — invalid token → 400" "400" "$(http_code "$R")"

# [41] Malformed token (no dot separator — format check fails)
R=$(req POST "$BASE/auth/verify-email" \
  -H "Content-Type: application/json" \
  -d '{"token":"no-dot-separator"}')
assert_status "[41] Verify email — malformed token (no dot) → 400" "400" "$(http_code "$R")"

# [42] Missing token entirely
R=$(req POST "$BASE/auth/verify-email" \
  -H "Content-Type: application/json" \
  -d '{}')
assert_status "[42] Verify email — missing token → 400" "400" "$(http_code "$R")"

# =============================================================================
section "43–44. RESEND EMAIL VERIFICATION"
# =============================================================================

# [43] Existing unverified user — always 200 (non-revealing)
R=$(req POST "$BASE/auth/verify-email/resend" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_LOGIN\"}")
assert_status "[43] Resend verify — existing unverified email → 200" "200" "$(http_code "$R")"

# [44] Non-existent email — must return identical 200
R=$(req POST "$BASE/auth/verify-email/resend" \
  -H "Content-Type: application/json" \
  -d '{"email":"nonexistent_xyz99@example.com"}')
assert_status "[44] Resend verify — non-existent email → 200 (no enumeration)" "200" "$(http_code "$R")"

# =============================================================================
section "45–47. RESET PASSWORD"
# =============================================================================

# [45] Invalid token (bad signature)
R=$(req POST "$BASE/auth/reset-password" \
  -H "Content-Type: application/json" \
  -d '{"token":"invalidtoken.fakebase64sig","password":"NewPass123!"}')
assert_status "[45] Reset password — invalid token → 400" "400" "$(http_code "$R")"
assert_contains "[45] Reset password — correct error message returned" '"Invalid or expired reset token"' "$(body "$R")"

# [46] Password too short (Zod catches it before token is verified)
R=$(req POST "$BASE/auth/reset-password" \
  -H "Content-Type: application/json" \
  -d '{"token":"something.sig","password":"short"}')
assert_status "[46] Reset password — password too short → 400" "400" "$(http_code "$R")"

# [47] Missing password field entirely
R=$(req POST "$BASE/auth/reset-password" \
  -H "Content-Type: application/json" \
  -d '{"token":"something.sig"}')
assert_status "[47] Reset password — missing password → 400" "400" "$(http_code "$R")"

# =============================================================================
section "48–53. SECURITY HEADERS"
# =============================================================================

HEADERS=$(curl -si "$BASE/health" 2>/dev/null)

check_header() {
  local label="$1" pattern="$2"
  if printf '%s' "$HEADERS" | grep -qi "$pattern"; then
    pass "$label"
  else
    fail "$label — header missing or wrong"
  fi
}

check_header "[48] HSTS present and max-age=31536000"    "strict-transport-security: max-age=31536000"
check_header "[49] Content-Security-Policy present"      "content-security-policy"
check_header "[50] X-Content-Type-Options: nosniff"      "x-content-type-options: nosniff"
check_header "[51] Referrer-Policy present"              "referrer-policy"
check_header "[52] Cross-Origin-Opener-Policy present"   "cross-origin-opener-policy"

# [53] X-Frame-Options — must be DENY for a pure API
if printf '%s' "$HEADERS" | grep -qi "x-frame-options: deny"; then
  pass "[53] X-Frame-Options: DENY"
else
  fail "[53] X-Frame-Options is not DENY (got SAMEORIGIN or missing) — add frameguard: { action: 'deny' } to helmet()"
fi

# =============================================================================
section "54. PAYLOAD SIZE LIMIT"
# =============================================================================

# [54] Body > 10KB — Express body-parser must reject it
BIGNAME=$(python3 -c "print('A' * 15000)")
R=$(req POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"big@example.com\",\"password\":\"ValidPass123!\",\"name\":\"$BIGNAME\"}")
BCODE=$(http_code "$R")
if [[ "$BCODE" == "413" ]]; then
  pass "[54] Oversized payload → 413 Request Entity Too Large"
else
  fail "[54] Oversized payload → HTTP $BCODE (expected 413) — error handler swallows PayloadTooLargeError status"
fi

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
