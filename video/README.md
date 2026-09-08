# Marina Videos

Two [Remotion](https://remotion.dev) compositions, both content-driven from the
real app flow (see `../HOW_MARINA_WORKS.md` and the SwiftUI app at
`~/XcodeProjects/Marina`), both in the marina-ad visual style.

| composition | what it is | length | output |
|---|---|---|---|
| `MarinaWalkthrough` | the **feature tour** — every mode, sign-in to PDF | ~125 s, 11 scenes | `out/marina-walkthrough.mp4` |
| `MarinaConsultation` | **"One Consultation"** — one patient end to end, with the app animated | ~129 s, 9 scenes | `out/marina-consultation.mp4` |

Voiceover for both: ElevenLabs (George narrator), one clip per scene.

```bash
npm run studio                # preview/scrub either composition
npm run render                # walkthrough
npm run render:consultation   # the consultation film
npm run typecheck
npm run vo                    # regenerate every VO clip
npm run vo vo-nt              # only the consultation clips
```

---

## "One Consultation" (`MarinaConsultation`)

**The difference from the walkthrough:** the walkthrough shows *static
screenshots* of the app. Nothing inside the phone ever moves, so it can only
*tell* you the report builds live. This film **animates the app itself** — fields
type themselves, the waveform reacts, quality scores count up, the amber hint
slides in, and the real capillary-refill demo video plays inside the phone.

It follows one patient: 2/O Reyes (Filipino, speaks Tagalog, no medical training)
handling a Ukrainian oiler with abdominal pain, at 04:10 in the Gulf of Aden.

### Scene order

1. **Cold open** — the blank paper form → the mic. *"You talk."*
2. **Talk** — he dictates in Tagalog, subtitled. Includes the correction beat.
3. **Build** — the report writes itself in clinical English, then auto-fills
   vessel / position / nearest port / ETA.
4. **Ask** — quality scores, and the next-best question in his own language.
5. **Show** — the demo video, inline and fullscreen; plain speech → clinical text.
6. **Voice** — edit any field by mic; Keep / Undo.
7. **Offline** — the satellite drops, the audio is held, the backlog drains.
8. **Send** — three templates, one tap, sent.
9. **End card.**

### Two beats that must not be cut

They carry the film's whole argument, and both are real product behaviour:

- **Scene 2** — "he vomited twice… no, three times" and the field visibly
  changes. That's the extraction prompt's rule 7 (the final restatement of a
  value wins), and it proves "say it in any order" better than the narration.
- **Scene 5** — he says *"two seconds, the colour came back"* and the field
  writes **"Capillary refill normal (approximately 2 seconds)."** That is
  "you speak plainly, Marina writes medically" in one cut.

Also: **never dub the officer.** Tagalog with English subtitles *is* the
argument. Dub him and the strongest thirty seconds are gone.

### Structure

```
remotion/consultation/
  script.ts                 scene lengths, narration, and ALL demo data + beat timing
  motion.ts                 typed(), flash(), countTo(), micLevel(), window_()
  components/Stage.tsx      the layout: phone left + timed Callout column
  components/atoms.tsx      Waveform, LiveField, ScoreBadge, HintBox, TapDot, …
  scenes.tsx                the nine scenes
  MarinaConsultation.tsx    sequencing + cross-dissolves + voiceover
```

Everything timed lives in `script.ts` — scene lengths, transcript beats, when
each field fills. Retime the film from that one file.

### Retiming after a narration edit

Scene length must exceed `from` + clip length + a tail, or the cross-dissolve
cuts the narrator off mid-word. After `npm run vo`:

```bash
cd public/audio && for f in vo-nt-*.mp3; do \
  printf "%-22s %4.0f frames\n" "$f" \
  "$(echo "$(ffprobe -v error -show_entries format=duration -of csv=p=0 $f)*30" | bc)"; done
```

then update the `*_FRAMES` constants in `script.ts`.

### The demo video is the real one

`public/videos/capillary-refill.mp4` is `video-6.mp4` from the API's own
`public/videos/` — the clip `examVideos.ts` maps to `Capillary Refill test::1`.
It plays in the phone via `<OffthreadVideo>`. To swap in another, copy it from
`../public/videos/` and change `VIDEO` in `scenes.tsx`.

---

## The feature tour (`MarinaWalkthrough`)

- **Format:** 1920×1080, 30 fps, ~125 s (11 scenes)
- **Output:** `out/marina-walkthrough.mp4`

## The tour (scene order)

1. **Intro** — what Marina is (telemedicine for ships)
2. **Getting started** — sign in / email verify / activation (LoginScreen)
3. **Note Taker** — live dictation → report builds on screen
4. **Your profile** — vessel details pre-fill every report + GPS / nearest port
5. **AI Interview** — pick patient + officer languages
6. **AI Interview** — the 9-stage bilingual interview, questions read aloud
7. **Translator** — two-way spoken translation
8. **Medical Report** — the 5 category tabs, editable fields
9. **Improve & templates** — AI follow-ups (+ demo videos), Marina / Denmark PDF
10. **Export** — Email / Download the finished clinical PDF
11. **Outro** — brand end card + marinahealth.eu

## Commands

```bash
npm install          # first time only
npm run studio       # open Remotion Studio to preview/scrub
npm run render       # render out/marina-walkthrough.mp4
npm run still -- --frame=900   # render a single still to out/frame.png
npm run vo           # (re)generate all voiceover clips
npm run vo vo-06     # regenerate only the matching line(s)
```

## Phone screens = real screenshots

Each phone in the tour is a **real screenshot of the running iOS app**, captured
from the booted simulator and shown full-bleed inside a device bezel
(`components/DeviceShot.tsx`). They live in `public/shots/*.png` and already
contain the real status bar, dynamic island, nav title and tab bar — so the
phones are literally the app, not mockups.

To re-capture a screen: navigate to it in the booted simulator, then

```bash
xcrun simctl io booted screenshot public/shots/<name>.png
```

Shots used: `01-login`, `03-note` (recording), `profile`, `interview-setup`,
`interview-chat`, `translator`, `report`, `improve`, `pdf`. Wire a shot to a
scene via the `shot=` prop in `scenes/steps.tsx`. Captures are iPhone 17 Pro
(1206×2622); `DeviceShot` assumes that ratio.

The `remotion/screens/*.tsx` files are the earlier hand-built mockups — no longer
used (kept only as a fallback via `StepScene`'s `screen=` prop).

## Structure

```
remotion/
  theme.ts              design tokens, scene frame counts, narration + demo data
  MarinaWalkthrough.tsx master composition: sequencing + cross-dissolves + audio
  Root.tsx / index.ts   Remotion registration + entry point
  components/            anim helpers, DeviceShot (real screenshot), PhoneFrame, Caption, Logo
  screens/              (unused) earlier hand-built mockups
  scenes/               StepScene layout + per-step scenes, Intro, Outro
scripts/gen-vo.mjs      ElevenLabs voiceover generation
public/
  marina-logo.png       the real app logo asset
  shots/                real simulator screenshots (the phone screens)
  audio/                generated voiceover mp3s (committed)
```

## Voiceover

`scripts/gen-vo.mjs` reads `ELEVENLABS_API_KEY` (and optional
`ELEVENLABS_BASE_URL`) from the parent `marina-api/.env`. The narration text
lives in the script; each clip's `name` must match the `VO[]` entries in
`remotion/theme.ts` — that naming is the contract linking script → composition.
To change the voice: `VOICE_ID=<id> npm run vo`.

If you edit narration, the clip lengths change — re-check each scene's
`*_FRAMES` constant in `theme.ts` so the scene still covers its voiceover.
