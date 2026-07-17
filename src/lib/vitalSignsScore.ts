// ---------------------------------------------------------------------------
// vitalSignsScore.ts — grade a report's Vital Signs section (0–100).
//
// Unlike the other judges this one needs NO LLM: vitals are structured fields,
// so "documented or not" is deterministic. The six gradable vitals line up with
// the "Vital signs" pseudo-examination's questions Q1–Q6 (see examVideos.ts), so
// the suggestion for the top missing vital can carry that question's demo video —
// exactly like the physical-examination judge, but computed in code.
//
//   Q1 Temperature     → video-5     Q4 Blood pressure  → video-3
//   Q2 Respiratory rate→ video-2     Q5 Oxygen sat (SpO2)→ video-1
//   Q3 Pulse           → video-4     Q6 AVPU            → (no video)
// ---------------------------------------------------------------------------
import { getExamVideoUrl } from './examVideos.js';

const EXAM_NAME = 'Vital signs';

export interface VitalSignsInput {
  temperatureCelsius?: string | null;
  respiratoryRate?: string | null;
  pulse?: string | null;
  systolic?: string | null;   // blood pressure is "present" once systolic is recorded
  spo2?: string | null;
  avpu?: string | null;
}

export interface VitalFacet {
  vital: string;
  present: boolean;
}

export interface VitalSignsResult {
  scorable: boolean;
  score: number | null;
  facets: VitalFacet[] | null;
  suggestion: string | null;
  videoUrl?: string;
}

// The six gradable vitals, in the order the suggestion walks when picking the
// top missing one. questionNumber ties each to its "Vital signs" demo video.
const VITALS: Array<{
  key: keyof VitalSignsInput;
  vital: string;
  questionNumber: number;
  suggestion: string;
}> = [
  { key: 'temperatureCelsius', vital: 'Temperature', questionNumber: 1, suggestion: "What is the patient's temperature?" },
  { key: 'respiratoryRate', vital: 'Respiratory rate', questionNumber: 2, suggestion: 'How many breaths does the patient take in one minute?' },
  { key: 'pulse', vital: 'Pulse', questionNumber: 3, suggestion: "What is the patient's pulse in beats per minute?" },
  { key: 'systolic', vital: 'Blood pressure', questionNumber: 4, suggestion: "What is the patient's blood pressure?" },
  { key: 'spo2', vital: 'Oxygen saturation', questionNumber: 5, suggestion: "What is the patient's oxygen level (SpO2) as a percentage?" },
  { key: 'avpu', vital: 'Level of consciousness (AVPU)', questionNumber: 6, suggestion: 'Is the patient fully awake, or do they only respond to voice, to pain, or not at all?' },
];

/** A value counts as "recorded" when it is a non-empty, non-placeholder string. */
function isPresent(v: string | null | undefined): boolean {
  if (v === null || v === undefined) return false;
  const t = String(v).trim().toLowerCase();
  return t.length > 0 && t !== 'n/a' && t !== '—' && t !== '-' && t !== 'not assessed';
}

export function scoreVitalSigns(input: VitalSignsInput): VitalSignsResult {
  const facets: VitalFacet[] = VITALS.map((v) => ({ vital: v.vital, present: isPresent(input[v.key]) }));
  const present = facets.filter((f) => f.present).length;
  const score = Math.round((present / VITALS.length) * 100);

  // Suggest the first missing vital in priority order; attach its demo video.
  const missing = VITALS.find((v) => !isPresent(input[v.key]));
  const suggestion = score >= 100 ? null : (missing ? missing.suggestion : null);
  const videoUrl = missing ? getExamVideoUrl(EXAM_NAME, missing.questionNumber) : undefined;

  return {
    scorable: true,
    score,
    facets,
    suggestion,
    videoUrl: suggestion ? videoUrl : undefined,
  };
}
