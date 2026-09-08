#!/usr/bin/env bash
# ===========================================================================
# capture-shots.sh — drive the real Marina app and capture real screenshots.
#
# THIS IS THE REFERENCE PIPELINE for building pre-programmed app demos. Any
# future demo film should reuse this script rather than re-inventing it.
#
# ---------------------------------------------------------------------------
# The pattern, in four parts
# ---------------------------------------------------------------------------
#   1. SEED    Write app state straight into the simulator's container
#              (scripts/seed-draft.py -> Application Support/Marina). This is
#              how a demo gets realistic content without any debug code in the
#              shipping app and without typing through the UI.
#
#   2. GRANT   Pre-grant every permission the flow will ask for. Racing system
#              dialogs from inside a test is unreliable — whichever one is not
#              on screen when you look for it ends up sitting over a shot.
#
#   3. DRIVE   Run an XCUITest class that navigates and calls ShotWriter.capture.
#              Screenshots are written to a host directory passed in as
#              TEST_RUNNER_MARINA_SHOT_DIR (the TEST_RUNNER_ prefix is how
#              xcodebuild forwards an env var into the test process — passing it
#              as a build setting silently does nothing).
#
#   4. STAGE   Optionally repeat 1-3 with different seeded states, each pass
#              namespaced by MARINA_SHOT_PREFIX. That is how the film shows a
#              report genuinely filling up: the same screen captured against
#              three real states, with the app recomputing every percentage.
#
# To build a NEW demo: add a test class to MarinaUITests, add a seed variant to
# seed-draft.py (or a new seed script), then call this with --test and --stages.
#
# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
#   ./scripts/capture-shots.sh                          # the voice demo
#   ./scripts/capture-shots.sh --test FilmShotTests     # a different flow
#   ./scripts/capture-shots.sh --stages 3               # only the final state
#   ./scripts/capture-shots.sh --device <udid>
#   ./scripts/capture-shots.sh --keep                   # don't wipe public/shots
#
# Requires: Marina installed and SIGNED IN on the simulator. The capture target
# has no credentials, so a signed-out device yields shots of the login screen.
#
# NOTE: coaching hints render in the officer's PROFILE language, not the seed's.
# Set it in the app's Profile tab before capturing if you need a specific one.
# ===========================================================================
set -euo pipefail

APP_ID="eu.marinahealth.Marina"
PROJECT_DIR="$HOME/XcodeProjects/Marina"
VIDEO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHOT_DIR="$VIDEO_DIR/public/shots"
SCHEME="MarinaFilmShots"

TEST_CLASS="VoiceDemoTests"
STAGES="1 2 3"
UDID=""
KEEP=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --test)   TEST_CLASS="$2"; shift 2 ;;
    --stages) STAGES="$2";     shift 2 ;;
    --device) UDID="$2";       shift 2 ;;
    --keep)   KEEP=1;          shift ;;
    -h|--help) sed -n '2,50p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

# ---- 0. pick a device ------------------------------------------------------
# Prefer whatever is already booted (that is the one the developer signed in on);
# otherwise take the newest iPhone and boot it. Simulators shut themselves down
# between sessions, so "nothing booted" is a normal state to recover from.
pick_device() {
  xcrun simctl list devices -j | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
flat = [d for runtime in devices.values() for d in runtime if d.get("isAvailable", True)]
booted = [d for d in flat if d["state"] == "Booted"]
if booted:
    print(booted[0]["udid"]); raise SystemExit
iphones = [d for d in flat if "iPhone" in d["name"]]
if iphones:
    print(iphones[-1]["udid"])
'
}

[[ -n "$UDID" ]] || UDID="$(pick_device || true)"
if [[ -z "${UDID:-}" ]]; then
  echo "No usable simulator. Open one in Xcode, sign in to Marina, and retry." >&2
  exit 1
fi

if ! xcrun simctl list devices booted | grep -q "$UDID"; then
  echo "▸ booting     $UDID"
  xcrun simctl boot "$UDID" 2>/dev/null || true
  open -a Simulator 2>/dev/null || true
  for _ in $(seq 1 30); do
    xcrun simctl list devices booted | grep -q "$UDID" && break
    sleep 2
  done
fi
echo "▸ device      $UDID"
echo "▸ test        MarinaUITests/$TEST_CLASS"
echo "▸ stages      $STAGES"

CONTAINER="$(xcrun simctl get_app_container "$UDID" "$APP_ID" data 2>/dev/null || true)"
if [[ -z "$CONTAINER" ]]; then
  echo "Marina is not installed on $UDID. Run it once from Xcode first." >&2
  exit 1
fi
SUPPORT="$CONTAINER/Library/Application Support/Marina"
mkdir -p "$SUPPORT"

# ---- 2. grant permissions (once) ------------------------------------------
for service in microphone location location-always; do
  xcrun simctl privacy "$UDID" grant "$service" "$APP_ID" 2>/dev/null || true
done
echo "▸ permissions microphone + location granted"

# ---- 1+3+4. seed / drive / repeat -----------------------------------------
run_stage() {
  local stage="$1"
  local prefix=""
  [[ "$STAGES" == *" "* ]] && prefix="stage${stage}-"

  # Clear anything a previous (possibly killed) run left behind. Leftover audio
  # makes the app open on "Recording recovered" instead of the Note Taker, so
  # without this one interrupted run poisons every run after it. profile.json is
  # deliberately NOT touched — that is the signed-in session.
  xcrun simctl terminate "$UDID" "$APP_ID" 2>/dev/null || true
  rm -f "$SUPPORT/report-draft.json"
  rm -f "$SUPPORT/segments/"* 2>/dev/null || true

  python3 "$VIDEO_DIR/scripts/seed-draft.py" --stage "$stage" > "$SUPPORT/report-draft.json"
  echo "▸ stage $stage      seeded (prefix '${prefix:-none}')"

  set +e
  TEST_RUNNER_MARINA_SHOT_DIR="$STAGING" \
  TEST_RUNNER_MARINA_SHOT_PREFIX="$prefix" \
  xcodebuild test \
    -project "$PROJECT_DIR/Marina.xcodeproj" \
    -scheme "$SCHEME" \
    -destination "platform=iOS Simulator,id=$UDID" \
    -only-testing:"MarinaUITests/$TEST_CLASS" \
    -resultBundlePath "$STAGING/result-$stage.xcresult" \
    > "$STAGING/xcodebuild-$stage.log" 2>&1
  local status=$?
  set -e

  grep -E '^\s*\[shot\]' "$STAGING/xcodebuild-$stage.log" | sed 's|.*/|   |' || true

  if [[ $status -ne 0 ]]; then
    echo "✗ stage $stage failed — last 25 lines:" >&2
    grep -E 'error:|XCTAssert|Failing tests' "$STAGING/xcodebuild-$stage.log" | tail -25 >&2
    echo "  full log: $STAGING/xcodebuild-$stage.log" >&2
    return 1
  fi
}

FAILED=0
for stage in $STAGES; do
  run_stage "$stage" || FAILED=1
done

# ---- collect ---------------------------------------------------------------
shopt -s nullglob
PNGS=("$STAGING"/*.png)
if [[ ${#PNGS[@]} -eq 0 ]]; then
  echo "✗ no screenshots produced." >&2
  exit 1
fi

mkdir -p "$SHOT_DIR"
if [[ $KEEP -eq 0 ]]; then
  # Stale shots from a previous storyline are worse than missing ones: the film
  # renders happily against a screen the app no longer has.
  rm -f "$SHOT_DIR"/stage*.png "$SHOT_DIR"/nt-*.png "$SHOT_DIR"/report-*.png "$SHOT_DIR"/FAILED-*.png
fi
cp "$STAGING"/*.png "$SHOT_DIR/"

echo
echo "▸ ${#PNGS[@]} shots → $SHOT_DIR"
[[ $FAILED -eq 0 ]] || echo "⚠ at least one stage failed; shots above may be incomplete" >&2
echo
echo "Next:  cd $VIDEO_DIR && npm run render:consultation"
