// ---------------------------------------------------------------------------
// script.ts — timing, narration and demo data for "One Consultation", the
// step-by-step film that follows a single patient from the first spoken word to
// the PDF landing on a doctor's desk.
//
// Same convention as ../theme.ts: copy and structured demo data live here, never
// hardcoded inside a scene. Timing lives here too, because every scene's beats
// (when a field fills, when the hint appears) are indexed off the scene length —
// so the whole film retimes from this one file.
// ---------------------------------------------------------------------------

// ---- Scene lengths (frames @ 30fps) ----------------------------------------
// Each is sized to its voiceover clip plus a short tail: `from` offset (below)
// + measured clip length + ~20 frames. Re-measure with
//   ffprobe -v error -show_entries format=duration -of csv=p=0 <clip>
// after any narration edit, and retime here — the scene must outlast its clip or
// the cross-dissolve cuts the narrator off mid-word.
export const OPEN_FRAMES = 410; // vo 12.40s
export const TALK_FRAMES = 480; // vo 14.77s
export const BUILD_FRAMES = 565; // vo 17.69s
export const ASK_FRAMES = 560; // vo 17.55s
export const SHOW_FRAMES = 525; // vo 16.35s
export const VOICE_FRAMES = 335; // vo  9.98s
export const OFFLINE_FRAMES = 340; // vo 10.12s
export const SEND_FRAMES = 495; // vo 15.33s
export const END_FRAMES = 170; // vo  3.25s

export const CONSULTATION_FRAMES =
  OPEN_FRAMES +
  TALK_FRAMES +
  BUILD_FRAMES +
  ASK_FRAMES +
  SHOW_FRAMES +
  VOICE_FRAMES +
  OFFLINE_FRAMES +
  SEND_FRAMES +
  END_FRAMES; // 3020 frames ≈ 101s

export const FADE = 16;

// ---------------------------------------------------------------------------
// The consultation being dramatised.
//
// MV Northern Star, Gulf of Aden, 04:10 UTC. 2/O Reyes — Filipino, speaks
// Tagalog, no medical training — is handling Mykola, a Ukrainian oiler with
// abdominal pain. Nobody in the shot is a doctor and nobody speaks English
// natively, which is the situation the product exists for.
// ---------------------------------------------------------------------------

/// What the officer dictates, in Tagalog, with the English subtitle shown under
/// it. Split into beats so the transcript can type itself one beat at a time and
/// the report can fill in step with the words that caused it.
export interface TranscriptBeat {
  /// Frame (relative to the Talk scene) where this beat starts typing.
  at: number;
  /// Frames spent typing it.
  dur: number;
  tl: string;
  en: string;
}

export const TRANSCRIPT: TranscriptBeat[] = [
  {
    at: 34,
    dur: 70,
    tl: 'Si Mykola, ang oiler — tatlumpu’t apat na taong gulang.',
    en: 'Mykola, the oiler — thirty-four years old.',
  },
  {
    at: 118,
    dur: 90,
    tl: 'Nagising siya mga alas-dos, masakit ang tiyan, sa baba sa kanan.',
    en: 'He woke around two with belly pain, lower right side.',
  },
  {
    at: 222,
    dur: 54,
    tl: 'Sumuka siya ng dalawang beses…',
    en: 'He vomited twice…',
  },
  // The correction. This is real behaviour — the extraction prompt's rule 7 says
  // the final restatement of a value wins — and watching the field change from
  // "twice" to "three times" argues "say it in any order" better than the
  // narration does. Do not cut this beat.
  {
    at: 288,
    dur: 46,
    tl: 'hindi, tatlong beses.',
    en: 'no, three times.',
  },
  {
    at: 348,
    dur: 78,
    tl: 'Walang allergy. Paracetamol lang kagabi.',
    en: 'No allergies. Only paracetamol last night.',
  },
];

/// The live report filling as he speaks. `at` is the frame within the Build
/// scene; `source` marks where the value came from, which is the whole point of
/// the second group — nobody dictates their own call sign.
export interface LiveFieldSpec {
  label: string;
  value: string;
  at: number;
  source: 'spoken' | 'auto';
  multiline?: boolean;
}

export const LIVE_FIELDS: LiveFieldSpec[] = [
  { label: 'Chief Complaint', value: 'Abdominal Pain', at: 24, source: 'spoken' },
  {
    label: 'Problem Description',
    value:
      '34-year-old male oiler woke at approximately 02:00 with right lower quadrant abdominal pain. Three episodes of vomiting since onset.',
    at: 62,
    source: 'spoken',
    multiline: true,
  },
  { label: 'Allergies', value: 'No known allergies', at: 150, source: 'spoken' },
  { label: 'Current Medications', value: 'Paracetamol (last dose previous night)', at: 186, source: 'spoken' },
  // The auto-filled wave — profile prefill + GPS + port lookup + ETA at the
  // vessel's cruise speed. None of it was spoken. Starts after AUTO_DIVIDER_AT.
  { label: 'Ship Name', value: 'MV Northern Star', at: 272, source: 'auto' },
  { label: 'Call Sign', value: '9HA4721', at: 292, source: 'auto' },
  { label: 'Medicine Chest', value: 'Category A', at: 312, source: 'auto' },
  { label: 'Position', value: '12.84213, 45.03187', at: 336, source: 'auto' },
  { label: 'Nearest Port', value: 'ADADE — Aden', at: 360, source: 'auto' },
  { label: 'ETA — Nearest Port', value: '9 h 40 min at 14 kn', at: 384, source: 'auto' },
];

/// When the "filled automatically" divider appears, and the window over which
/// the list scrolls to keep the newest field in view.
export const AUTO_DIVIDER_AT = 262;
export const AUTO_SCROLL = [270, 340] as const;

/// Findings tab — the vitals grid, empty at first, and the per-field quality
/// scores. The vitals judge is deterministic and walks Temperature, Resp rate,
/// Pulse, BP, SpO2, AVPU in that order naming the first one missing
/// (vitalSignsScore.ts:40) — so Temperature genuinely is the first hint on an
/// empty section. These are the real ones.
export const VITAL_CELLS = [
  { label: 'Pulse', unit: 'bpm', value: '96' },
  { label: 'Systolic', unit: 'mmHg', value: '132' },
  { label: 'Diastolic', unit: 'mmHg', value: '84' },
  { label: 'Resp. Rate', unit: '/min', value: '20' },
  { label: 'O₂ Sat.', unit: '%', value: '97' },
  { label: 'Temp.', unit: '°C', value: '37.8' },
];

/// The graded sections listed above the vitals grid. Vital Signs is deliberately
/// NOT here — it carries its own scored header right below, and listing it twice
/// reads as a bug.
export const SCORES = [
  { label: 'Problem Description', value: 78 },
  { label: 'Medical History', value: 90 },
  { label: 'Investigations', value: 45 },
];

/// The coaching hint, as the officer sees it: his own language first, the
/// English original is not shown in the app at all.
export const HINT_VITALS = {
  tl: 'Sukatin ang temperatura ng pasyente gamit ang termometro. Ano ang nabasa?',
  en: 'Measure the patient’s body temperature using a thermometer. What is the reading?',
};

export const HINT_EXAM = {
  tl: 'Pindutin ang kuko ng pasyente hanggang mamuti, bitawan, at bilangin kung ilang segundo bago bumalik ang kulay.',
  en: 'Press the patient’s fingernail until it blanches, release, and count the seconds until colour returns.',
};

/// The line that carries the entire "you speak plainly, Marina writes medically"
/// thesis in one cut: what he says, and what lands in the report.
export const EXAM_SPOKEN = 'Dalawang segundo, bumalik agad ang kulay.';
export const EXAM_SPOKEN_EN = 'Two seconds, the colour came straight back.';
/// What the field already held before he answered — so the new sentence is seen
/// being *appended* to a real examination, not filling a placeholder.
export const EXAM_EXISTING = 'Abdomen soft, tender right lower quadrant.';
export const EXAM_WRITTEN = 'Capillary refill normal (approximately 2 seconds).';

/// Voice edit on the Allergies field.
export const EDIT_BEFORE = 'No known allergies';
export const EDIT_HEARD = 'Actually, sabi niya nagkaka-rashes siya sa hipon.';
export const EDIT_HEARD_EN = 'Actually, he said shellfish give him a rash.';
export const EDIT_AFTER = 'Shellfish — reports rash on exposure. No other known allergies.';

/// The three official forms one dictation can be printed onto.
export const TEMPLATES = [
  { key: 'marina', label: 'Marina Report', sub: 'Seafarer medical report' },
  { key: 'rmd', label: 'Danish Radio Medical', sub: 'RMD maritime form' },
  { key: 'german', label: 'German TMAS', sub: 'Medico Cuxhaven' },
];

/// Numbers worth putting on screen. Each answers a different objection, and
/// each is verifiable in the codebase.
export const PROOF = [
  { n: '35', label: 'languages' },
  { n: '44', label: 'complaint protocols' },
  { n: '25', label: 'demo videos' },
];

// ---------------------------------------------------------------------------
// Narration — one clip per scene. `name` is the mp3 filename written by
// scripts/gen-vo.mjs AND the src referenced in the composition. `from` is an
// offset in frames from the scene start, hand-tuned for sync.
// ---------------------------------------------------------------------------
export interface VoLine {
  name: string;
  scene: string;
  from: number;
  text: string;
}

export const VO: VoLine[] = [
  {
    name: 'vo-nt-01-open',
    scene: 'open',
    from: 16,
    text: 'Three in the morning. A crew member is sick, you are not a doctor, <break time="0.3s" /> and the form in front of you is in a language that is not yours. With Marina, you do not fill it in. <break time="0.35s" /> You talk.',
  },
  {
    name: 'vo-nt-02-talk',
    scene: 'talk',
    from: 12,
    text: 'Speak in your own language — Marina listens in thirty-five of them, and works out which one you are speaking on its own. <break time="0.35s" /> Say things in whatever order they come to you. Correct yourself halfway through, and Marina takes the correction, not the mistake.',
  },
  {
    name: 'vo-nt-03-build',
    scene: 'build',
    from: 10,
    text: 'While you are still speaking, the report is already being written — in clean clinical English, with the grammar taken care of. <break time="0.35s" /> And the parts you would never say out loud, Marina fills in for you: your vessel, your position, the nearest port, and how long it would take you to reach it.',
  },
  {
    name: 'vo-nt-04-ask',
    scene: 'ask',
    from: 10,
    text: 'Then Marina tells you what is missing. <break time="0.3s" /> Every field is checked against the medical protocol for this exact complaint — forty-four of them, each with its own list of what a doctor ashore will want to know. <break time="0.3s" /> Marina asks the single most useful question you have not answered yet, in your language.',
  },
  {
    name: 'vo-nt-05-show',
    scene: 'show',
    from: 10,
    text: 'And when a question needs you to actually do something, Marina shows you how. <break time="0.35s" /> Twenty-five demonstration videos, each attached to the exact question that needs it. Watch it, do it, and say what you saw — Marina writes it down properly.',
  },
  {
    name: 'vo-nt-06-voice',
    scene: 'voice',
    from: 10,
    text: 'Remembered something? <break time="0.3s" /> Tap the microphone on any field and say it. Marina shows you what it heard, and every change stays undoable — because this becomes a medical record.',
  },
  {
    name: 'vo-nt-07-offline',
    scene: 'offline',
    from: 10,
    text: 'And when the satellite drops — because it will — nothing is lost. <break time="0.3s" /> Marina keeps recording, holds the audio on the phone, and catches up the moment the link returns.',
  },
  {
    name: 'vo-nt-08-send',
    scene: 'send',
    from: 10,
    text: 'One dictation, three official forms — Marina’s own, the Danish Radio Medical form, and the German T-MAS form. <break time="0.3s" /> Choose one, then download it, or send it straight to the doctor. <break time="0.3s" /> Nothing leaves the ship until you decide to send it.',
  },
  {
    name: 'vo-nt-09-end',
    scene: 'end',
    from: 12,
    text: 'Marina. <break time="0.3s" /> You talk. We write the report.',
  },
];
