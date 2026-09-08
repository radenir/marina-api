# Marina — "One Consultation" instructional film

**Runtime:** ~2:50 · **Format:** 1920×1080, 30fps · **Companion to** `marina-walkthrough.mp4`

Where the walkthrough tours every feature, this film follows **one patient end to
end** through the fastest path: *talk → report writes itself → answer what's
missing → send*. One officer, one patient, one PDF.

---

## The setup

**Vessel:** MV Northern Star, bulk carrier, Gulf of Aden, 04:10 UTC
**Officer:** 2/O Reyes — Filipino, speaks Tagalog, no medical training
**Patient:** Mykola, oiler, Ukrainian — woke with abdominal pain and vomiting

Why this framing works: nobody in the shot speaks English natively, nobody is a
doctor, and it's the middle of the night. That is the real situation, and it is
exactly the situation the product is built for.

---

## Scene list

| # | Scene | Runtime | The argument |
|---|-------|---------|--------------|
| 1 | Cold open — the blank form | 0:00–0:18 | The problem |
| 2 | Just talk | 0:18–0:50 | Mother tongue, no typing, no order |
| 3 | The report builds itself | 0:50–1:12 | Live extraction + auto-fill |
| 4 | Marina asks the next question | 1:12–1:40 | You don't need to know what to ask |
| 5 | And shows you how | 1:40–2:04 | Demo videos |
| 6 | Fix it by voice | 2:04–2:20 | Voice editing, undo |
| 7 | The link drops | 2:20–2:34 | Nothing is lost |
| 8 | Send it | 2:34–2:50 | Three forms, one tap |
| 9 | End card | 2:50–2:58 | Brand |

---

## SCENE 1 — Cold open: the blank form (0:00–0:18)

**Visual:** Night bridge. A paper Radio Medical form on a chart table under a
red lamp, pen resting on it, all fields empty. Slow push in. Cut to a phone
running Marina, Note Taker idle, the big record button.

**VO:**
> Three in the morning. A crew member is sick, you're not a doctor, and the form
> in front of you is in a language that isn't yours.
>
> With Marina, you don't fill it in. You just talk.

**Caption:** `You talk. Marina writes.`

---

## SCENE 2 — Just talk (0:18–0:50)

**Visual:** Officer taps record. Waveform moves. He speaks **in Tagalog** —
subtitled in English, not dubbed. Let it be messy and out of order on purpose:
he gives the complaint, backtracks to the age, corrects a number.

**Dialogue (subtitled):**
> "Mykola, the oiler — thirty-four years old. He woke up around two with pain in
> the belly, lower right side. He vomited twice… no, three times. No fever that
> I could feel. He has no allergies. Nothing for the pain except paracetamol
> last night."

**VO:**
> Speak in your own language. Marina listens in thirty-five of them, and works
> out which one you're speaking on its own.
>
> Say it in whatever order it comes to you. Correct yourself halfway through —
> Marina takes the correction, not the mistake. There's no form to navigate and
> nothing to type.

**Captions:** `35 languages` · `No typing` · `Any order — corrections win`

**Code note for the animator:** the "three times" correction overwriting "twice"
is real behaviour (`medicalExtractV2.ts` extraction rule 7 — the final
restatement of a value wins). Show the field text visibly change from *twice*
to *three times* as he says it. That single beat sells the argument better than
the VO does.

---

## SCENE 3 — The report builds itself (0:50–1:12)

**Visual:** Split screen. Left: the waveform still running. Right: the live
report, fields filling one after another as he speaks — Chief Complaint snaps
to *Abdominal Pain*; Problem Description writes itself **in clean clinical
English**; Age, Allergies, Current Medications fill.

Then, with nobody saying anything, a second wave of fields fills: Ship Name,
Call Sign, Medicine Chest, Position, Nearest Port, ETA.

**VO:**
> While you're still speaking, the report is already being written — in English,
> in proper clinical language, with the grammar taken care of. You never have to
> think about how to phrase it.
>
> And the parts you'd never say out loud, Marina fills in for you: your vessel
> details, your position, the nearest port — and how long it would take you to
> reach it at your cruising speed.

**Captions:** `Written in clinical English` · `Vessel, position and ETA — filled automatically`

---

## SCENE 4 — Marina asks the next question (1:12–1:40)

**Visual:** He taps Finish. The report opens on the **Findings** tab. Quality
badges are visible per field — Problem 78%, Vital Signs 0%. An amber hint box
slides in under Vital Signs, with a lightbulb icon.

The hint reads **in Tagalog**, and a speaker icon plays it aloud.

> *"Measure the patient's body temperature using a thermometer. What is the
> reading?"*

**VO:**
> Now Marina tells you what's missing — and what to ask next.
>
> Every part of the report is checked against the medical protocol for this exact
> complaint. Forty-four complaints, each with its own list of what a doctor
> ashore will want to know. Marina picks the single most useful question you
> haven't answered yet, and asks it in your language.
>
> You don't need to know what to ask. You only need to answer.

**Captions:** `Checked against the protocol for this complaint` · `The next best question, in your language`

**Code note:** the vitals judge is deterministic — it walks Temperature, Resp
rate, Pulse, BP, SpO₂, AVPU in that order and names the first one missing
(`vitalSignsScore.ts:40`). So Temperature genuinely is the first hint on an
empty vitals section. Use the real one.

---

## SCENE 5 — And shows you how (1:40–2:04)

**Visual:** He advances through vitals. On the **capillary refill** question,
the amber box now contains a **video playing inside it**. He taps — it goes
fullscreen: the real demo clip of pressing a fingernail and counting.

He watches, does it on Mykola's hand, and answers out loud: *"Two seconds, the
colour came back."*

Cut: the Physical Examination field fills with **"Capillary refill normal
(approximately 2 seconds)."**

**VO:**
> And when the question needs you to actually do something, Marina shows you how.
>
> Twenty-five demonstration videos, each attached to the exact question that
> needs it. Watch it, do it, say what you saw. Marina writes it down properly.

**Captions:** `25 demo videos` · `Watch it. Do it. Say it.`

**Code note:** the *"colour came back after two seconds" → "Capillary refill
normal (about 2 seconds)"* transformation is a real documented behaviour of the
pathway-aware extraction. It is the single clearest illustration of "you speak
plainly, Marina writes medically." Do not cut this beat.

---

## SCENE 6 — Fix it by voice (2:04–2:20)

**Visual:** He notices Allergies says *"No known allergies."* He taps the small
mic beside that field and says, in Tagalog: *"Actually he told me shellfish give
him a rash."*

The field rewrites itself in front of him. A small **Keep / Undo** bar appears
underneath, and above it a line showing what Marina heard.

**VO:**
> Changed your mind? Remembered something? Tap the mic on any field and say it.
>
> Marina shows you what it heard, and the change stays undoable — because this
> becomes a medical record.
>
> The vital signs work the same way. Read all seven off your instruments in one
> breath, and they land in the right boxes.

**Captions:** `Edit any field by voice` · `Always reversible`

---

## SCENE 7 — The link drops (2:20–2:34)

**Visual:** The satellite bar drops to nothing. An offline banner appears. He
keeps talking — the waveform keeps moving. A small line reads *"3 parts waiting
to be transcribed."* The bar comes back; the counter drains to zero and the
missing words appear in the report.

**VO:**
> And when the satellite drops — because it will — nothing is lost. Marina keeps
> recording, holds the audio on the phone, and catches up the moment the link
> returns.
>
> Even if the app is closed, the consultation is still there when you come back.

**Caption:** `A dropped link costs you time. Nothing else.`

---

## SCENE 8 — Send it (2:34–2:50)

**Visual:** Every quality badge is now green. He opens the Template picker:
**Marina · Danish Radio Medical · German TMAS**. He picks Danish RM. Taps
**Email PDF**. Confirmation.

Cut to a lit office ashore — a doctor opening the attachment. It's a complete,
clean, English clinical report with an M-EWS score at the top.

**VO:**
> One dictation, three official forms — the Marina report, the Danish Radio
> Medical form, the German TMAS form. Choose one, and download it or send it
> straight to the doctor.
>
> Nothing leaves the ship until you decide to send it.

**Captions:** `3 official forms · one dictation` · `Download or email` · `Nothing leaves the ship until you send it`

---

## SCENE 9 — End card (2:50–2:58)

**Visual:** Marina logo on navy. `marinahealth.eu`

**VO:**
> Marina. You talk. We write the report.

---

## Production notes

**Do not dub the officer.** Him speaking Tagalog with English subtitles *is* the
argument. The moment you dub him into English you've thrown away the film's
strongest thirty seconds.

**Use real screenshots, not mockups.** The existing walkthrough already
established this (`README.md` — `xcrun simctl io booted screenshot`). Shots
needed for this film:

| shot | screen |
|---|---|
| `nt-idle` | Note Taker, idle |
| `nt-recording` | recording, waveform live, live report filling |
| `nt-live-filled` | live report with vessel/position/ETA populated |
| `rp-findings-hint` | Findings tab, amber vitals hint in Tagalog |
| `rp-video-inline` | amber hint with demo video embedded |
| `rp-video-full` | fullscreen demo video |
| `rp-voice-edit` | mic active on Allergies + Keep/Undo bar |
| `rp-offline` | offline banner + pending-parts counter |
| `rp-template` | template picker open |
| `rp-sent` | email-sent confirmation |

**Three numbers worth putting on screen as text:** 35 languages · 44 complaint
protocols · 25 demo videos. They are all verifiable in the codebase and they
each answer a different objection.

**Reusable cutdowns from this same shoot:**
- *0:35 social* — Scenes 2 + 3 + 8 only ("talk, it writes, send")
- *0:20 objection-killer* — Scene 7 alone, for anyone who says "our link is bad"
- *0:45 training clip* — Scenes 4 + 5, for onboarding officers
