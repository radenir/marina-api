#!/usr/bin/env bash
# ===========================================================================
# record-demo.sh — record one continuous take of Marina filling a report.
#
# Where capture-shots.sh photographs the app for a Remotion slideshow, this
# films it. The output is a single screen recording of the simulator, in real
# time, with the Problem and Findings fields dictated using prepared ElevenLabs
# soundbytes that the app genuinely transcribes.
#
# ---------------------------------------------------------------------------
# The audio path — the part that is not obvious
# ---------------------------------------------------------------------------
# The iOS Simulator does not have its own microphone. It reads the Mac's
# DEFAULT INPUT DEVICE. So to make the app hear a file, the file has to be
# played out of the Mac into a device that is also an input — a loopback. That
# is what BlackHole is: a virtual sound card whose output is wired to its own
# input.
#
#     afplay ──▶ BlackHole (default output)
#                    │
#                    └──▶ BlackHole (default input) ──▶ Simulator mic ──▶ Marina
#
# This script switches both defaults to BlackHole for the duration of the take
# and puts them back on exit, including on Ctrl-C. While it runs YOU WILL HEAR
# NOTHING from the Mac — that is correct, the audio is going down the virtual
# cable. (To monitor, build a Multi-Output Device containing BlackHole and your
# speakers in Audio MIDI Setup and pass its name as --monitor.)
#
# The screen recording carries no audio at all — simctl records video only. The
# soundbytes are the app's INPUT, not the film's soundtrack. Narration is mixed
# in afterwards from public/audio (see gen-vo.mjs).
#
# ---------------------------------------------------------------------------
# How the test triggers playback
# ---------------------------------------------------------------------------
# The test runs inside the simulator and cannot call afplay on the host, so the
# two rendezvous through a directory (the same trick ShotWriter uses to write
# PNGs to a host path). The test writes req-<n>, the watcher loop below plays
# the named mp3 and writes ack-<n>, the test blocks until the ack appears. That
# blocking is what makes the test tap "stop dictating" when the sentence has
# actually ended, rather than after a guessed number of seconds.
#
# ---------------------------------------------------------------------------
# One-time setup
# ---------------------------------------------------------------------------
#   brew install --cask blackhole-2ch     # needs your password; reboot after
#   brew install switchaudio-osx          # lets this script flip the defaults
#   node scripts/gen-demo-voice.mjs       # writes public/soundbytes/*.mp3
#
# The simulator must have Marina installed and SIGNED IN — or export
# MARINA_DEMO_EMAIL and MARINA_DEMO_PASSWORD and the take will sign in on camera.
#
# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
#   ./scripts/record-demo.sh
#   ./scripts/record-demo.sh --out out/demo.mp4
#   ./scripts/record-demo.sh --device <udid>
#   ./scripts/record-demo.sh --monitor "Marina Monitor"   # multi-output device
#   ./scripts/record-demo.sh --keep-draft                 # don't clear the report
# ===========================================================================
set -euo pipefail

APP_ID="eu.marinahealth.Marina"
PROJECT_DIR="$HOME/XcodeProjects/Marina"
VIDEO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOUNDBYTE_DIR="$VIDEO_DIR/public/soundbytes"
SCHEME="MarinaFilmShots"

# Somewhere plausible for a ship bound for Rotterdam — the North Sea. The take
# taps "Use my location", so the simulator needs a position to hand over.
SIM_LAT="52.9"
SIM_LON="3.6"

OUT="$VIDEO_DIR/out/marina-demo-take.mp4"
UDID=""
MONITOR_DEVICE="BlackHole 2ch"
KEEP_DRAFT=0
# Which take to record. A class runs its one test; "Class/method" targets a
# single method, which is how the Quickstart's separate clips are captured —
# each QuickstartFilmTests method is its own recording.
TEST_CLASS="DemoFilmTests"
# Seed a finished report before rolling (via seed-draft.py). Used by the send
# clip, which films the export controls, not a dictation. Implies --keep-draft.
SEED_STAGE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)        OUT="$2";            shift 2 ;;
    --device)     UDID="$2";           shift 2 ;;
    --monitor)    MONITOR_DEVICE="$2"; shift 2 ;;
    --keep-draft) KEEP_DRAFT=1;        shift ;;
    --test)       TEST_CLASS="$2";     shift 2 ;;
    --seed)       SEED_STAGE="$2"; KEEP_DRAFT=1; shift 2 ;;
    -h|--help)    sed -n '2,62p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

# ---- 0. prerequisites ------------------------------------------------------
# Check all of them before touching anything, so a missing dependency costs a
# message rather than a half-configured audio system.
MISSING=0
if ! system_profiler SPAudioDataType 2>/dev/null | grep -qi 'blackhole'; then
  echo "✗ BlackHole is not installed." >&2
  echo "    brew install --cask blackhole-2ch   (needs your password, then reboot)" >&2
  MISSING=1
fi
if ! command -v SwitchAudioSource >/dev/null 2>&1; then
  echo "✗ SwitchAudioSource is not installed." >&2
  echo "    brew install switchaudio-osx" >&2
  MISSING=1
fi
if [[ ! -d "$SOUNDBYTE_DIR" ]] || [[ -z "$(ls -A "$SOUNDBYTE_DIR"/*.mp3 2>/dev/null)" ]]; then
  echo "✗ No soundbytes in $SOUNDBYTE_DIR" >&2
  echo "    node scripts/gen-demo-voice.mjs" >&2
  MISSING=1
fi
[[ $MISSING -eq 0 ]] || exit 1

CUE_DIR="$(mktemp -d)"
mkdir -p "$(dirname "$OUT")"

# ---- 1. pick a device ------------------------------------------------------
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

CONTAINER="$(xcrun simctl get_app_container "$UDID" "$APP_ID" data 2>/dev/null || true)"
if [[ -z "$CONTAINER" ]]; then
  echo "Marina is not installed on $UDID. Run it once from Xcode first." >&2
  exit 1
fi
SUPPORT="$CONTAINER/Library/Application Support/Marina"
mkdir -p "$SUPPORT"

echo "▸ device      $UDID"
echo "▸ test        MarinaUITests/$TEST_CLASS"
echo "▸ output      $OUT"

# ---- 2. teardown, registered before anything is changed --------------------
# Audio defaults are global to the Mac. Leaving them pointed at BlackHole after
# a failed run means the operator's next video call has no microphone and no
# sound, with no clue why — so the restore has to survive every exit path.
PREV_OUTPUT="$(SwitchAudioSource -c -t output 2>/dev/null || true)"
PREV_INPUT="$(SwitchAudioSource -c -t input 2>/dev/null || true)"
RECORD_PID=""
WATCHER_PID=""

cleanup() {
  [[ -n "$RECORD_PID" ]]  && kill -INT "$RECORD_PID"  2>/dev/null || true
  [[ -n "$WATCHER_PID" ]] && kill      "$WATCHER_PID" 2>/dev/null || true
  # Give simctl a moment to finalise the mp4 container; killing the process
  # group before it writes the moov atom yields a file nothing will play.
  [[ -n "$RECORD_PID" ]] && wait "$RECORD_PID" 2>/dev/null || true

  [[ -n "$PREV_OUTPUT" ]] && SwitchAudioSource -t output -s "$PREV_OUTPUT" >/dev/null 2>&1 || true
  [[ -n "$PREV_INPUT"  ]] && SwitchAudioSource -t input  -s "$PREV_INPUT"  >/dev/null 2>&1 || true
  echo "▸ audio       restored (out: ${PREV_OUTPUT:-?} / in: ${PREV_INPUT:-?})"

  rm -rf "$CUE_DIR"
}
trap cleanup EXIT INT TERM

# ---- 3. permissions and position -------------------------------------------
for service in microphone location location-always; do
  xcrun simctl privacy "$UDID" grant "$service" "$APP_ID" 2>/dev/null || true
done
xcrun simctl location "$UDID" set "$SIM_LAT,$SIM_LON" 2>/dev/null \
  || echo "⚠ could not set simulator location — 'Use my location' may hang" >&2
echo "▸ permissions microphone + location granted, position $SIM_LAT,$SIM_LON"

# ---- 4. start from an empty report -----------------------------------------
# The whole point of this take is a report filled from nothing. A draft left by
# a previous run would put the answers on screen before a word is spoken.
xcrun simctl terminate "$UDID" "$APP_ID" 2>/dev/null || true
if [[ -n "$SEED_STAGE" ]]; then
  # Lay down a finished report for the send clip. The app finds it at launch and
  # offers it as a resumable draft; the test taps Resume, and the export runs
  # against a real, fully-scored report.
  rm -f "$SUPPORT/segments/"* 2>/dev/null || true
  python3 "$VIDEO_DIR/scripts/seed-draft.py" --stage "$SEED_STAGE" > "$SUPPORT/report-draft.json"
  echo "▸ state       report seeded at stage $SEED_STAGE (for the send take)"
elif [[ $KEEP_DRAFT -eq 0 ]]; then
  rm -f "$SUPPORT/report-draft.json"
  rm -f "$SUPPORT/segments/"* 2>/dev/null || true
  echo "▸ state       report cleared (profile.json kept — that is the session)"
fi

# ---- 5. route audio through the virtual cable ------------------------------
SwitchAudioSource -t output -s "$MONITOR_DEVICE" >/dev/null
SwitchAudioSource -t input  -s "BlackHole 2ch"   >/dev/null
echo "▸ audio       out → $MONITOR_DEVICE, in → BlackHole 2ch"
if [[ "$MONITOR_DEVICE" == "BlackHole 2ch" ]]; then
  echo "              (you will hear nothing until this finishes — expected)"
fi

# ---- 6. the cue watcher ----------------------------------------------------
# Plays a soundbyte when the test asks for one, and acknowledges when the file
# has finished playing. afplay is synchronous, which is exactly what is needed:
# the ack means "the sentence is over", so the test stops recording on the last
# word rather than on a timer.
(
  while true; do
    for req in "$CUE_DIR"/req-*; do
      [[ -e "$req" ]] || continue
      n="${req##*/req-}"
      [[ -e "$CUE_DIR/ack-$n" ]] && continue
      name="$(cat "$req" 2>/dev/null || true)"
      mp3="$SOUNDBYTE_DIR/$name.mp3"
      if [[ -f "$mp3" ]]; then
        echo "   ♪ $name"
        afplay "$mp3" 2>/dev/null || true
      else
        echo "   ✗ missing soundbyte: $mp3" >&2
      fi
      touch "$CUE_DIR/ack-$n"
    done
    sleep 0.2
  done
) &
WATCHER_PID=$!

# ---- 7. roll ---------------------------------------------------------------
# Keep the previous take. Every run wrote to the same path and began by
# deleting it, so an aborted retry destroyed a good five-minute recording that
# had cost four attempts to get. Takes are expensive and not reproducible —
# the dictation is transcribed live, so no two are identical. Move the old one
# aside instead.
if [[ -s "$OUT" ]]; then
  PREV="${OUT%.mp4}-$(date +%H%M%S).mp4"
  mv "$OUT" "$PREV"
  echo "▸ previous    kept as $(basename "$PREV")"
fi
rm -f "$OUT"
xcrun simctl io "$UDID" recordVideo --codec h264 --force "$OUT" &
RECORD_PID=$!
sleep 2   # a couple of frames of the idle device before the app launches

# A recorder from an earlier run that was killed at the shell but not at the
# daemon keeps the device's single recording slot ("Host recording is already
# in progress"), and simctl reports that on stderr and exits. Announcing
# "recording started" regardless once cost a full take: the test played every
# soundbyte and drove the whole report while nothing was being filmed. So
# confirm the recorder is alive and writing before anything else happens.
if ! kill -0 "$RECORD_PID" 2>/dev/null || [[ ! -f "$OUT" ]]; then
  RECORD_PID=""
  echo "✗ the recorder did not start — nothing would have been filmed." >&2
  echo "  Usually a recording still held by a previous run. Release it with:" >&2
  echo "    xcrun simctl shutdown $UDID && xcrun simctl boot $UDID" >&2
  exit 1
fi
echo "▸ recording   started"

LOG="$CUE_DIR/xcodebuild.log"
set +e
TEST_RUNNER_MARINA_CUE_DIR="$CUE_DIR" \
TEST_RUNNER_MARINA_DEMO_EMAIL="${MARINA_DEMO_EMAIL:-}" \
TEST_RUNNER_MARINA_DEMO_PASSWORD="${MARINA_DEMO_PASSWORD:-}" \
xcodebuild test \
  -project "$PROJECT_DIR/Marina.xcodeproj" \
  -scheme "$SCHEME" \
  -destination "platform=iOS Simulator,id=$UDID" \
  -only-testing:"MarinaUITests/$TEST_CLASS" \
  -resultBundlePath "$CUE_DIR/result.xcresult" \
  > "$LOG" 2>&1 &
TEST_PID=$!

# Surface the test's own narration live, so a long take is watchable from the
# terminal instead of being a four-minute silence.
tail -f "$LOG" 2>/dev/null | grep --line-buffered -E '^\s*\[(film|cue)\]' &
TAIL_PID=$!

# ---- 8. cut ----------------------------------------------------------------
# Cut on the test's own signal, not on xcodebuild's exit.
#
# The test writes "done" as its last act, while the report is still on screen.
# Waiting for the process instead means waiting through XCTest's teardown — it
# terminates the app first, so the take ends on ten seconds of iOS home screen,
# which is exactly how the first finished recording came out. If the signal
# never arrives (a crash, an early failure) fall through when the test exits,
# so a broken run still yields whatever was filmed.
while kill -0 "$TEST_PID" 2>/dev/null; do
  [[ -e "$CUE_DIR/done" ]] && break
  sleep 0.2
done

sleep 0.4   # a beat of tail so the cut does not land on the last tap
kill -INT "$RECORD_PID" 2>/dev/null || true
wait "$RECORD_PID" 2>/dev/null || true
RECORD_PID=""
echo "▸ recording   stopped"

wait "$TEST_PID"
STATUS=$?
set -e
kill "$TAIL_PID" 2>/dev/null || true

if [[ $STATUS -ne 0 ]]; then
  echo "⚠ the test reported a failure — the take may be partial:" >&2
  grep -E 'error:|XCTAssert|Failing tests' "$LOG" | tail -20 >&2
  # The log lives in a temp dir the trap is about to delete, so keep a copy.
  cp "$LOG" "$VIDEO_DIR/out/record-demo-last.log" 2>/dev/null || true
  echo "  full log: $VIDEO_DIR/out/record-demo-last.log" >&2
fi

if [[ -f "$OUT" ]]; then
  echo
  echo "▸ take → $OUT"
  echo "  duration: $(python3 -c "
import subprocess,sys
try:
    out = subprocess.run(['mdls','-name','kMDItemDurationSeconds','-raw','$OUT'],
                         capture_output=True,text=True).stdout.strip()
    print(f'{float(out):.0f}s')
except Exception:
    print('unknown')
")"
else
  echo "✗ no video was produced. See the log above." >&2
  exit 1
fi
