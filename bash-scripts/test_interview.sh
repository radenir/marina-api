#!/usr/bin/env bash
set -e

BASE=http://localhost:4000

# ── 1. Login ─────────────────────────────────────────────────────────────────
echo "=== Login ==="
AT=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"radomski.adr@gmail.com","password":"Gierek123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "Token: ${AT:0:40}..."

AUTH="-H \"Authorization: Bearer $AT\""

# ── 2. First call — no state, no message ────────────────────────────────────
echo ""
echo "=== Call 1: Init (no state) ==="
RESP1=$(curl -s -X POST "$BASE/ai/interview/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AT" \
  -d '{"patientLanguage":"English","medicalOfficerLanguage":"English"}')

echo "$RESP1" | python3 -m json.tool --no-ensure-ascii 2>/dev/null || echo "$RESP1"

STATE=$(echo "$RESP1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['state']))")
REPLY=$(echo "$RESP1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['reply'])")
echo ""
echo "Marina says: $REPLY"
echo "Stage: $(echo "$RESP1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['state']['stage'])")"

# ── 3. Second call — send state + symptom message ───────────────────────────
echo ""
echo "=== Call 2: Patient reports headache ==="
BODY2=$(python3 -c "
import json, sys
state = json.loads(sys.argv[1])
body = {'state': state, 'message': 'I have a headache'}
print(json.dumps(body))
" "$STATE")

RESP2=$(curl -s -X POST "$BASE/ai/interview/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AT" \
  -d "$BODY2")

echo "$RESP2" | python3 -m json.tool --no-ensure-ascii 2>/dev/null || echo "$RESP2"
echo ""
echo "Marina says: $(echo "$RESP2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['reply'])")"
echo "Stage: $(echo "$RESP2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['state']['stage'])")"
echo "Done: $(echo "$RESP2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['done'])")"

# ── 4. Error cases ───────────────────────────────────────────────────────────
echo ""
echo "=== Error: state=null + message (should be 400) ==="
curl -s -X POST "$BASE/ai/interview/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AT" \
  -d '{"message":"hello"}' | python3 -m json.tool

echo ""
echo "=== Error: state provided but no message (should be 400) ==="
STATE_NO_MSG=$(python3 -c "
import json, sys
state = json.loads(sys.argv[1])
body = {'state': state}
print(json.dumps(body))
" "$STATE")
curl -s -X POST "$BASE/ai/interview/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AT" \
  -d "$STATE_NO_MSG" | python3 -m json.tool

echo ""
echo "=== Error: no auth (should be 401) ==="
curl -s -X POST "$BASE/ai/interview/chat" \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -m json.tool
