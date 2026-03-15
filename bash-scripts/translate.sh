#!/usr/bin/env bash
# =============================================================================
# Marina API — Interactive translation script
# Usage: ./translate.sh [fromLang] [toLang]
#
# Examples:
#   ./translate.sh              # fully interactive
#   ./translate.sh en pl        # language pair preset, text prompted each run
#
# Supported language codes:
#   en pl es de fr it pt ru zh ja da hi ur fa ar tr nl sv no fi ko vi th id
#
# Credentials: set MARINA_EMAIL / MARINA_PASSWORD env vars, or enter when prompted.
# =============================================================================

set -euo pipefail

BASE="${API_URL:-http://localhost:4000}"
FROM_LANG="${1:-}"
TO_LANG="${2:-}"

# ── Load .env ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
fi

# ── Credentials ───────────────────────────────────────────────────────────────
EMAIL="${MARINA_EMAIL:-}"
PASSWORD="${MARINA_PASSWORD:-}"

if [[ -z "$EMAIL" ]]; then
  read -rp "Email: " EMAIL
fi
if [[ -z "$PASSWORD" ]]; then
  read -rsp "Password: " PASSWORD
  echo
fi

# ── Login ─────────────────────────────────────────────────────────────────────
echo "Logging in..."
LOGIN_RESP=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

AT=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null || true)

if [[ -z "$AT" ]]; then
  echo "Login failed: $(echo "$LOGIN_RESP" | python3 -m json.tool 2>/dev/null || echo "$LOGIN_RESP")"
  exit 1
fi
echo "Logged in ✓"
echo ""

SUPPORTED="en pl es de fr it pt ru zh ja da hi ur fa ar tr nl sv no fi ko vi th id"

validate_lang() {
  local code="$1"
  for c in $SUPPORTED; do
    [[ "$c" == "$code" ]] && return 0
  done
  return 1
}

# ── Language pair selection ────────────────────────────────────────────────────
if [[ -n "$FROM_LANG" && -n "$TO_LANG" ]]; then
  if ! validate_lang "$FROM_LANG"; then
    echo "Unknown language code: $FROM_LANG"
    echo "Supported: $SUPPORTED"
    exit 1
  fi
  if ! validate_lang "$TO_LANG"; then
    echo "Unknown language code: $TO_LANG"
    echo "Supported: $SUPPORTED"
    exit 1
  fi
  echo "Language pair: $FROM_LANG → $TO_LANG  (change with Ctrl-C and pass new args)"
  echo ""
fi

# ── Translation loop ───────────────────────────────────────────────────────────
while true; do
  # Prompt for language pair if not set
  if [[ -z "$FROM_LANG" ]]; then
    read -rp "From language code (e.g. en): " FROM_LANG
    if ! validate_lang "$FROM_LANG"; then
      echo "Unknown code '$FROM_LANG'. Supported: $SUPPORTED"
      FROM_LANG=""
      continue
    fi
  fi
  if [[ -z "$TO_LANG" ]]; then
    read -rp "To language code   (e.g. pl): " TO_LANG
    if ! validate_lang "$TO_LANG"; then
      echo "Unknown code '$TO_LANG'. Supported: $SUPPORTED"
      TO_LANG=""
      continue
    fi
    echo ""
  fi

  # Prompt for text (empty input exits)
  read -rp "Text to translate (Enter to quit): " TEXT
  [[ -z "$TEXT" ]] && echo "Bye." && break

  PAYLOAD=$(python3 -c "
import json, sys
print(json.dumps({'text': sys.argv[1], 'fromLang': sys.argv[2], 'toLang': sys.argv[3]}))" \
    "$TEXT" "$FROM_LANG" "$TO_LANG")

  RESP=$(curl -s -X POST "$BASE/ai/translate" \
    -H "Authorization: Bearer $AT" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

  TRANSLATION=$(echo "$RESP" | python3 -c \
    "import sys,json; print(json.load(sys.stdin)['translation'])" 2>/dev/null || true)

  if [[ -n "$TRANSLATION" ]]; then
    echo "──────────────────────────────────────────"
    echo "$TRANSLATION"
    echo "──────────────────────────────────────────"
  else
    echo "Error: $(echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP")"
  fi
  echo ""
done
