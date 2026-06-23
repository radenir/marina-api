# Marina API — Audit-Grade Verification Harness

Verifies the Marina **interview → extract → seafarer report** pipeline against
versioned test cases with **field-level assertions**, captures **provenance**,
and emits **machine-readable evidence** (JUnit XML + JSON) plus a **requirement
traceability matrix**.

This is distinct from `tests/run_reports.py`, which only records that the
pipeline *ran*. This harness asserts that the output is *correct*: every
extracted vital sign is checked against the known ground truth, and the report
PDF is parsed to confirm the values actually rendered.

## Why this is auditable

| Audit property | How it is met |
|---|---|
| **Defined test cases** | `fixtures.py` — 30 cases with stable IDs (`MAR-EXT-NN`), never renumbered |
| **Ground truth** | Each case carries the exact vitals/gender/AVPU the simulated MO reports; the extract must recover them |
| **Objective pass/fail** | Field-level equality assertions, not "did it run" |
| **Requirement traceability** | Every assertion is tagged with a `REQ-*` id; `traceability.md` maps requirement → cases → result |
| **Provenance** | Each run records API git SHA + branch + dirty flag, simulator model, UTC timestamp, harness version, evidence source |
| **Reproducible evidence** | `results.json` (full detail), `junit.xml` (CI-gating), `traceability.md` retained per run id |
| **No silent masking** | The harness exits non-zero if any assertion fails — a real defect cannot show up as "green" |

## Requirements verified

| ID | Requirement |
|---|---|
| REQ-INT-COMPLETE | Interview completes all stages and returns `done=true` |
| REQ-EXT-VITALS | Extracted vital signs exactly match the reported values |
| REQ-EXT-DEMOG | Extracted gender and AVPU match the patient |
| REQ-EXT-CHIEF | Extracted chief complaint reflects the presenting symptom |
| REQ-EXT-SCHEMA | Extract summary contains all required clinical fields, populated |
| REQ-PDF-GEN | A Marina seafarer report PDF is generated |
| REQ-PDF-FIELDS | The report PDF contains the extracted clinical values |
| REQ-I18N | Non-English interviews are extracted into a correct (English) summary |

## Files

```
tests/audit/
├── fixtures.py        30 versioned cases: ground truth + expected + requirement traces
├── run_audit.py       runner: assertions + provenance + JUnit/JSON/traceability
├── README.md          this file
└── results/<run_id>/  evidence per run: junit.xml · results.json · traceability.md
```

## Running

```bash
# verify the artifacts already captured under tests/reports/ (no network)
python3 tests/audit/run_audit.py

# verify a specific evidence set
python3 tests/audit/run_audit.py --assert-existing path/to/reports
```

Exit code `0` = every assertion passed; `1` = at least one failed (use as a CI gate).

## Methodology notes

- **Ground truth is shared, not duplicated.** Fixtures parse the exact vitals out
  of the same persona prompts the run was driven from (`tests/run_simple.py`), so
  the test oracle and the run cannot silently diverge.
- **Vitals are deterministic.** The simulated medical officer reports fixed values,
  so extracted-vs-expected is an exact-match assertion (not a fuzzy one).
- **Narrative fields** (history, problem description) are LLM-generated and are
  checked for presence/schema and, for non-English cases, that the output is an
  English summary (`REQ-I18N`) — not for exact wording.
- **PDF verification reads the actual AcroForm fields** (`pdftk dump_data_fields`)
  of the rendered report, so a value present in `summary.json` but missing from the
  PDF form is caught (it is — see below).

## Current standing

As of the captured batch (API commit `ec80774` + the `seafarerMapper.ts` vitals
fix): **all 8 requirements pass — 597/597 assertions across 30 cases, 23
languages.**

- REQ-EXT-VITALS 180/180, REQ-EXT-DEMOG 60/60, REQ-EXT-CHIEF 30/30, REQ-I18N
  27/27, REQ-EXT-SCHEMA 30/30, REQ-INT-COMPLETE 30/30, REQ-PDF-GEN 30/30,
  **REQ-PDF-FIELDS 210/210**.

History: the first run found REQ-PDF-FIELDS failing 210/210 — the extracted
vitals and Sex/AVPU radios were correct in `summary.json` but not rendered into
the report PDF (a `src/lib/seafarerMapper.ts` defect: it read a `vitals` string
the extract never produces). The mapper was fixed to read the discrete extract
fields (`circulation_*`, `breathing_*`, `expose_*`), the 30 PDFs were
regenerated from the captured summaries via `regenerate_pdfs.ts`, and the audit
now passes with no change to the extraction evidence.

## Regenerating report PDFs locally

`regenerate_pdfs.ts` re-renders every `report.pdf` from its `summary.json` using
the local mapper + filler (no network, no API rate limits) — use it to refresh
evidence after a mapper change:

```bash
./node_modules/.bin/tsx tests/audit/regenerate_pdfs.ts
python3 tests/consolidate_reports.py     # refresh the text records
python3 tests/audit/run_audit.py         # re-verify
```
