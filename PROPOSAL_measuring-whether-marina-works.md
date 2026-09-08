# Proposal: Measuring Whether Marina Improves Care

**Adrian Radomski · 2026-09-03**

Marina should improve healthcare delivery onboard. If we can measure that, it beats every
positioning argument we have — because it is true. The catch is *which* improvement is
measurable. This splits the question and proposes a study we can start inside the Esvagt
round already running.

## What we cannot measure

**"Marina saves lives"** or **"Marina reduces serious harm"** — not at our scale, probably
not ever by ourselves.

| Fact | Consequence |
|---|---|
| 279 evacuations in the whole Danish fleet last year | The event we care about is rare |
| 10 ships in the Esvagt round, ~10 medical cases/ship/year | ~100 cases total, maybe 5 serious |
| Detecting a 1/3 drop in serious outcomes | Needs thousands of cases per arm — decades |
| A proper control group | Would mean withholding Marina from half the fleet |

Do not promise it. Do not design a study around it. Rare events simply do not work that way.

## What we can measure, starting now

When outcomes are rare, you measure the **quality of the process** and rely on the
already-established link between process and outcome. Five candidates, easiest first:

| # | Measure | How | Baseline from |
|---|---|---|---|
| 1 | **Vitals actually taken** — share of cases with a complete set (SpO₂, resp, pulse, BP, temp, AVPU) | Count from `state.data` | Historical RMD forms |
| 2 | **Record completeness** — share of fields the shore doctor actually needs | Score each case against the RMD form | Historical RMD forms |
| 3 | **Red flags caught** — of cases where a red flag was objectively present, how many were recorded and escalated | Score against protocol criteria | Retrospective scoring of RMD archive |
| 4 | **Time to decision** — symptom reported → doctor contacted → decision made | Marina timestamps automatically | RMD call logs |
| 5 | **Clarification round-trips** — how often the doctor comes back for more | RMD can count | RMD call logs |

**Run 1 and 3.** Number 1 because it is unarguable. Number 3 because it is the closest thing
to safety that is actually countable.

Case B is measure 2 in one sentence: chest pain reported competently, and hypotension at
95/60 with a pulse of 110 never mentioned.

## The one real outcome — one case at a time

**The avoided evacuation.** Not statistically. Individually.

When the shore doctor writes *"I did not evacuate because I had enough information to manage
this on board"* — that is one case, with a date and a euro figure.

- **5 cases** = a business case
- **20 cases** = a paper

It is also the claim Michael Stig (DFDS) made for us unprompted — *"reduce unnecessary
medical evacuations"* — and currently the one thing we cannot back up.

## We already have the collaborator

Line Emilie Lilholm Laugesen, General Manager at Radio Medical Denmark, RN + MScPH, wrote to
us in **April 2025**:

> "To investigate the potential of MARINA, a formal pilot trial evaluating the tool has to be
> conducted... Please consider this letter as formal confirmation of my serious interest in
> participating in the research projects related to MARINA."

She has the case archive, her doctors make the decisions we want to measure, and she offered
in writing eighteen months ago. We have not taken her up on it.

**This also fixes the RMD problem.** Measuring together makes them a research partner instead
of a competitor — which is the risk if we ever move toward evacuation decision support.

## Why this doubles as the compliance argument

ISM Code 9.1 requires the SMS to ensure occurrences are reported, investigated **and
analysed**; 9.2 requires corrective action including measures to prevent recurrence.

A completeness rate and a red-flag capture rate across a fleet **is** that analysis. So the
study is not a detour from the DPA/HSEQ story — it is that story, with numbers.

## Who the evidence is for

The buyer is not the medical adviser. It is the DPA, HSEQ or the insurance line. Last column
shows which measure above actually lands with each of them.

| Buyer | Worries about | Marina's claim | Evidence |
|---|---|---|---|
| **DPA** | ISM audit findings — an incident they cannot explain or analyse | Every medical event produces a consistent, timestamped, auditable record | 1, 2, 3 |
| **HSEQ** | Investigating incidents properly and proving the cause; client HSE audits *(offshore only)* | Structured facts where there is currently a handwritten note | 2, 3 |
| **Crewing** | Repatriation cost, medical unfitness, MLC 2006 liability (sick pay up to 16 weeks) | Earlier, better-informed decisions; cleaner paper trail | 4, avoided evac |
| **P&I club** | Loss ratio on crew claims, disputed causation, exaggerated claims | Contemporaneous structured evidence at the moment of the incident | 2, avoided evac |

**Ranking.** P&I is strongest — money already leaving the building, and the only row that is
a painkiller *before* something goes wrong. DPA is second and the only one with a citable
hook (ISM 9.1/9.2). HSEQ is the same argument told to a different person. Crewing is weakest;
do not build a pitch on it.

**Two things removed from an earlier draft of this table**, because they do not survive
contact with someone who does the job:

- **PSC detentions** — no ship is detained over medical paperwork. Use "ISM audit findings".
- **LTIF / TRCF** — Marina does not move them, and better recording can push TRCF *up*, because
  cases previously written off as first aid get recorded properly. Get ahead of this rather
  than claiming it: *"your numbers will become correct; some may rise because you are finally
  counting properly."*

## Plan

| Phase | Goal |
|---|---|
| 0 | Ethics + GDPR basis with SDU research support and TechGDPR. Research use is a *different* legal basis from service delivery |
| 1 | Retrospective baseline: score N historical RMD cases for measures 1–3 |
| 2 | Prospective capture on the Esvagt ten, same scoring |
| 3 | Avoided-evacuation case collection — shore doctor documents the counterfactual |
| 4 | Write it up with Line as co-author |

**Do Phase 0 before the first case.** Retrofitting consent is how good studies get thrown away.

## Why this is worth the time

- Turns Marina from a vitamin into a painkiller with evidence rather than positioning
- Produces the publications the Innofounder application promised and could not support
- Uses Adrian's actual training (PhD, 3 journal papers) rather than Peter's
- Gives DFDS and Stena a number instead of an argument

**Ask:** approve Phase 0 + 1 — low cost, no new build, and Phase 1 needs only RMD's archive
and a scoring rubric.
