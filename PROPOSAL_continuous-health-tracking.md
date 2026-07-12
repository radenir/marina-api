# Proposal: Wearable Health Tracking for Seafarers

**Adrian Radomski · 2026-06-30**

Seafarers wear a watch (Apple/Garmin/Whoop). Marina ingests the data continuously and turns it
into early warnings. Moves us from *documenting* emergencies to *preventing* them — and
activates the planned **Red-flag** and **Mental health** features that today have no input data.

## What we track

| Pillar | Detects | Signals |
|---|---|---|
| **Mental health** | Stress, depression trajectory, withdrawal | HRV, resting HR, sleep, activity + AI mood check-ins |
| **General health** | Cardiac, infection, hypertension, dehydration | HR, SpO₂, temperature vs. baseline |
| **Fatigue** | Sleep debt, *real* rest vs. logged rest hours | Sleep quality, recovery, activity timing |

## Why insurers (P&I clubs) pay for it

| Pillar | Claim it reduces |
|---|---|
| Mental health | Death / disability (suicide at sea is a top claim) |
| General health | Medical, evacuation, deviation, repatriation |
| Fatigue | Highest-severity: collisions, groundings, pollution |

Plus: aggregated data → **risk-based pricing** ("telematics for crew health") and **objective
claims validation** (less fraud).

## Why shipping companies pay for it

| Benefit | Why |
|---|---|
| Cost avoidance | One prevented evacuation pays for the fleet's devices |
| Safety | Fatigue is a top accident cause; we measure *real* rest |
| Compliance | MLC / STCW rest-hours, better PSC & vetting scores |
| Crew retention | Visible welfare in a labour shortage |
| Lower premiums | Insurers reward equipped fleets |

## Build vs. Buy

| | Build hardware | **Buy / integrate (recommend)** |
|---|---|---|
| Time | 18–36 mo | One quarter |
| Cost | €millions | Device + integration |
| Regulatory | We become a device maker | Use certified devices |
| Our moat | Diluted | Software + data + AI |

Be device-agnostic; pilot with Apple Watch.

## Plan

| Phase | Goal |
|---|---|
| 0 | Offline-first ingestion API + consent model |
| 1 | Apple Watch pilot on a small crew |
| 2 | Three-pillar early-warning engines |
| 3 | More devices + sell data / underwriting pilot |

**Ask:** approve Phase 0 + 1 — one quarter, low cost, no hardware program.
