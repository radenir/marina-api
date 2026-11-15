#!/bin/sh
# Installs the change-record gate as pre-push hook in the four Marina
# repositories and records each repository's origin/main as its baseline
# (commits up to the baseline are covered by the retrospective evaluation of
# 2026-11-15). Re-running keeps existing baselines.
set -e
GATE_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE="$HOME/.marina-change-gate"
mkdir -p "$STATE/pending"
[ -f "$STATE/baselines.json" ] || echo '{}' > "$STATE/baselines.json"
chmod +x "$GATE_DIR/pre-push"

for dir in \
  "$HOME/Documents/marina-api" \
  "$HOME/Documents/eu.marinahealth.eu/eu.marinahealth.eu" \
  "$HOME/XcodeProjects/Marina" \
  "$HOME/AndroidStudioProjects/Marina"
do
  repo=$(git -C "$dir" remote get-url origin | sed -e 's/\.git$//' -e 's#.*[/:]##')
  git -C "$dir" fetch -q origin main
  base=$(git -C "$dir" rev-parse origin/main)
  hook="$(git -C "$dir" rev-parse --git-path hooks)/pre-push"
  case "$hook" in /*) ;; *) hook="$dir/$hook" ;; esac
  if [ -e "$hook" ] && ! grep -q "change-gate" "$hook"; then
    echo "!! $repo: a different pre-push hook exists at $hook — not replaced"; continue
  fi
  ln -sf "$GATE_DIR/pre-push" "$hook"
  tmp=$(mktemp)
  jq --arg r "$repo" --arg b "$base" 'if has($r) then . else .[$r] = $b end' "$STATE/baselines.json" > "$tmp" && mv "$tmp" "$STATE/baselines.json"
  echo "ok  $repo  baseline $(jq -r --arg r "$repo" '.[$r]' "$STATE/baselines.json" | cut -c1-7)  hook $hook"
done
