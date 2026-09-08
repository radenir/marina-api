# Marina — "90-Second Quickstart"

**Runtime:** ~1:30 · **Format:** 1920×1080, 30 fps · **Cutdown of** `SCENARIO-how-to-use.md` (Chapters 2, 3, 6).

The shortest useful film. It teaches the **four things that prevent every common failure** — nothing else. An officer who watches only this can run a consultation end to end without getting stuck. It's the clip that goes in the activation email and pins to the top of the help screen.

The four beats, and the failure each one prevents:

| beat | what it teaches | the failure it prevents |
|---|---|---|
| 1 | Fill Profile → **Save** | blank ETAs, half-empty reports, "I saved it but it's gone" |
| 2 | One tap to record | fighting the app to start; missing the auto-prefill |
| 3 | Tap **Update report** often | staring at a frozen report thinking nothing works |
| 4 | Nothing leaves until you **send** | assuming a finished report reached shore |

**Approach:** same as the full film — real screen recordings in a `DeviceShot` bezel, Remotion overlays on top (`Ring`, `TapDot`, `Pull`, `Freeze`, captions). Nothing inside the phone is faked. See `SCENARIO-how-to-use.md` § "Global visual system" for the overlay vocabulary.

**Why this one ships first:** its four clips never touch the date-of-birth picker (the one control still unresolved under test), so it can be captured today. It's also the honest smoke-test of the whole pipeline — capture → overlay → VO → render — on the smallest possible surface.

---

## Timing (locked to ~90 s)

| # | beat | in | out | VO clip |
|---|---|---|---|---|
| 0 | Title card | 0:00 | 0:05 | `vo-qs-0` |
| 1 | Profile + Save | 0:05 | 0:24 | `vo-qs-1` |
| 2 | One tap to record | 0:24 | 0:47 | `vo-qs-2` |
| 3 | Update report | 0:47 | 1:09 | `vo-qs-3` |
| 4 | Send it ashore | 1:09 | 1:25 | `vo-qs-4` |
| 5 | End card | 1:25 | 1:30 | `vo-qs-5` |

Retiming rule (same as the other films): each beat's frame length must exceed its VO clip length plus a tail, or the cross-dissolve clips the narrator. After `npm run vo`, re-measure and set the `*_FRAMES` constants.

---

## CAPTURE MANIFEST (4 clips)

Each is one UI-test `func` producing one clean recording, cut on `VoiceCue.finish()` so it never ends on the springboard.

| id | screen / state | precondition | interactions to film | must be visible | ~len |
|----|----|----|----|----|----|
| `QS-profile` | Profile tab | signed in | open Profile, type `15` into Cruise speed, tap **Save**, hold on green toast | "Cruise speed (knots)", **Save**, green "Profile saved." | 18s |
| `QS-start` | Note Taker idle → first tap | signed in, empty draft | rest on idle 2s, tap mic once, hold ~6s as prefill + GPS land | "Tap the microphone to start recording.", fields prefilling, Location filling itself | 20s |
| `QS-update` | Note Taker recording | continues from `QS-start` | dictate short problem soundbyte, let waveform run, tap **Update report**, hold as fields + badges refresh | waveform, timer, **Update report** button + spinner, badges appearing | 24s |
| `QS-send` | Report → PDF | report has content | open Template picker, keep **Marina**, tap **Download PDF** → "Report PDF" preview; back; tap **Email PDF** → "Email Sent" | template pill, **Download PDF**, **Email PDF**, "Email Sent" alert | 20s |

**Capture note:** `QS-start` → `QS-update` share state — film them as one continuous take and split in the edit; the report must be the same session. `QS-profile` and `QS-send` are independent. None require the DOB picker, port ETA, or dropdowns beyond the template pill.

---

## BEAT 0 — Title card (0:00–0:05)

**OVERLAY:** navy, Marina logo. Large: **"Marina in 90 seconds."** Sub: "Four things, and you're ready." Thin progress rail begins.

**VO (`vo-qs-0`):**
> Marina, in ninety seconds. Four things, and you're ready for your first consultation.

---

## BEAT 1 — Profile + Save (0:05–0:24)

**CLIP:** `QS-profile`.

**OVERLAY:**
- `Ring` "Cruise speed (knots)" as the number is typed. `Pull` to a card: *"This is how far you are from help."*
- On the tap: `Ring` **Save**, `TapDot` it, then `Ring` the green **"Profile saved."** toast the instant it appears.
- Final card holds through the toast: *"No autosave — always tap Save."*

**VO (`vo-qs-1`):**
> Before your first case, open your Profile and enter your cruising speed. Marina uses it to tell a shore doctor how many hours you are from the nearest hospital. Then tap Save — and wait for the green line. Profile doesn't save on its own.

**Caption:** `Cruise speed → then Save`

---

## BEAT 2 — One tap to record (0:24–0:47)

**CLIP:** `QS-start`.

**OVERLAY:**
- Rest on idle; `Pull` to name the mic.
- On the tap, a compact checklist builds in the Callout column, one line ticking per real on-screen event: `Recording` · `Ship & date filled` · `Position located`. Keep it to three — the full six-item version lives in the long film; here it must stay legible at speed.
- `Ring` the **Location** field the exact frame it fills itself.

**VO (`vo-qs-2`):**
> To start a consultation, open the Note Taker and tap the microphone — once. That one tap starts recording, fills in your ship and the date and time, and takes a GPS fix, before you've said a word. Then just talk. Describe what's wrong, in your own words, in any order.

**Caption:** `One tap: record + prefill + locate`

---

## BEAT 3 — Update report (0:47–1:09)

**CLIP:** `QS-update`. **This is the beat the whole quickstart exists for.**

**OVERLAY:**
- `Freeze` one beat on the live report *before* the tap, card: *"Recording ≠ report. It only moves when you tap this."*
- `Ring` **Update report** hard, `TapDot`, resume, and let the real fields and score badges refresh.
- After the refresh, second caption snaps in: **`Tap it often.`**

**VO (`vo-qs-3`):**
> Now the one button people forget. As you talk, tap "Update report" whenever you pause for breath. Marina is always listening — but the report on screen only rebuilds when you tap this. Tap it often, and watch the case fill itself in. Forget it, and the report just sits there while you wonder what's wrong.

**Caption:** `Update report — tap it often`

---

## BEAT 4 — Send it ashore (1:09–1:25)

**CLIP:** `QS-send`.

**OVERLAY:**
- `Ring` the template pill briefly; `TapDot` **Download PDF**, then **Email PDF**; `Ring` the **"Email Sent"** alert.
- Full-width card holds under the send: *"Nothing leaves the ship until you send it."*

**VO (`vo-qs-4`):**
> When you're done, pick a form and either download it or email it straight to the doctor. And the one rule to never forget: nothing leaves the ship until you send it. Finishing a report tells no one. You have to send it.

**Caption:** `Nothing reaches shore until you send it`

---

## BEAT 5 — End card (1:25–1:30)

**OVERLAY:** Marina logo on navy, `marinahealth.eu`. Four one-word chips fade in in sequence: **Save · Tap · Update · Send.**

**VO (`vo-qs-5`):**
> Set up once. Talk, tap Update, send. Marina does the rest.

---

## PRODUCTION NOTES

**VO clips:** `vo-qs-0` … `vo-qs-5`, generated by the same `gen-vo.mjs` path (George narrator). ~180 words total → ~80 s of speech, the rest is title/end cards and breathing.

**Build order:**
1. Capture the four `QS-*` clips (restructure of `DemoFilmTests`; `QS-start`+`QS-update` as one take).
2. `npm run vo vo-qs` — generate the six narration clips.
3. Measure clip lengths, set `*_FRAMES`.
4. New Remotion composition `MarinaQuickstart` (reuse `Stage.tsx`, `DeviceShot`, the overlay atoms).
5. `npm run render:quickstart` → `out/marina-quickstart.mp4`.

**Do not fake the Update-report refresh.** It's the point of the film — it has to be the real judge repopulating real fields, or the one thing we're teaching is a lie. `Freeze`/`Ring` the real clip; never animate a fake fill.

**Blocked on nothing.** Unlike Chapter 5 of the full film, none of these four clips need the DOB picker, so capture can begin immediately.
