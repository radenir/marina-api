#!/usr/bin/env bash
# =============================================================================
# Marina API — Quick transcription script
# Usage: ./transcribe.sh <audio-file> [language]
#
# Examples:
#   ./transcribe.sh recording.webm
#   ./transcribe.sh recording.wav en
#   ./transcribe.sh recording.mp3 pl
# =============================================================================

set -euo pipefail

BASE="${API_URL:-http://localhost:4000}"
AUDIO_FILE="${1:-}"
LANGUAGE="${2:-}"

# Load .env if not already set
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

# ── Validate input ────────────────────────────────────────────────────────────
if [[ -z "$AUDIO_FILE" ]]; then
  echo "Usage: $0 <audio-file> [language]"
  echo "       language: optional ISO 639-1 code, e.g. en, pl, fr"
  exit 1
fi

if [[ ! -f "$AUDIO_FILE" ]]; then
  echo "Error: file not found: $AUDIO_FILE"
  exit 1
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

# ── Detect MIME type ──────────────────────────────────────────────────────────
EXT="${AUDIO_FILE##*.}"
case "$(echo "$EXT" | tr '[:upper:]' '[:lower:]')" in
  webm)       MIME="audio/webm" ;;
  ogg|oga)    MIME="audio/ogg" ;;
  mp4)        MIME="audio/mp4" ;;
  mp3|mpeg)   MIME="audio/mpeg" ;;
  wav)        MIME="audio/wav" ;;
  m4a)        MIME="audio/m4a" ;;
  *)          MIME="audio/octet-stream" ;;
esac

# ── Transcribe ────────────────────────────────────────────────────────────────
echo "Transcribing: $AUDIO_FILE ($MIME)"

CURL_ARGS=(
  -s -X POST "$BASE/ai/transcribe"
  -H "Authorization: Bearer $AT"
  -F "audio=@${AUDIO_FILE};type=${MIME}"
)
if [[ -n "$LANGUAGE" ]]; then
  CURL_ARGS+=(-F "language=$LANGUAGE")
fi

RESP=$(curl "${CURL_ARGS[@]}")
TEXT=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['transcription'])" 2>/dev/null || true)

if [[ -n "$TEXT" ]]; then
  echo ""
  echo "Transcription:"
  echo "─────────────────────────────────────────"
  echo "$TEXT"
  echo "─────────────────────────────────────────"
else
  echo "Error: $(echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP")"
  exit 1
fi
