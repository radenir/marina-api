# Change-record gate

Corrective action of CAPA-1 ("Product changes released without change evaluation").
Implements SOP Change Management and IEC 62304 chapter 9 at the moment of release:
nothing reaches `main` on GitHub (and from there production) without its record in
Formwork.

## What happens on `git push` to `main`

In the four Marina repositories (marina-api, eu.marinahealth.eu, marina-ios-app,
marina-android-app) the pre-push hook:

1. Lists the commits since the baseline that are not in the ledger yet.
2. Sends their messages, file list and diff (no `.env`, keys or binaries) to Claude,
   which proposes for each: change (MDCG 2020-3 Q1–Q10, outcome, rationale),
   bug fix (description, corrective action, area) or no product effect.
3. Shows the proposal. The QMO confirms:
   - in a terminal: answer `y`;
   - without a terminal (push from Claude Code): push again with
     `CHANGE_GATE_CONFIRM=<code> git push`, the code printed with the proposal.
4. Claude appends the rows to the Formwork records *CHM - Change Evaluation List*
   and *CHM - Bug Fixes Documentation List* (amendment with comment naming the QMO).
5. The commits are added to the ledger; the push continues.

A change proposed as **significant** (or undecided) blocks the push: it needs a new
UDI-DI and updated technical documentation first. If the QMO decides otherwise, edit
the proposal file (`outcome`, `rationale`) and push again.

Pushes to other branches are not checked. `git push --no-verify` skips the hook, but
the skipped commits stay unrecorded and are picked up by the next push to `main`.

## Files

- `gate.ts` — the gate (Node ≥ 23)
- `pre-push` — hook wrapper
- `install.sh` — installs the hook in all four repositories and records baselines
- State in `~/.marina-change-gate/`: `baselines.json`, `ledger.jsonl`, `pending/`

## Install

    sh ~/Documents/marina-api/tools/change-gate/install.sh

Needs `claude` (Claude Code) logged in with the Formwork connector, `node`, `jq`.
