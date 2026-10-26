/**
 * Photo protocols for /ai/exam-media.
 *
 * For each examination: which photos to take, which of the examination's
 * questions each photo answers, the answers a question allows, and how a
 * confirmed answer is written into the report's "exam" field.
 *
 * Question numbers and wording follow examinationInstructions.ts (SYBRA 1.02),
 * so a photo answer and a spoken answer to the same question are the same
 * finding. The sentences are written here in code, not by an LLM, so the same
 * confirmed answer always reads the same in the report.
 */
import { examinationIds, examinationDisplayNames } from './symptomGuidelines';

/** Side as the PATIENT sees it — the patient's right eye is on the left of a frontal photo. */
export type Side = 'left' | 'right' | 'both';

export interface MediaAnswer {
  questionNumber: number;
  value: string;
  side?: Side;
  /** Short free-text detail, e.g. "watery". Never a diagnosis. */
  detail?: string;
}

export interface MediaQuestion {
  questionNumber: number;
  /** The question as the officer would be asked it (examinationInstructions.ts). */
  text: string;
  /** Allowed values. "cannot_determine" is always allowed in addition. */
  options: string[];
  /** Whether a positive answer must say which eye / side. */
  needsSide: boolean;
  /** Extra guidance for the vision model, e.g. what counts as "yes". */
  guidance?: string;
  /** Sentence fragment for the report, or null to leave the answer out. */
  sentence: (a: MediaAnswer) => string | null;
}

export interface MediaShot {
  id: string;
  kind: 'photo';
  /** Shown to the officer on the camera screen. */
  instruction: string;
  flash: boolean;
  /** Question numbers this photo can answer. */
  answers: number[];
}

export interface ExamMediaProtocol {
  examinationId: number;
  name: string;
  shots: MediaShot[];
  questions: Record<number, MediaQuestion>;
}

const sideOf = (a: MediaAnswer, noun: string): string =>
  a.side === 'both' ? `both ${noun}s` : a.side ? `the ${a.side} ${noun}` : `the ${noun}`;

const withDetail = (s: string, a: MediaAnswer): string =>
  a.detail && a.detail.trim() ? `${s} (${a.detail.trim()})` : s;

const EYE_EXAM: ExamMediaProtocol = {
  examinationId: examinationIds.EYE_EXAM,
  name: examinationDisplayNames[examinationIds.EYE_EXAM],
  shots: [
    {
      id: 'eyes-front',
      kind: 'photo',
      instruction:
        'Photograph both eyes, straight on, from about 30 cm, in good normal light. ' +
        'Do not use the flash. Ask the patient to look into the camera with eyes wide open.',
      flash: false,
      answers: [1, 2, 3, 4, 5],
    },
  ],
  questions: {
    1: {
      questionNumber: 1,
      text: 'Is there redness around the iris, which is the colored part of the eye?',
      options: ['yes', 'no'],
      needsSide: true,
      guidance: 'A red or pink ring directly bordering the iris (ciliary flush). Diffuse redness of the white only is question 2, not this one.',
      sentence: (a) => a.value === 'yes'
        ? withDetail(`redness around the iris of ${sideOf(a, 'eye')}`, a)
        : 'no redness around the iris',
    },
    2: {
      questionNumber: 2,
      text: 'Is there redness around the white part?',
      options: ['yes', 'no'],
      needsSide: true,
      guidance: 'Visible redness or enlarged red vessels in the white of the eye (sclera / conjunctiva).',
      sentence: (a) => a.value === 'yes'
        ? withDetail(`redness of the white of ${sideOf(a, 'eye')}`, a)
        : 'whites of the eyes not red',
    },
    3: {
      questionNumber: 3,
      text: 'Is there secretion or fluid, and if yes which color?',
      options: ['none', 'clear', 'white', 'yellow', 'green'],
      needsSide: true,
      guidance: 'Discharge, crusting or pus at the lid margins or in the corners of the eye. Tears pooling without discharge count as "clear".',
      sentence: (a) => a.value === 'none'
        ? 'no discharge'
        : withDetail(`${a.value} discharge from ${sideOf(a, 'eye')}`, a),
    },
    4: {
      questionNumber: 4,
      text: 'Are the pupils round?',
      options: ['yes', 'no'],
      needsSide: false,
      sentence: (a) => a.value === 'yes'
        ? 'pupils round'
        : withDetail(a.side ? `pupil of ${sideOf(a, 'eye')} not round` : 'pupils not round', a),
    },
    5: {
      questionNumber: 5,
      text: 'Are the pupils the same size?',
      options: ['yes', 'no'],
      needsSide: false,
      guidance: 'Compare both pupils. Answer "no" only for a clearly visible difference. If "no", give in detail which pupil is larger.',
      sentence: (a) => a.value === 'yes' ? 'pupils equal in size' : withDetail('pupils unequal in size', a),
    },
  },
};

export const EXAM_MEDIA_PROTOCOLS: Record<number, ExamMediaProtocol> = {
  [EYE_EXAM.examinationId]: EYE_EXAM,
};

export function getProtocol(examinationId: number): ExamMediaProtocol | undefined {
  return EXAM_MEDIA_PROTOCOLS[examinationId];
}

export function getShot(protocol: ExamMediaProtocol, shotId: string): MediaShot | undefined {
  return protocol.shots.find((s) => s.id === shotId);
}

/** True when the answer is one the question allows (cannot_determine is handled by the caller). */
export function isValidAnswer(protocol: ExamMediaProtocol, a: MediaAnswer): boolean {
  const q = protocol.questions[a.questionNumber];
  if (!q || !q.options.includes(a.value)) return false;
  if (a.side !== undefined && !['left', 'right', 'both'].includes(a.side)) return false;
  return true;
}

/**
 * The report text for one examination's confirmed photo answers, e.g.
 * "Eye examination (photo, confirmed by officer): redness of the white of the right eye; no discharge; pupils round."
 * Returns '' when there is nothing to report.
 */
export function renderExamSentence(examinationId: number, answers: MediaAnswer[]): string {
  const protocol = getProtocol(examinationId);
  if (!protocol) return '';
  const parts = [...answers]
    .sort((x, y) => x.questionNumber - y.questionNumber)
    .map((a) => protocol.questions[a.questionNumber]?.sentence(a) ?? null)
    .filter((s): s is string => !!s);
  if (!parts.length) return '';
  return `${protocol.name} (photo, confirmed by officer): ${parts.join('; ')}.`;
}
