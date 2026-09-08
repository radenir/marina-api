# Marina — "How to Use Marina" instructional film

**Runtime:** ~15:30 total, delivered as **8 standalone chapters** · **Format:** 1920×1080, 30 fps · **Companion to** `marina-walkthrough.mp4` (the 2-min tour) and `marina-consultation.mp4` (the 3-min story).

This is neither the tour nor the story. It is the **manual** — the film an officer watches once before their first real consultation, and scrubs back to when they forget a step. It teaches the app in the order an officer actually meets it, and it spends its time on the dozen things the app does that nobody discovers on their own.

Each chapter is a self-contained clip with its own end card. That is deliberate:

- An officer can watch "Chapter 3 — Note Taker" without the other seven.
- Each chapter is **re-shootable in isolation** — a fluffed Translator take never costs you the Note Taker footage.
- The chapters double as the app's in-context help: link Chapter 5 from the report screen, Chapter 8 from the offline banner.

---

## The approach: real recordings, not re-animated fakes

The two existing films take opposite routes — the walkthrough animates *static screenshots*, the consultation *re-implements the app* in Remotion so fields can type themselves. Both lie a little: one can't show motion, the other shows motion the app doesn't actually have.

This film takes the third route, the one `record-demo.sh` was built for: **every phone on screen is a real screen recording of the running app**, captured from the simulator, with Remotion drawing *on top of it* — callouts, highlight rings, tap indicators, captions, zooms. Nothing inside the phone is faked. When the score counts up, it's the real judge; when the hint slides in, it's the real hint.

So there are two layers, and the script separates them at every shot:

- **CLIP** — the raw screen recording. Captured by a UI test (an expanded `DemoFilmTests`), driven at human pace, no overlays. Listed in the **Capture Manifest** below with its exact device state and interactions.
- **OVERLAY** — everything Remotion adds over the clip: motion, text, emphasis. Never touches the pixels of the app itself; only frames and annotates them.

If a shot's teaching point is *inside* the app (a field filling, a badge changing colour), it lives in the CLIP and the OVERLAY just points at it. If the teaching point is a fact *about* the app ("35 languages"), it lives in the OVERLAY as a caption. The rule keeps us honest: we never draw a result the app didn't produce.

---

## Global visual system

**Stage layout** (`components/Stage.tsx`, reused from the consultation film): the phone sits **left**, in the `DeviceShot` bezel (iPhone 17 Pro, 1206×2622). A **Callout column** runs down the **right third** — this is where captions, numbered steps and the chapter's "teaching point" cards appear and retire on a timeline. The phone is never full-bleed except on title cards and the fullscreen-video beat.

**Chapter title card** (0:00–0:04 of each chapter): navy background, chapter number in the brand blue as a large numeral, chapter title in white, a thin progress rail along the bottom showing `Chapter N of 8`. Cross-dissolve out to the first shot.

**Captions / lower-thirds:** short, verbatim from the app where possible (`Update report`, not "the refresh button"). Rendered in the Callout column, one line, fade+rise in over 8 frames, hold, fade out. Never more than one caption on screen at once.

**Emphasis vocabulary** (Remotion overlays, defined in `motion.ts`):
- `Ring(x,y,r)` — a 3px brand-blue ring that draws itself around a control (stroke-dashoffset sweep, 12 frames) to say "look here." Used before every tap.
- `TapDot(x,y)` — a soft filled circle that scales 0→1→0 with a ripple, timed to the exact frame the real finger tapped in the clip. Because the clip has no visible cursor, this is how the viewer knows *what* was tapped.
- `Pull(x,y → col)` — a thin leader line from a point on the phone to a caption in the Callout column, for naming a thing without covering it.
- `ZoomTo(rect, scale)` — a Ken-Burns push into a region of the phone (e.g. one field) and back out, for when a detail is too small at phone scale. The clip keeps playing during the zoom.
- `Freeze(frame, ms)` — hold the clip on one frame while a caption is read, then resume. Used sparingly; a frozen app reads as a paused video, so never longer than a caption needs.
- `CountUp` — not an overlay. Quality numbers count for real in the clip; we never fake a count. If we need to *emphasise* a number changing, we `Ring` it and let the real number move.

**Transitions between shots within a chapter:** 8-frame cross-dissolve. **Between chapters:** hard cut to the next title card (they're separate deliverables).

**Voice:** ElevenLabs George narrator, same as the other two films, one clip per shot (`vo-htu-<chapter>-<shot>`). Instructional register — second person, calm, unhurried, the tone of someone standing next to you. Never markety. The films that sell Marina already exist; this one just makes the officer competent.

**On-screen numbers worth stating (all codebase-verified):** 32 languages · 44 chief-complaint pathways · 9 interview stages · 3 report templates · 7 vital signs in one breath. Each earns its place by answering a real question.

---

## The running example

One patient across all eight chapters, so the clips are coherent and an officer sees a whole case assembled:

- **Officer:** the viewer ("you"), medical officer, no clinical training, profile language English for the master film (a localised cut swaps this).
- **Patient:** **Ramil Santos**, 34, Filipino AB. **Right-lower-quadrant abdominal pain, ~18 hours, possible appendicitis.** This is the case that makes a master consider diverting — the right stakes for a teaching film — and it is exactly the case `gen-demo-voice.mjs` already dictates, so the Note Taker and Report clips are the ones the harness is already producing.

Chapters that don't involve a patient (First Run, Profile, Offline) use the same vessel identity so the vessel fields read consistently: **MV Pacific Star**, cruise speed 15 kn, destination Rotterdam.

---

# CAPTURE MANIFEST

Every raw clip the film needs, in capture order. These are the shot list for the `DemoFilmTests` restructure — each becomes one `func` producing one screen recording, cut on the `VoiceCue.finish()` signal so it never ends on the springboard. Durations are the *recording* length; Remotion trims and speeds as noted per shot.

| id | screen / state | precondition | interactions to film | must be visible | ~len |
|----|----|----|----|----|----|
| `CAP-onboard` | Register → Verify → Awaiting activation → AI disclosure | signed **out**, fresh install | fill register form, tick Terms, tap Create Account; show verify screen; show awaiting-activation; scroll + accept disclosure | red asterisks, dimmed button before tick, the two processor names, "I understand and agree" | 60s |
| `CAP-profile` | Profile tab | signed in | open Profile, type cruise speed 15, set Language, tap Save, show green "Profile saved." | Cruise speed field, Language footer, Save, the green toast | 30s |
| `CAP-nt-start` | Note Taker idle → first tap | signed in, empty draft | rest on idle, tap mic once, hold on the live report as prefill + GPS land | "Tap the microphone to start recording.", fields prefilling, Location filling itself | 25s |
| `CAP-nt-dictate` | Note Taker recording | continues from start | dictate the problem (short soundbyte), let waveform run, tap **Update report**, watch fields + badges refresh | waveform, timer, Update-report button + its spinner, badges appearing | 40s |
| `CAP-nt-pause` | Note Taker pause/resume | recording | tap Pause (dot greys, waveform dims), beat, tap Resume | grey dot, dimmed waveform, play↔pause glyph | 12s |
| `CAP-nt-finish` | Note Taker finish → report opens | recording | tap Finish, confirm "Finish", show "Preparing your report…", land on report | Finish dialog verbatim, processing text, report sheet opening | 20s |
| `CAP-hint-empty` | Report, empty scored field | report open, chief complaint set | scroll to Physical Examination with nothing typed; show the amber hint present | amber lightbulb box, the fixed question text, 0% badge | 12s |
| `CAP-hint-read` | Report, hint read aloud | continues | tap the hint's speaker button; icon fills; (audio plays in clip) | speaker icon → filled, playing state | 10s |
| `CAP-hint-video` | Report, demo video inline → fullscreen | Physical Exam hint with a video | show looping inline clip, tap it, fullscreen with X, tap X to close | inline video in amber box, expand glyph, fullscreen, close X | 18s |
| `CAP-voice-edit` | Report, per-field voice edit | report open | tap "Edit by voice" under a field, dictate a change, show Transcribing→Applying→Keep this edit?, tap ✓; then repeat and tap ✗ to show undo | mic red+pulsing, status line cycle, Keep/Undo bar, field text changing | 35s |
| `CAP-vitals` | Report, dictate all vitals | Findings tab | tap "Dictate vital signs", say the 7 in one breath, show them landing, Keep | one mic, seven fields filling, "Not a vital sign" line if any extra | 20s |
| `CAP-chief` | Report, chief complaint re-grades | report with content | open Chief Complaint dropdown, pick Abdominal Pain, watch 5 sections' scores + hints change | 44-item list, multiple badges moving together | 15s |
| `CAP-port` | Report, port + ETA | Location filled | type "Rotter" in Destination Port, pick "Rotterdam (NLRTM)", watch ETA fill; show Nearest Port chips | suggestion list, ETA appearing, `CODE / ~ETA` chips | 20s |
| `CAP-score-states` | Report, the three badge states | report, link toggled | show a real number, then drop the link (wifi badge), then a red 0% | number badge, wifi-exclamation badge, red 0%, "N of M fields not checked" | 15s |
| `CAP-template-send` | Report, template → PDF | report complete | open Template picker (Marina/Denmark/Germany), pick one, tap Download PDF, show "Report PDF" preview + share; then Email PDF → "Email Sent" | template pill, three options, PDF preview, Email Sent alert | 30s |
| `CAP-interview` | AI Interview, full loop | signed in | setup: pick Patient=English, Officer=English, Start; Marina asks (read aloud), tap mic, answer, watch bilingual bubble + stage counter advance; tap Report | language cards, Stage N/9, mic states, bubble w/ translation line, speaker icons | 45s |
| `CAP-translator` | Translator, one exchange | signed in | Start with two languages; tap Patient mic, speak, show original+translation bubble auto-play; tap Officer mic, reply | two mics colour-coded, "Recording…", bubble anatomy, auto-play speaker | 30s |
| `CAP-offline` | Offline behaviour | recording | drop the link (banner appears), keep recording, show "N parts waiting to send"; restore link, counter drains; show "Recording recovered" recovery screen (separate boot) | red banner verbatim, backlog strip, recovery screen headline + "Finish report" | 30s |

**Capture note:** every clip is driven by the same cue-directory handshake `record-demo.sh` already uses, so dictation clips wait for the real soundbyte to finish, and each `func` calls `VoiceCue.finish()` on its last on-report frame. The offline clips need the app's `NetworkMonitor` pointed at a health endpoint we can fail on command — do this by blocking `api.marinahealth.eu` at the simulator, not by faking the banner.

---

# CHAPTER 1 — First Run (1:40)

**Goal:** get a brand-new officer from "downloaded the app" to "standing on the Note Taker," through the four gates they will otherwise hit blind. **Clip:** `CAP-onboard`.

### 1.0 — Title card
**OVERLAY:** "Chapter 1 — First Run." Progress rail `1 of 8`.
**VO:**
> Before Marina can help you, it needs to know who you are and which ship you're on. You do this once. Here's the whole of it.

### 1.1 — Register
**CLIP:** `CAP-onboard`, the register form. Filling First/Last name, email, password.
**OVERLAY:** `Ring` the red asterisks as the VO names "required." When the form is complete but the button is still dim, `Ring` the **Terms checkbox**, then `TapDot` it, and the button un-dims — timed to the real frame it enables.
**VO:**
> Register with your name and email. The fields with a red star are required. And this one catches everyone — the Create Account button stays greyed out until you tick the box agreeing to the terms. Nothing's broken. Tick it, and it comes alive.
**Caption:** `Tick Terms — the button enables`

### 1.2 — Vessel details, optional but not really
**CLIP:** same, scrolled to "Vessel details (optional)".
**OVERLAY:** `Pull` from the Ship name / Cruise speed fields to a card: *"These prefill every report you ever write."*
**VO:**
> The vessel section says optional. Fill it in anyway. Your ship's name, call sign, and cruising speed get copied into every report you write from now on — so you enter them once here instead of on every case.
**Caption:** `Enter the ship once, not every report`

### 1.3 — Verify email
**CLIP:** `CAP-onboard`, verify screen.
**OVERLAY:** `Ring` "Resend verification email," then the caption noting the 60-second cooldown.
**VO:**
> Marina emails you a link. Tap it in your inbox, come back, and tap "I've verified my email." If the mail didn't arrive, you can resend — there's a sixty-second wait between tries.

### 1.4 — Awaiting activation (the one nobody expects)
**CLIP:** `CAP-onboard`, awaiting-activation screen, amber box.
**OVERLAY:** `Ring` the whole amber box; `TapDot` it to show it opens mail. Hold on the support address.
**VO:**
> Now the step no one expects. A new account isn't switched on automatically — a person at Marina activates it. Until they do, you'll see this screen. Tap the highlighted box and it writes the email for you. Once you're activated, tap "check again," and you're in.
**Caption:** `Accounts are activated by a human — tap the box to email support`

### 1.5 — The AI disclosure
**CLIP:** `CAP-onboard`, disclosure, scrolling through "What Marina sends" and "Who processes it," ending on "I understand and agree."
**OVERLAY:** `Pull` to a card listing the two processors as the VO names them. `TapDot` the button.
**VO:**
> One last screen, shown only the first time. It tells you plainly what leaves the phone — the recording, the medical details, the ship's position — and the two companies that process it, both under agreements that keep no copy. Read it once, agree, and you land here: the Note Taker. That's where every consultation begins.
**Caption:** `Shown once. This is what leaves the phone.`

### 1.6 — Chapter end card
**OVERLAY:** Marina logo, `Next: Chapter 2 — Set up your Profile`.

---

# CHAPTER 2 — Set Up Your Profile First (1:10)

**Goal:** convince the officer to fill Profile *before* their first case, because three invisible things depend on it. **Clip:** `CAP-profile`.

### 2.0 — Title card
`2 of 8`.
**VO:**
> Two minutes in your Profile now saves you trouble on every case later. Three settings do real work — let's set them.

### 2.1 — Cruise speed
**CLIP:** `CAP-profile`, typing 15 into "Cruise speed (knots)".
**OVERLAY:** `Ring` the field. `Pull` to a card: *"No speed → no ETA."*
**VO:**
> First, your cruising speed. This is the number Marina uses to work out how many hours you are from the nearest port with a hospital — the figure a shore doctor needs to decide whether you divert. Leave it blank, and that estimate simply can't be calculated.
**Caption:** `Cruise speed drives every ETA`

### 2.2 — Language
**CLIP:** `CAP-profile`, the Language selector, footer "Used for reports and translation."
**OVERLAY:** `Pull` to a card naming the two effects.
**VO:**
> Second, your language. Set it once, and Marina's coaching questions appear in it, and it becomes your default side of every translation. Set it to the language you actually think in.
**Caption:** `Your language: hints + translation default`

### 2.3 — Save (there is no autosave)
**CLIP:** `CAP-profile`, tapping Save, the green "Profile saved." toast.
**OVERLAY:** `Ring` Save; `TapDot`; `Ring` the toast when it appears.
**VO:**
> And this one matters: Profile does not save on its own. Make your changes, then tap Save, and wait for the green line. Close it without saving and the changes are gone.
**Caption:** `No autosave — tap Save`

### 2.4 — Officer, not patient
**CLIP:** hold on the filled Personal section.
**OVERLAY:** `Freeze` + a card: *"This is you. The patient's details come later, by voice."*
**VO:**
> One thing to be clear on: this profile is you — the medical officer. Your name goes on the report as the person who prepared it. The patient's name, age and details aren't here; you'll capture those in the consultation.
**Caption:** `Profile = the officer, never the patient`

### 2.5 — Chapter end card
`Next: Chapter 3 — The Note Taker`.

---

# CHAPTER 3 — The Note Taker (2:40)

**Goal:** teach the primary workflow, and hammer the one thing that makes or breaks it — **Update report**. **Clips:** `CAP-nt-start`, `CAP-nt-dictate`, `CAP-nt-pause`, `CAP-nt-finish`.

### 3.0 — Title card
`3 of 8`.
**VO:**
> This is where you'll spend most consultations. You record yourself examining and talking to the patient, and Marina turns it into a report as you go. Let's do a real one — Ramil Santos, an able seaman with stomach pain.

### 3.1 — The idle screen
**CLIP:** `CAP-nt-start`, resting on idle before the tap.
**OVERLAY:** `Pull` to name the mic and the top-right `Report` doc icon (*"blank report, no recording — for later"*).
**VO:**
> When you open Marina, this is where you land — not the first tab, this one. One big button, and one instruction: tap the microphone to start.

### 3.2 — One tap does six things
**CLIP:** `CAP-nt-start`, the tap, then the live report as prefill lands and Location fills itself.
**OVERLAY:** as the fields populate, a stacked checklist builds in the Callout column, one line ticking per real event: `Microphone on` · `Old draft cleared` · `Ship details filled` · `Date & time set` · `Position located` · `Nearest port found`. `Ring` the Location row the instant it fills.
**VO:**
> That one tap does six things at once. It starts recording. It clears any half-finished draft. It fills in your ship's details and the date and time. And it takes a GPS fix and finds your nearest port — before you've said a single word. Watch the position fill itself in.
**Caption:** `One tap: record + prefill + locate`

### 3.3 — Just talk
**CLIP:** `CAP-nt-dictate`, waveform running as the problem is dictated.
**OVERLAY:** `Ring` the live waveform and the running timer. Caption the languages fact.
**VO:**
> Now you just talk. Describe what's wrong, in your own words, in whatever order it comes out. You're not filling a form — you're telling the story, the way you would to a colleague.
**Caption:** `Speak naturally — no form, no order`

### 3.4 — THE teaching point: Update report
**CLIP:** `CAP-nt-dictate`, the moment of tapping **Update report** and the fields + badges refreshing together.
**OVERLAY:** This is the most important shot in the film. `Freeze` for one beat on the frozen live report *before* the tap, with a card: *"Recording ≠ report. The report only moves when you tap this."* Then `Ring` the Update-report button hard, `TapDot`, resume, and let the real fields and score badges refresh. A second caption after: `Tap it often.`
**VO:**
> Here is the one thing to remember about the Note Taker. It is always transcribing — but the report on screen does not rebuild by itself. It only updates when you tap this button, "Update report." Tap it whenever you pause for breath. Tap it often. If you forget, the recording keeps going but the report sits frozen, and you'll think nothing's happening.
**Caption:** `Update report — tap it often`

### 3.5 — Pause and resume
**CLIP:** `CAP-nt-pause`.
**OVERLAY:** `Ring` the dot as it greys; caption.
**VO:**
> Need to stop for a moment — step out, take a call, examine the patient quietly? Pause. The dot goes grey, the recording genuinely stops, and nothing but silence is missed. Tap again to carry on.
**Caption:** `Pause = a real stop, not a mute`

### 3.6 — Finish is a one-way door
**CLIP:** `CAP-nt-finish`, the Finish dialog, "Preparing your report…", report opening.
**OVERLAY:** `Freeze` on the dialog; caption its exact warning.
**VO:**
> When the consultation is over, tap Finish. Read the warning — this ends the session, and you can't record more onto it afterwards. Confirm, and Marina prepares your report and opens it. That's the next chapter.
**Caption:** `Finish is final — no more recording after`

### 3.7 — Chapter end card
`Next: Chapter 4 — Marina tells you what to ask`.

---

# CHAPTER 4 — Marina Tells You What to Ask (2:10)

**Goal:** reframe the amber hints from "criticism" to "a live checklist," and show read-aloud + demo videos. This is Marina's actual differentiator and it's the chapter to get right. **Clips:** `CAP-hint-empty`, `CAP-hint-read`, `CAP-hint-video`.

### 4.0 — Title card
`4 of 8`.
**VO:**
> You are not a doctor, and Marina doesn't expect you to be. It knows what a shore physician will want for this exact complaint, and it walks you through it. This is the part that turns a recording into a proper clinical work-up.

### 4.1 — The hint is a question, not a grade
**CLIP:** `CAP-hint-empty`, an empty Physical Examination field with its amber lightbulb hint and 0% badge.
**OVERLAY:** `Ring` the lightbulb box. `Pull` to a card: *"44 complaints, each with its own checklist. This is the next item on yours."*
**VO:**
> See the amber box with the lightbulb? That's not marking you down. It's the next question worth asking, chosen from the medical protocol for this complaint. Marina knows forty-four of them, each with its own list of what matters. It always surfaces the single most useful thing you haven't covered yet.
**Caption:** `Amber = the next question to ask`

### 4.2 — Read it to the patient
**CLIP:** `CAP-hint-read`, tapping the speaker, icon filling.
**OVERLAY:** `TapDot` the speaker; `Ring` it as it plays.
**VO:**
> If the patient speaks another language, tap the speaker. Marina reads the question aloud, in your language or theirs, so you can put it straight to them.
**Caption:** `Tap the speaker — read it aloud`

### 4.3 — And shows you how
**CLIP:** `CAP-hint-video`, the inline demo video looping in the amber box, tap to fullscreen, the real clip, close.
**OVERLAY:** on the inline clip, `Ring` + an expand glyph hint; `TapDot` to fullscreen. During fullscreen, **no overlay** — let the demonstration play clean. Caption the count on exit.
**VO:**
> And when the question asks you to actually do something — an examination technique you've never performed — Marina shows you. Tap the little video and it fills the screen. Watch it, do the same to your patient, and say what you saw. Twenty-five of these, each attached to the question that needs it.
**Caption:** `25 demo videos — watch, do, say`

### 4.4 — The checklist works before you write
**CLIP:** reuse `CAP-hint-empty`, `ZoomTo` the Investigations + Physical Examination badges showing hints on empty fields.
**OVERLAY:** card: *"These are graded the moment you set a complaint — before you've written a word. Use them as a to-do list."*
**VO:**
> Here's how to really use this: the Examination and Tests sections start advising you the moment you pick a complaint, before you've written anything. So they're not marking your work — they're your to-do list for the case. Work down them, and the report writes itself into shape.
**Caption:** `Hints appear first — they're a to-do list`

### 4.5 — Chapter end card
`Next: Chapter 5 — Editing the report`.

---

# CHAPTER 5 — Editing the Report (3:00)

**Goal:** the richest screen — tabs, voice editing, vitals in one breath, chief complaint, ports, and score literacy. **Clips:** `CAP-chief`, `CAP-voice-edit`, `CAP-vitals`, `CAP-port`, `CAP-score-states`.

### 5.0 — Title card
`5 of 8`.
**VO:**
> The report has three tabs and a lot in it. You rarely touch most of it — Marina fills it from your recording. But five things are worth knowing how to drive by hand.

### 5.1 — The three tabs, and the trap
**CLIP:** `CAP-chief` opening, showing Patient / Problem / Findings and that only Patient Information is expanded.
**OVERLAY:** `Ring` the three tab icons; `Ring` the collapsed section chevrons. Card: *"Only the top section is open. Tap the others — whole tabs get missed."*
**VO:**
> Three tabs — Patient, Problem, Findings. And a warning: when the report opens, only the first section is expanded. The rest are collapsed, and a lot of officers never notice the Findings tab exists. Tap the headers open. Nothing's missing — it's just folded away.
**Caption:** `Only Patient Information starts open — tap the rest`

### 5.2 — Set the Chief Complaint first
**CLIP:** `CAP-chief`, opening the 44-item dropdown, picking Abdominal Pain, five sections' scores and hints changing together.
**OVERLAY:** `Ring` five badges simultaneously as they move. Card: *"The complaint is the rubric. Everything is graded against it."*
**VO:**
> Do this one early. The Chief Complaint is a fixed list — pick the closest match. And it's the single most important choice in the report, because every score and every coaching question is measured against it. Change it, and watch five sections re-grade at once. Set it at the start, or you'll spend the whole case reading advice for the wrong complaint.
**Caption:** `Set Chief Complaint first — it grades everything`

### 5.3 — Edit any field by voice
**CLIP:** `CAP-voice-edit`, the mic under a field, dictating a change, status cycling Recording → Transcribing → Applying → Keep this edit?, tapping ✓; then a second edit tapping ✗.
**OVERLAY:** caption the status line at each phase (`Recording — tap to finish` → `Transcribing…` → `Applying…` → `Keep this edit?`). `Ring` the Keep/Undo bar. Card at the ✗: *"The change is already in the field. Undo puts it back exactly."*
**VO:**
> Any field with a little microphone can be fixed by voice. Tap it, say the change in your own language, and Marina rewrites the field. Notice it writes the new text straight in — and gives you Keep or Undo underneath. Keep confirms it. Undo restores exactly what was there. Nothing changes for good until you say so, because this is becoming a medical record.
**Caption:** `Edit by voice — always reversible`

### 5.4 — All seven vitals in one breath
**CLIP:** `CAP-vitals`, one mic, dictating "pulse 88, BP 130 over 85, temp 38.4, he's alert," seven fields landing.
**OVERLAY:** `Ring` each vital field as it fills. If the "Not a vital sign" line appears, `Pull` to it: *"Anything that isn't a vital is rescued here, not dropped."*
**VO:**
> The vital signs have one microphone for the whole section. Read them straight off your instruments in one breath — pulse, blood pressure, temperature, oxygen, and so on — and each number lands in its own box. Anything you say that isn't a vital sign, Marina sets aside for you rather than losing it.
**Caption:** `Say all seven vitals at once`

### 5.5 — Ports and ETA
**CLIP:** `CAP-port`, typing "Rotter," picking "Rotterdam (NLRTM)," ETA filling, nearest-port chips.
**OVERLAY:** `Ring` the suggestion, `TapDot`, `Ring` the ETA as it appears. Card: *"ETA needs a Location and your cruise speed — that's why Profile mattered."*
**VO:**
> For the ports, type a couple of letters and pick from the list. The moment you choose one, Marina works out your time to reach it — using the position it captured and the cruising speed from your profile. That's why we set that first. The nearest port even suggests itself, with alternatives you can tap between.
**Caption:** `Pick a port → ETA fills itself`

### 5.6 — Score literacy (its own beat)
**CLIP:** `CAP-score-states`, cycling a real number → wifi-exclamation badge → red 0%, plus "N of M fields not checked."
**OVERLAY:** three cards in sequence, each pinned as its state shows: *"A number = a verdict."* · *"A wifi icon = we couldn't check it. Not zero."* · *"A red 0% = checked, and nothing's there."* Then a pale-number example: *"Faded = real, but not everything's been checked yet."*
**VO:**
> Last, learn to read the scores, because one mistake here is common. A number is a real verdict. A wifi symbol where a number should be does not mean zero — it means Marina couldn't reach the internet to check. A red zero percent is different: that one was checked, and there's genuinely nothing documented. And a faded, pale number is real but partial — some fields are still unchecked. Number, wifi, zero, faded — four different things.
**Caption:** `unknown ≠ 0% — learn the four states`

### 5.7 — Chapter end card
`Next: Chapter 6 — Sending it ashore`.

---

# CHAPTER 6 — Send It Ashore (1:15)

**Goal:** templates, download vs email, and the hard rule that nothing transmits until they do this. **Clip:** `CAP-template-send`.

### 6.0 — Title card
`6 of 8`.
**VO:**
> Your report is done. Getting it to a doctor is two taps — but there's one rule to burn in first.

### 6.1 — Three forms, one dictation
**CLIP:** `CAP-template-send`, opening the Template picker (Marina / Denmark / Germany), selecting one.
**OVERLAY:** `Ring` the three options; caption.
**VO:**
> Marina can produce your report on three official forms from the one consultation — its own, the Danish Radio Medical form, and the German TMAS form. Pick whichever the service you're calling expects.
**Caption:** `3 official forms · one dictation`

### 6.2 — Download or email
**CLIP:** `CAP-template-send`, Download PDF → "Report PDF" preview + share; then Email PDF → "Email Sent."
**OVERLAY:** `TapDot` each button; `Ring` the share icon and the "Email Sent" alert.
**VO:**
> Download it to preview, share it, or save it to Files — or email it straight to the doctor, and Marina confirms it's sent.
**Caption:** `Download to preview · Email to send`

### 6.3 — The rule
**CLIP:** `Freeze` on the report with a `Ring` around both buttons.
**OVERLAY:** full-width card: *"Nothing leaves the ship until you Download or Email. Finishing a report notifies no one."*
**VO:**
> And the rule: nothing — nothing — leaves the ship until you download or email it. Finishing a report does not alert anybody. Closing it saves it safely on the phone, but it stays on the phone. The report reaches shore only when you send it. Never assume it went by itself.
**Caption:** `Nothing reaches shore until you send it`

### 6.4 — Chapter end card
`Next: Chapter 7 — Interview & Translator`.

---

# CHAPTER 7 — When the Patient Doesn't Speak Your Language (2:05)

**Goal:** the two bilingual tools — AI Interview (structured) and Translator (free conversation). **Clips:** `CAP-interview`, `CAP-translator`.

### 7.0 — Title card
`7 of 8`.
**VO:**
> Two tools for when you and the patient don't share a language. One interviews the patient for you. The other just translates, both ways. Use whichever fits.

### 7.1 — AI Interview: setup
**CLIP:** `CAP-interview`, the two language cards, Start.
**OVERLAY:** `Ring` the Patient and Medical Officer cards; card: *"Patient's language on the left — get it right or the transcription is garbage."*
**VO:**
> The AI Interview conducts a structured history for you. Set two languages — yours, and the patient's. Get the patient's language right; it's what their answers are transcribed in.
**Caption:** `Set both languages before Start`

### 7.2 — The interview loop
**CLIP:** `CAP-interview`, Marina asking (read aloud), tapping the mic, the patient answering, the bilingual bubble, Stage counter advancing.
**OVERLAY:** `Ring` `Stage N / 9` and let it advance. `Pull` to the translation line under a bubble. Card: *"Tap, don't hold. It greys out on purpose while it thinks."*
**VO:**
> Marina asks a question and reads it aloud to the patient. You hold the phone to them, tap the microphone once — tap, don't hold — and they answer. Their reply appears in both languages, and Marina moves to the next question. It works through nine stages, building the history a doctor would take. When the mic greys out, it's thinking — just wait.
**Caption:** `9 stages · tap the mic once · wait when it greys`

### 7.3 — Interview → report
**CLIP:** `CAP-interview`, tapping Report (arrow icon).
**OVERLAY:** caption; card warning: *"Finish the report in one sitting — reopening the interview can discard edits."*
**VO:**
> When you're done, tap Report, and the whole interview becomes a medical report, exactly like a recording would. One tip — finish that report in one go before you go back to the interview.
**Caption:** `Interview → Report, in one tap`

### 7.4 — Translator: free conversation
**CLIP:** `CAP-translator`, two colour-coded mics, an exchange, auto-played translation.
**OVERLAY:** `Ring` the blue Patient mic and green Officer mic. Card: *"One mic at a time — wait for the bubble before the other speaks."*
**VO:**
> The Translator is simpler — no questions, just talk. Two microphones, one for each of you. Tap yours, speak, and Marina translates and reads it aloud to the other. Tap theirs, they reply. Only one mic works at a time, so let each line finish before the other person starts.
**Caption:** `Translator: two mics, one at a time`

### 7.5 — Chapter end card
`Next: Chapter 8 — When the link drops`.

---

# CHAPTER 8 — When the Link Drops (1:15)

**Goal:** the most maritime-specific chapter — offline is normal, nothing is lost, and full bars can still mean offline. **Clip:** `CAP-offline`.

### 8.0 — Title card
`8 of 8`.
**VO:**
> You're at sea. The satellite will drop. Marina is built for exactly this, and knowing how it behaves will stop you thinking it's broken.

### 8.1 — Full bars can still be offline
**CLIP:** `CAP-offline`, the red banner appearing while the phone shows wifi.
**OVERLAY:** `Ring` the phone's wifi bars *and* the red banner together. Card: *"Marina checks the real server, not just the wifi. Dead satellite behind a live wifi = this banner."*
**VO:**
> First, this will confuse you if I don't warn you. Your phone can show full wifi bars while Marina says you're offline. That's not a bug. The ship's wifi can be up while the satellite behind it is dead — so Marina checks its own server, not just the wifi symbol. When you see this red banner, believe it, not the bars.
**Caption:** `Full bars ≠ online — trust the banner`

### 8.2 — Nothing is lost
**CLIP:** `CAP-offline`, recording continues, "N parts waiting to send," link returns, counter drains and words appear.
**OVERLAY:** `Ring` the backlog strip; caption its normal threshold; `Ring` the counter draining. Card: *"Keep working. The audio is held on the phone and catches up by itself."*
**VO:**
> And here's why you keep working through it: nothing is lost. Marina keeps recording, holds the audio on the phone, and sends it the moment the link is back. You'll see a small line counting the parts still waiting — that's normal, not a fault. When the satellite returns, it catches up on its own. Don't tap anything — just give it a moment.
**Caption:** `A dropped link costs time, nothing else`

### 8.3 — Recovered after a crash
**CLIP:** `CAP-offline`, the "Recording recovered" boot screen with "Finish report."
**OVERLAY:** `Ring` the headline and the button. Card: *"App closed mid-consultation? It's still here. One tap finishes it."*
**VO:**
> Even if the app closes in the middle of a consultation — the phone dies, iOS shuts it down — it's still there when you reopen. You'll land on this screen: "Recording recovered." One tap on "Finish report," and the case you thought you'd lost becomes your report.
**Caption:** `"Recording recovered" is a rescue, not an error`

### 8.4 — Final card
**OVERLAY:** Marina logo on navy, `marinahealth.eu`, and a compact index of all eight chapters as a menu (so the master film ends on a table of contents).
**VO:**
> That's Marina. Set it up once, talk through your consultations, answer the questions it raises, and send the report ashore. Everything else, it handles.

---

# PRODUCTION NOTES

**Cut order vs. capture order.** Capture in Manifest order (it follows the app's own state, so the simulator rarely has to reset). Cut in chapter order. They differ — e.g. `CAP-chief` and `CAP-score-states` are both Chapter 5 but captured mid-run.

**Never fake app output.** If the real clip didn't produce a result, we don't draw it. The whole reason for this film's approach is that the app is good enough to film honestly. A caption stating a fact ("35 languages") is fine; an overlay drawing a score the judge didn't return is not.

**One voice clip per shot**, named `vo-htu-<ch>-<shot>` (e.g. `vo-htu-3-4`). After `npm run vo`, re-measure and update the per-shot `*_FRAMES` in the chapter's `script.ts`, same drill as the other two films — a shot must outlast its VO or the cross-dissolve clips the narrator.

**Localisation.** The master cut is English-officer. Because the teaching points are in the OVERLAY (captions) and the VO, not baked into the clips, a localised cut re-records VO and swaps caption text without re-shooting a single phone. The one exception is any clip where the *officer's* language shows in-app (hints, interview) — those need a re-capture per language, so keep them short and clearly tagged in the Manifest (`CAP-interview`, `CAP-hint-*`).

**Reusable cutdowns from this same footage:**
- *90s quickstart* — Chapters 2.1, 3.2, 3.4, 6.3 (profile, one tap, Update report, the send rule). The four things that prevent every common failure.
- *45s "it works offline"* — Chapter 8 entire, for the objection "our link is terrible."
- *60s onboarding* — Chapter 1, linked from the activation email.
- In-app help deep-links — each chapter linked from the screen it explains: Chapter 4 from the report's first amber hint, Chapter 8 from the offline banner.

**What this asks of the harness.** Each `CAP-*` is one UI-test `func` producing one clean recording, cut on `VoiceCue.finish()`. That's a restructure of `DemoFilmTests` from one monolithic take into ~18 short, independently-runnable takes — which is also what makes re-shooting one chapter cheap. Build the Manifest top-to-bottom; the patient/vessel state carries between consecutive clips, so most need no reset.

**Still open before capture:** the date-of-birth picker doesn't present its sheet under test (three matchers missed; the probe showed no sheet appears at all on tap). It's on screen in `CAP-chief`/patient shots. Decide whether that's a test-only issue or a real app bug before filming Chapter 5 — see the DOB thread. Everything else in the Manifest is confirmed working on camera.
