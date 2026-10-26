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
  /** Allowed values. "cannot_determine" is always allowed in addition. Empty when `valueFormat` is set. */
  options: string[];
  /** For a measured answer (e.g. wound size) instead of a choice: the value must match `pattern`. */
  valueFormat?: { pattern: RegExp; description: string };
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

// "4.5 x 1.0" — length x width in cm, one decimal at most.
const SIZE_CM = /^\d{1,2}(\.\d)? x \d{1,2}(\.\d)?$/;

const WOUND_EXAM: ExamMediaProtocol = {
  examinationId: examinationIds.WOUND_EXAM,
  name: examinationDisplayNames[examinationIds.WOUND_EXAM],
  shots: [
    {
      id: 'wound-close',
      kind: 'photo',
      instruction:
        'Photograph the wound from straight above, about 20 cm away, in good light. ' +
        'Lay a ruler or tape measure (or a coin) right next to the wound so its size can be measured. ' +
        'Wipe away blood first if you can.',
      flash: true,
      answers: [1, 2, 3, 4, 5, 6],
    },
    {
      id: 'wound-distal',
      kind: 'photo',
      instruction:
        'Only if the wound is on an arm or leg: photograph the hand or foot beyond the wound ' +
        'next to the other, healthy hand or foot, so their colour can be compared.',
      flash: false,
      answers: [7],
    },
  ],
  questions: {
    1: {
      questionNumber: 1,
      text: 'How long and wide is the wound in centimeters?',
      options: [],
      valueFormat: { pattern: SIZE_CM, description: 'length x width in cm, e.g. "4.5 x 1.0"' },
      needsSide: false,
      guidance:
        'Measure only against a scale reference in the photo. A ruler or tape measure is best. ' +
        'If only a coin is visible, take it as about 2.5 cm across and put "estimated from a coin" in detail. ' +
        'If there is no scale reference, answer "cannot_determine" — never guess a size.',
      sentence: (a) => {
        const [length, width] = a.value.split(' x ');
        return withDetail(`wound about ${length} cm long and ${width} cm wide`, a);
      },
    },
    2: {
      questionNumber: 2,
      text: 'Are the edges even and smooth, or uneven and jagged?',
      options: ['smooth', 'jagged'],
      needsSide: false,
      guidance: '"smooth" = clean straight edges like a knife cut; "jagged" = torn, ragged or irregular edges.',
      sentence: (a) => withDetail(a.value === 'smooth' ? 'edges even and smooth' : 'edges uneven and jagged', a),
    },
    3: {
      questionNumber: 3,
      text: 'Do the edges gap open, or are they close together?',
      options: ['gaping', 'together'],
      needsSide: false,
      sentence: (a) => withDetail(a.value === 'gaping' ? 'edges gaping open' : 'edges close together', a),
    },
    4: {
      questionNumber: 4,
      text: 'Can you see fat, muscle, bone or tendons? Tendons are white and cord-like.',
      options: ['none', 'fat', 'muscle', 'tendon', 'bone'],
      needsSide: false,
      // The answer that decides closure on board vs. evacuation, so the model
      // must not guess: blood or shadow in the wound bed is "cannot_determine".
      guidance:
        'Give the DEEPEST structure you can see: fat (yellow, lumpy), muscle (dark red, fibrous), ' +
        'tendon (white, shiny, cord-like) or bone (white, hard). "none" only if the wound bed is clearly visible and shows only skin layers. ' +
        'If blood, a clot or shadow hides the bottom of the wound, answer "cannot_determine".',
      sentence: (a) => withDetail(a.value === 'none' ? 'no deeper tissue visible' : `${a.value} visible in the wound`, a),
    },
    5: {
      questionNumber: 5,
      text: 'Is there sign of infection, like redness or yellow secretion?',
      options: ['yes', 'no'],
      needsSide: false,
      guidance: 'Redness spreading into the skin around the wound, swelling, or yellow / green pus. Fresh blood alone is not a sign of infection.',
      sentence: (a) => a.value === 'yes' ? withDetail('signs of infection', a) : 'no signs of infection',
    },
    6: {
      questionNumber: 6,
      text: 'Is there any dirt, metal or other debris inside the wound? Rinse with clean water if necessary and look again.',
      options: ['yes', 'no'],
      needsSide: false,
      guidance: 'Visible dirt, grit, rust, metal, wood, glass or fibres in the wound. If yes, say what in detail.',
      sentence: (a) => a.value === 'yes' ? withDetail('debris in the wound', a) : 'no visible debris',
    },
    7: {
      questionNumber: 7,
      text: 'Check the skin further down from the wound, for example in fingers. Is the skin warm and of normal color?',
      options: ['normal', 'pale', 'bluish'],
      needsSide: false,
      guidance:
        'Colour only — warmth cannot be seen. Compare the hand or foot beyond the wound with the healthy one in the same photo. ' +
        '"pale" = white or waxy; "bluish" = blue, grey or purple.',
      sentence: (a) => withDetail(
        a.value === 'normal'
          ? 'skin beyond the wound of normal colour (warmth not assessed)'
          : `skin beyond the wound ${a.value} (warmth not assessed)`,
        a,
      ),
    },
  },
};

// Fixed list rather than free text, so the location reads the same in every
// report. Combined with the side ("left forearm"); midline areas need no side.
const BODY_AREAS = [
  'scalp', 'face', 'neck', 'chest', 'abdomen', 'back', 'buttocks', 'groin',
  'shoulder', 'upper arm', 'elbow', 'forearm', 'hand', 'thigh', 'knee', 'lower leg', 'foot', 'widespread',
];

const SKIN_ASSESSMENT: ExamMediaProtocol = {
  examinationId: examinationIds.SKIN_ASSESSMENT,
  name: examinationDisplayNames[examinationIds.SKIN_ASSESSMENT],
  shots: [
    {
      id: 'skin-wide',
      kind: 'photo',
      instruction:
        'Photograph the whole affected body area from about 1 m, in good light, so it is clear where on the body the skin problem is. ' +
        'If it could be on both sides of the body (both arms, both legs), get both sides in the photo.',
      flash: false,
      answers: [1, 2, 3],
    },
    {
      id: 'skin-close',
      kind: 'photo',
      instruction:
        'Photograph the skin problem close up, from about 15 cm, in good light. ' +
        'If you can, take it slightly from the side so it shows whether the skin is raised.',
      flash: false,
      answers: [4, 5, 6],
    },
  ],
  questions: {
    1: {
      questionNumber: 1,
      text: 'Where is the skin condition located?',
      options: BODY_AREAS,
      needsSide: true,
      guidance:
        'The main body area of the skin problem. Give "side" for arms, legs, hands, feet, shoulders and one-sided findings; ' +
        'leave it out for midline areas. "widespread" if it covers several body areas.',
      sentence: (a) => {
        const where = a.value === 'widespread'
          ? 'widespread skin condition'
          : `skin condition on the ${a.side && a.side !== 'both' ? `${a.side} ` : ''}${a.value}${a.side === 'both' ? ' on both sides' : ''}`;
        return withDetail(where, a);
      },
    },
    2: {
      questionNumber: 2,
      text: 'Does the skin condition spread to other areas?',
      options: ['yes', 'no'],
      needsSide: false,
      guidance: '"yes" if the same kind of skin change is visible in more than one separate body area, or spreads out from the main area.',
      sentence: (a) => a.value === 'yes' ? withDetail('spreading to other areas', a) : 'confined to one area',
    },
    3: {
      questionNumber: 3,
      text: 'Is it symmetrical or not?',
      options: ['yes', 'no'],
      needsSide: false,
      guidance: 'Symmetrical = the same on both sides of the body. Only answer if both sides are visible in the photo; otherwise "cannot_determine".',
      sentence: (a) => a.value === 'yes' ? 'symmetrical on both sides of the body' : 'not symmetrical',
    },
    4: {
      questionNumber: 4,
      text: 'Is it flat? Or rather swollen or raised?',
      options: ['flat', 'raised', 'swollen'],
      needsSide: false,
      guidance: '"raised" = bumps, welts or plaques above the skin; "swollen" = the whole area puffed up. Judge from shadows and the outline; if the photo is straight on and gives no clue, "cannot_determine".',
      sentence: (a) => withDetail(a.value === 'flat' ? 'flat' : a.value, a),
    },
    5: {
      questionNumber: 5,
      text: 'Is it dry or weeping?',
      options: ['dry', 'weeping'],
      needsSide: false,
      guidance: '"weeping" = moist, oozing clear or yellow fluid, or wet crusts; "dry" = dry, scaly or flaky.',
      sentence: (a) => withDetail(a.value, a),
    },
    6: {
      questionNumber: 6,
      text: 'Are there any blisters or open wounds?',
      options: ['yes', 'no'],
      needsSide: false,
      guidance: 'Fluid-filled blisters, burst blisters, open sores, erosions or scratch wounds. If "yes", say which in detail.',
      sentence: (a) => a.value === 'yes' ? withDetail('blisters or open wounds present', a) : 'no blisters or open wounds',
    },
  },
};

// Throat and Dental share the mouth-opening test (Throat Q6 = Dental Q4), and
// the same open-mouth photo serves both, so the app can send one picture to
// both examinations. Shot ids are therefore the same in both protocols.
const MOUTH_OPENING_SHOT = (questionNumber: number): MediaShot => ({
  id: 'mouth-opening',
  kind: 'photo',
  instruction:
    'Ask the patient to open the mouth as wide as they can and to stack their own fingers flat, one above the other, ' +
    'between the upper and lower front teeth. Photograph from the front so the fingers and teeth are clearly visible.',
  flash: true,
  answers: [questionNumber],
});

const MOUTH_OPENING_QUESTION = (questionNumber: number): MediaQuestion => ({
  questionNumber,
  text: 'Can the patient open their mouth normally? How many fingers can you stack between their upper and lower teeth?',
  options: ['0', '1', '2', '3', '4'],
  needsSide: false,
  guidance:
    'Count the fingers stacked vertically between the upper and lower front teeth. ' +
    'If no fingers are in the mouth, or you cannot count them, answer "cannot_determine".',
  // ≤ 2 fingers: trismus suspected (examinationInstructions.ts).
  sentence: (a) => Number(a.value) <= 2
    ? `mouth opening limited to ${a.value} finger${a.value === '1' ? '' : 's'} (trismus suspected)`
    : `mouth opens normally (${a.value} fingers)`,
});

const THROAT_CHECK: ExamMediaProtocol = {
  examinationId: examinationIds.THROAT_CHECK,
  name: examinationDisplayNames[examinationIds.THROAT_CHECK],
  shots: [
    {
      id: 'throat',
      kind: 'photo',
      instruction:
        'Ask the patient to open the mouth wide and say "aaah". Push the tongue down with a tongue depressor or spoon, ' +
        'shine a flashlight into the throat and photograph from about 15 cm so the back of the throat and both tonsils are visible.',
      flash: true,
      answers: [2, 3, 4],
    },
    MOUTH_OPENING_SHOT(6),
  ],
  questions: {
    2: {
      questionNumber: 2,
      text: 'Are the tonsils swollen or can you see white or yellowish patches?',
      options: ['no', 'swollen', 'patches', 'swollen with patches'],
      needsSide: true,
      guidance: 'The tonsils are the two rounded lumps either side of the back of the throat. If the tongue hides them, answer "cannot_determine".',
      sentence: (a) => {
        if (a.value === 'no') return 'tonsils not swollen, no patches';
        const finding = {
          swollen: 'swollen tonsils',
          patches: 'white or yellow patches on the tonsils',
          'swollen with patches': 'swollen tonsils with white or yellow patches',
        }[a.value] ?? a.value;
        return withDetail(a.side && a.side !== 'both' ? `${finding} (${a.side})` : finding, a);
      },
    },
    3: {
      questionNumber: 3,
      text: 'Is there any yellow secretion or redness?',
      options: ['none', 'redness', 'yellow secretion', 'redness and yellow secretion'],
      needsSide: false,
      guidance: 'Redness of the back of the throat and tonsils, and yellow mucus or pus. A normal throat is pink.',
      sentence: (a) => a.value === 'none' ? 'throat not red, no secretion' : withDetail(`${a.value} in the throat`, a),
    },
    4: {
      questionNumber: 4,
      text: 'Are the tonsils symmetrical and of similar size?',
      options: ['yes', 'no'],
      needsSide: true,
      guidance: 'If "no", give the side of the LARGER tonsil. The uvula being pushed to one side also means "no".',
      sentence: (a) => a.value === 'yes'
        ? 'tonsils symmetrical'
        : withDetail(`tonsils not symmetrical${a.side && a.side !== 'both' ? ` (${a.side} larger)` : ''}`, a),
    },
    6: MOUTH_OPENING_QUESTION(6),
  },
};

const DENTAL_EXAM: ExamMediaProtocol = {
  examinationId: examinationIds.DENTAL_EXAM,
  name: examinationDisplayNames[examinationIds.DENTAL_EXAM],
  shots: [
    {
      id: 'face-front',
      kind: 'photo',
      instruction: 'Photograph the whole face straight on from about 50 cm, in good light, with the mouth closed and the patient looking at the camera.',
      flash: false,
      answers: [1],
    },
    {
      id: 'mouth-open',
      kind: 'photo',
      instruction:
        'Ask the patient to open the mouth and pull the lips back so the teeth and gums are visible. ' +
        'Shine a flashlight in and photograph from about 15 cm. Take one photo of the painful side if there is one.',
      flash: true,
      answers: [5, 6, 7, 8],
    },
    MOUTH_OPENING_SHOT(4),
  ],
  questions: {
    1: {
      questionNumber: 1,
      text: 'Is the face swollen or red? Is the face symmetrical?',
      options: ['yes', 'no'],
      needsSide: true,
      guidance: '"yes" = swelling or redness of the cheek, jaw or face, or one side clearly fuller than the other. Give the side. Compare both halves of the face.',
      sentence: (a) => a.value === 'yes'
        ? withDetail(`face swollen or red${a.side && a.side !== 'both' ? ` on the ${a.side} side` : ''}`, a)
        : 'face not swollen or red, symmetrical',
    },
    4: MOUTH_OPENING_QUESTION(4),
    5: {
      questionNumber: 5,
      text: 'Can you see any sores or blisters on the lips or inside the mouth?',
      options: ['yes', 'no'],
      needsSide: false,
      guidance: 'Ulcers, blisters, white patches or raw spots on the lips, gums, cheeks or tongue. If "yes", say where.',
      sentence: (a) => a.value === 'yes' ? withDetail('sores or blisters in or around the mouth', a) : 'no sores or blisters in the mouth',
    },
    6: {
      questionNumber: 6,
      text: 'Is there any redness, yellow fluid, bleeding or swelling around the gums?',
      options: ['yes', 'no'],
      needsSide: false,
      guidance: 'Healthy gums are pale pink and tight around the teeth. If "yes", say which (red, swollen, bleeding, pus) and where.',
      sentence: (a) => a.value === 'yes' ? withDetail('gums red, swollen, bleeding or with pus', a) : 'gums look healthy',
    },
    7: {
      questionNumber: 7,
      text: 'Are there cracks, chips, broken or missing teeth?',
      options: ['yes', 'no'],
      needsSide: false,
      guidance: 'Only teeth visible in the photo. If "yes", say which (e.g. "upper front tooth chipped").',
      sentence: (a) => a.value === 'yes' ? withDetail('cracked, chipped, broken or missing teeth', a) : 'no broken or missing teeth seen',
    },
    8: {
      questionNumber: 8,
      text: 'Are there any teeth that are more black or brown than the others?',
      options: ['yes', 'no'],
      needsSide: false,
      guidance: 'Black or brown spots, holes or whole teeth darker than the rest. General yellowish colour of all teeth is "no".',
      sentence: (a) => a.value === 'yes' ? withDetail('black or brown teeth', a) : 'no black or brown teeth seen',
    },
  },
};

export const EXAM_MEDIA_PROTOCOLS: Record<number, ExamMediaProtocol> = {
  [EYE_EXAM.examinationId]: EYE_EXAM,
  [WOUND_EXAM.examinationId]: WOUND_EXAM,
  [SKIN_ASSESSMENT.examinationId]: SKIN_ASSESSMENT,
  [THROAT_CHECK.examinationId]: THROAT_CHECK,
  [DENTAL_EXAM.examinationId]: DENTAL_EXAM,
};

/** Whether `value` is an answer the question allows: one of its options, or a match for its value format. */
export function allowsValue(q: MediaQuestion, value: string): boolean {
  return q.valueFormat ? q.valueFormat.pattern.test(value) : q.options.includes(value);
}

export function getProtocol(examinationId: number): ExamMediaProtocol | undefined {
  return EXAM_MEDIA_PROTOCOLS[examinationId];
}

export function getShot(protocol: ExamMediaProtocol, shotId: string): MediaShot | undefined {
  return protocol.shots.find((s) => s.id === shotId);
}

/** True when the answer is one the question allows (cannot_determine is handled by the caller). */
export function isValidAnswer(protocol: ExamMediaProtocol, a: MediaAnswer): boolean {
  const q = protocol.questions[a.questionNumber];
  if (!q || !allowsValue(q, a.value)) return false;
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
  // A retaken photo confirms the same question again — the later answer wins.
  const latest = new Map(answers.map((a) => [a.questionNumber, a]));
  const parts = [...latest.values()]
    .sort((x, y) => x.questionNumber - y.questionNumber)
    .map((a) => protocol.questions[a.questionNumber]?.sentence(a) ?? null)
    .filter((s): s is string => !!s);
  if (!parts.length) return '';
  return `${protocol.name} (photo, confirmed by officer): ${parts.join('; ')}.`;
}
