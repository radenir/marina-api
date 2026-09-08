// ---------------------------------------------------------------------------
// theme.ts — design tokens, scene timing, narration script, and demo data for
// the Marina walkthrough video. Following the marina-ad convention, copy and
// structured demo data live here, not hardcoded inside scenes.
// ---------------------------------------------------------------------------

// Composition config -- 16:9 landscape, matching the marina-ad.
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

// ---- Brand palette (identical to the app + PDF report: #0a4b78 navy) ----
export const NAVY = '#0a4b78';
export const NAVY_700 = '#08395d';
export const NAVY_LIGHT = '#0d6eaf';
export const ACCENT = '#1d6fa5';
export const TINT = '#eef4f9';
export const TINT_LINE = '#d6e3ee';
export const INK = '#0f172a';
export const MUTED = '#64748b';
export const BORDER = '#d8e0ea';
export const FIELD = '#f7fafc';
export const GREEN = '#22c55e';
export const AMBER = '#f59e0b';
export const RED = '#ef4444';
export const PATIENT_BLUE = '#2563eb';
export const OFFICER_GREEN = '#059669';

export const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// Light app-style scene background.
export const SCENE_BG = `linear-gradient(165deg, #f3f8fc 0%, #dce9f5 100%)`;
export const NAVY_BG = `linear-gradient(150deg, ${NAVY} 0%, ${NAVY_LIGHT} 100%)`;

// ---------------------------------------------------------------------------
// Scene lengths (frames @ 30fps). Each scene owns one step of the tour and is
// sized to fit its voiceover (from offset + clip duration + a short tail).
// ---------------------------------------------------------------------------
export const INTRO_FRAMES = 430; // vo 13.0s
export const START_FRAMES = 275; // vo  8.0s
export const NOTE_FRAMES = 375; // vo 11.4s
export const LOCATION_FRAMES = 345; // vo 10.4s
export const SETUP_FRAMES = 305; // vo  9.1s
export const STAGES_FRAMES = 495; // vo 15.5s
export const TRANSLATOR_FRAMES = 320; // vo  9.6s
export const REPORT_FRAMES = 385; // vo 11.7s
export const IMPROVE_FRAMES = 385; // vo 11.7s
export const PDF_FRAMES = 285; // vo  8.4s
export const OUTRO_FRAMES = 165; // vo  4.0s

export const TOTAL_FRAMES =
  INTRO_FRAMES +
  START_FRAMES +
  NOTE_FRAMES +
  LOCATION_FRAMES +
  SETUP_FRAMES +
  STAGES_FRAMES +
  TRANSLATOR_FRAMES +
  REPORT_FRAMES +
  IMPROVE_FRAMES +
  PDF_FRAMES +
  OUTRO_FRAMES; // 3765 frames ≈ 125s

// Cross-dissolve length between scenes.
export const FADE = 16;

// ---------------------------------------------------------------------------
// Narration — one voiceover clip per scene. `name` is the mp3 filename written
// by scripts/gen-vo.mjs AND the src referenced in the composition (the naming
// contract). `text` may embed <break time="0.4s" /> SSML for pacing.
// `from` is an offset (frames, relative to scene start) hand-tuned for sync.
// ---------------------------------------------------------------------------
export interface VoLine {
  name: string;
  scene: string;
  from: number;
  text: string;
}

export const VO: VoLine[] = [
  {
    name: 'vo-01-intro',
    scene: 'intro',
    from: 18,
    text: 'This is Marina — a telemedicine assistant for ships at sea. <break time="0.35s" /> When a crew member falls ill and there is no doctor aboard, Marina helps a non-medical officer document the case and get it to a doctor onshore.',
  },
  {
    name: 'vo-02-start',
    scene: 'start',
    from: 12,
    text: 'You sign in with your Marina account. <break time="0.3s" /> New accounts verify their email and are activated by our team — then you are ready to go.',
  },
  {
    name: 'vo-03-note',
    scene: 'note',
    from: 12,
    text: 'The app opens on the Note Taker. <break time="0.3s" /> Tap record and simply describe the patient. Marina transcribes as you speak and builds a structured medical report live, right on screen.',
  },
  {
    name: 'vo-04-location',
    scene: 'location',
    from: 10,
    text: 'Set your vessel details once in your profile — ship, call sign, medicine chest and company. <break time="0.3s" /> Marina fills them into every report, automatically.',
  },
  {
    name: 'vo-05-setup',
    scene: 'setup',
    from: 12,
    text: 'For a guided assessment, open the A-I Interview. <break time="0.3s" /> Choose the patient’s language and your own — Marina speaks to each of you in your own tongue.',
  },
  {
    name: 'vo-06-stages',
    scene: 'stages',
    from: 10,
    text: 'Marina runs a nine-stage medical interview. <break time="0.3s" /> It asks the patient about their symptom, history, and medications, then hands over to you for vital signs and a physical exam. The patient just speaks — Marina translates and reads every question aloud.',
  },
  {
    name: 'vo-07-translator',
    scene: 'translator',
    from: 12,
    text: 'Need a quick two-way conversation? <break time="0.3s" /> The Translator lets the patient and officer talk naturally. Marina transcribes, translates, and speaks each side out loud.',
  },
  {
    name: 'vo-08-report',
    scene: 'report',
    from: 12,
    text: 'Every mode feeds one medical report. <break time="0.3s" /> Five tabs — patient, problem, examination, treatment, and observations — track exactly what is filled in. Every field is editable.',
  },
  {
    name: 'vo-09-improve',
    scene: 'improve',
    from: 10,
    text: 'Not sure what else to ask? <break time="0.3s" /> Improve Report suggests A-I follow-up questions, some with demonstration videos. Then pick your template — Marina’s own, or the Danish Radio Medical form.',
  },
  {
    name: 'vo-10-pdf',
    scene: 'pdf',
    from: 10,
    text: 'When you are done, download or email the finished P-D-F — a clean clinical report, ready for the doctor onshore.',
  },
  {
    name: 'vo-11-outro',
    scene: 'outro',
    from: 14,
    text: 'Marina. <break time="0.25s" /> Maritime medical reporting, in any language.',
  },
];

// ---------------------------------------------------------------------------
// Demo data used to render faithful in-phone screens.
// ---------------------------------------------------------------------------

// AI Interview — bilingual chat turns (officer language EN, patient language ES).
export const INTERVIEW_TURNS = [
  {
    role: 'assistant' as const,
    stage: 2,
    en: 'When did the chest pain start, and how would you rate it from one to ten?',
    tr: '¿Cuándo comenzó el dolor de pecho y cómo lo calificaría del uno al diez?',
  },
  {
    role: 'user' as const,
    stage: 2,
    en: 'It started about two hours ago. I would say it is an eight.',
    tr: 'Empezó hace unas dos horas. Diría que es un ocho.',
  },
  {
    role: 'assistant' as const,
    stage: 3,
    en: 'Does the pain spread to your arm or jaw? Any shortness of breath?',
    tr: '¿El dolor se extiende al brazo o la mandíbula? ¿Le falta el aire?',
  },
];

// Note Taker — the live report building up as the officer dictates.
export const LIVE_TRANSCRIPT =
  'Male crew member, roughly forty years old, complaining of severe chest pain radiating to the left arm, started two hours ago, also short of breath and sweating…';

// Live report section fill counts (filled / total), color-coded.
export const REPORT_SECTIONS = [
  { label: 'Patient Information', filled: 4, total: 4 },
  { label: 'Problem Description', filled: 2, total: 2 },
  { label: 'Vital Signs', filled: 3, total: 7 },
  { label: 'Medical History', filled: 1, total: 2 },
];

// Medical Report — the 5 category tabs.
export const REPORT_TABS = [
  { key: 'patient', label: 'Patient', icon: 'user' },
  { key: 'problem', label: 'Problem', icon: 'file' },
  { key: 'exam', label: 'Examination', icon: 'stethoscope' },
  { key: 'treatment', label: 'Treatment', icon: 'pill' },
  { key: 'observation', label: 'Observation', icon: 'activity' },
];

// Vital-sign fields shown on the Examination tab.
export const VITALS = [
  { label: 'Pulse', value: '104', unit: 'bpm' },
  { label: 'Systolic BP', value: '148', unit: 'mmHg' },
  { label: 'Diastolic BP', value: '92', unit: 'mmHg' },
  { label: 'Resp. Rate', value: '22', unit: '/min' },
  { label: 'O₂ Sat.', value: '95', unit: '%' },
  { label: 'Temp.', value: '37.1', unit: '°C' },
];

// AI follow-up questions surfaced by Improve Report.
export const FOLLOWUPS = [
  'Is the pain worse on exertion or at rest?',
  'Any history of high blood pressure or heart disease?',
  'Has the patient taken any medication for the pain?',
];

// The four bottom tabs of the app.
export const APP_TABS = [
  { key: 'interview', label: 'AI Interview', icon: 'stethoscope' },
  { key: 'note', label: 'Note Taker', icon: 'mic' },
  { key: 'translator', label: 'Translator', icon: 'messages' },
  { key: 'profile', label: 'Profile', icon: 'user' },
];

// The 9 interview stages (from HOW_MARINA_WORKS.md).
export const STAGES = [
  { n: 1, name: 'Pathway', who: 'Patient' },
  { n: 2, name: 'History Taking', who: 'Patient' },
  { n: 3, name: 'Associated Symptoms', who: 'Patient' },
  { n: 4, name: 'Past Medical History', who: 'Patient' },
  { n: 5, name: 'Medications', who: 'Patient' },
  { n: 6, name: 'Allergies', who: 'Patient' },
  { n: 7, name: 'Vital Signs', who: 'Medical Officer' },
  { n: 8, name: 'Investigations', who: 'Medical Officer' },
  { n: 9, name: 'Physical Exam', who: 'Medical Officer' },
];
