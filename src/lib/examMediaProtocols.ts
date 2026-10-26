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

/** " on the left side" — for one-sided findings; '' for both sides or no side. */
const onSide = (a: MediaAnswer): string =>
  a.side && a.side !== 'both' ? ` on the ${a.side} side` : '';

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

// Joint examination and Local injury assessment share one photo: the injured
// side next to the healthy side, so swelling and deformity are judged by
// comparison. Same shot id in both protocols, so one photo serves both.
const COMPARE_SIDES_SHOT = (answers: number[]): MediaShot => ({
  id: 'compare-sides',
  kind: 'photo',
  instruction:
    'Place the injured arm, leg, hand or foot next to the healthy one, in the same position, and photograph both from about 50 cm in good light. ' +
    'For a shoulder, hip or knee, photograph both sides of the body from the front. Remove clothing over the injury.',
  flash: false,
  answers,
});

// Deformity points to a fracture or dislocation — the finding that decides
// evacuation — so the model must not answer "no" unless it can see clearly.
const DEFORMITY_GUIDANCE =
  'Compare with the healthy side: an angle or bend where there should be none, a step or bump, a shortened or rotated limb, ' +
  'or a joint that sits out of place. Give the side of the injured limb. Answer "no" only if the injured part is fully visible and ' +
  'looks the same shape as the healthy side; if the healthy side is missing from the photo or the view is unclear, answer "cannot_determine".';

const JOINT_EXAM: ExamMediaProtocol = {
  examinationId: examinationIds.JOINT_EXAM,
  name: examinationDisplayNames[examinationIds.JOINT_EXAM],
  shots: [COMPARE_SIDES_SHOT([1, 2, 3])],
  questions: {
    1: {
      questionNumber: 1,
      text: 'Compare the joints to the other side, is there any swelling?',
      options: ['yes', 'no'],
      needsSide: true,
      guidance: 'Compare the size and outline of the joint with the same joint on the healthy side. Give the side of the swollen joint. If only one side is in the photo, answer "cannot_determine".',
      sentence: (a) => a.value === 'yes'
        ? withDetail(`swelling of the joint${onSide(a)}, compared with the healthy side`, a)
        : 'no swelling compared with the other side',
    },
    2: {
      questionNumber: 2,
      text: 'Is the joint or area around red and warm?',
      options: ['yes', 'no'],
      needsSide: true,
      guidance: 'Colour only — warmth cannot be seen. "yes" if the skin over or around the joint is redder than on the healthy side.',
      sentence: (a) => a.value === 'yes'
        ? withDetail(`joint red${onSide(a)} (warmth not assessed)`, a)
        : 'joint not red (warmth not assessed)',
    },
    3: {
      questionNumber: 3,
      text: 'Is the joint deformed or looks unusual?',
      options: ['yes', 'no'],
      needsSide: true,
      guidance: DEFORMITY_GUIDANCE,
      sentence: (a) => a.value === 'yes'
        ? withDetail(`joint deformed or unusual-looking${onSide(a)}`, a)
        : 'joint not deformed',
    },
  },
};

const INJURY_ASSESSMENT: ExamMediaProtocol = {
  examinationId: examinationIds.INJURY_ASSESSMENT,
  name: examinationDisplayNames[examinationIds.INJURY_ASSESSMENT],
  shots: [COMPARE_SIDES_SHOT([1, 2])],
  questions: {
    1: {
      questionNumber: 1,
      text: 'Does the injury look crooked, deformed or out of place?',
      options: ['yes', 'no'],
      needsSide: true,
      guidance: DEFORMITY_GUIDANCE,
      sentence: (a) => a.value === 'yes'
        ? withDetail(`injured part crooked, deformed or out of place${onSide(a)}`, a)
        : 'no visible deformity',
    },
    2: {
      questionNumber: 2,
      text: 'Is there any open wound, bruising, or swelling?',
      options: ['yes', 'no'],
      needsSide: true,
      guidance: 'Any break in the skin, bruising (blue, purple or dark discolouration) or swelling compared with the healthy side. If "yes", say which in detail.',
      sentence: (a) => a.value === 'yes'
        ? withDetail(`open wound, bruising or swelling${onSide(a)}`, a)
        : 'no open wound, bruising or swelling',
    },
  },
};

// Nose check. Q3 (blocked when breathing) and Q9 (sinus pain on pressing)
// need the officer; Q5 is a first-aid instruction (pinch the nose). Q6 uses
// the same throat photo as the Throat check, so one picture serves both.
const NOSE_CHECK: ExamMediaProtocol = {
  examinationId: examinationIds.NOSE_CHECK,
  name: examinationDisplayNames[examinationIds.NOSE_CHECK],
  shots: [
    {
      id: 'face-front',
      kind: 'photo',
      instruction:
        'Photograph the whole face straight on from about 50 cm, in good light, with the patient looking at the camera. ' +
        'If the nose is bleeding heavily, start first aid (pinch the soft part of the nose) — do not wait for the photo.',
      flash: false,
      answers: [1, 4],
    },
    {
      id: 'nostrils',
      kind: 'photo',
      instruction:
        'Ask the patient to tilt the head back. Shine a flashlight up into the nostrils and photograph from below, about 15 cm away, ' +
        'so the inside of both nostrils is visible.',
      flash: true,
      answers: [2, 7, 8],
    },
    {
      id: 'throat',
      kind: 'photo',
      instruction:
        'Ask the patient to open the mouth wide. Push the tongue down with a tongue depressor or spoon, shine a flashlight into the throat ' +
        'and photograph from about 15 cm so the back of the throat is visible.',
      flash: true,
      answers: [6],
    },
  ],
  questions: {
    1: {
      questionNumber: 1,
      text: 'Is there swelling, bruising, or deformity around the nose?',
      options: ['yes', 'no'],
      needsSide: false,
      // A crooked nose after a blow means a possible fracture.
      guidance: 'Swelling or bruising of the nose or around the eyes, or a nose that is crooked, flattened or bent to one side. If "yes", say which in detail.',
      sentence: (a) => a.value === 'yes' ? withDetail('swelling, bruising or deformity of the nose', a) : 'no swelling, bruising or deformity of the nose',
    },
    2: {
      questionNumber: 2,
      text: 'Is there redness or yellow secretion around the nose or in the nostrils?',
      options: ['none', 'redness', 'yellow secretion', 'redness and yellow secretion'],
      needsSide: false,
      guidance: 'Redness of the skin around or inside the nostrils, and yellow or green mucus or crusts. Clear mucus is "none".',
      sentence: (a) => a.value === 'none' ? 'no redness or yellow secretion at the nose' : withDetail(`${a.value} at the nose`, a),
    },
    4: {
      questionNumber: 4,
      text: 'Is there active bleeding? If yes, from one or both nostrils?',
      options: ['yes', 'no'],
      needsSide: true,
      guidance: 'Fresh red blood running from the nostrils now. Dried blood alone is not active bleeding — say "dried blood" in detail. If "yes", give the side of the bleeding nostril, or "both".',
      sentence: (a) => a.value === 'yes'
        ? withDetail(`active nosebleed${a.side === 'both' ? ' from both nostrils' : a.side ? ` from the ${a.side} nostril` : ''}`, a)
        : withDetail('no active bleeding from the nose', a),
    },
    6: {
      questionNumber: 6,
      text: 'Is there any blood in the mouth or throat?',
      options: ['yes', 'no'],
      needsSide: false,
      // Blood running down the back of the throat = bleeding from the back of
      // the nose, which pinching does not stop.
      guidance: 'Fresh blood or clots on the back of the throat, the tongue or the teeth.',
      sentence: (a) => a.value === 'yes' ? withDetail('blood in the mouth or throat', a) : 'no blood in the mouth or throat',
    },
    7: {
      questionNumber: 7,
      text: 'Use a light to look inside the nostrils, is there crusting or clots?',
      options: ['yes', 'no'],
      needsSide: true,
      guidance: 'Dry crusts or dark blood clots inside the nostrils. Give the side, or "both".',
      sentence: (a) => a.value === 'yes'
        ? withDetail(`crusts or clots in ${a.side === 'both' ? 'both nostrils' : a.side ? `the ${a.side} nostril` : 'the nostrils'}`, a)
        : 'no crusts or clots in the nostrils',
    },
    8: {
      questionNumber: 8,
      text: 'Can you see any foreign bodies in the nose?',
      options: ['yes', 'no'],
      needsSide: true,
      guidance: 'Any object in a nostril that is not part of the body or a blood clot. Give the side.',
      sentence: (a) => a.value === 'yes'
        ? withDetail(`foreign body in the nose${a.side && a.side !== 'both' ? ` (${a.side} nostril)` : ''}`, a)
        : 'no foreign body seen in the nose',
    },
  },
};

// Abdomen examination and Abdominal pain exam share the abdomen photo; the
// pressing questions stay with the officer.
const ABDOMEN_SHOT = (answers: number[]): MediaShot => ({
  id: 'abdomen',
  kind: 'photo',
  instruction:
    'Lay the patient flat on their back with the belly uncovered from below the chest to the groin. ' +
    'Photograph from straight above or slightly from the side, about 1 m away, in good light.',
  flash: false,
  answers,
});

const ABDOMEN_EXAM: ExamMediaProtocol = {
  examinationId: examinationIds.ABDOMEN_EXAM,
  name: examinationDisplayNames[examinationIds.ABDOMEN_EXAM],
  shots: [
    ABDOMEN_SHOT([1, 2]),
    {
      id: 'face-front',
      kind: 'photo',
      instruction: 'Photograph the whole face straight on from about 50 cm, in daylight or good white light, with the patient looking at the camera.',
      flash: false,
      answers: [3],
    },
  ],
  questions: {
    1: {
      questionNumber: 1,
      text: 'Is the belly more swollen or distended than normal?',
      options: ['yes', 'no'],
      needsSide: false,
      // A photo cannot know this person's normal belly; only an obviously
      // bulging, tense abdomen is a confident "yes".
      guidance: '"yes" only for a clearly bulging, tense or rounded belly, standing above the level of the chest. A normally rounded or overweight belly is not distension. If you cannot tell, answer "cannot_determine".',
      sentence: (a) => a.value === 'yes' ? withDetail('belly swollen or distended', a) : 'belly not distended',
    },
    2: {
      questionNumber: 2,
      text: 'Are there any visible scars, surgical wounds, or lumps on the surface?',
      options: ['yes', 'no'],
      needsSide: false,
      guidance: 'Scars, healing or fresh surgical wounds, or bulges and lumps (e.g. at the belly button or in the groin). If "yes", say what and where.',
      sentence: (a) => a.value === 'yes' ? withDetail('scars, surgical wounds or lumps on the belly', a) : 'no scars, wounds or lumps on the belly',
    },
    3: {
      questionNumber: 3,
      text: 'Does the person look pale or unwell?',
      options: ['yes', 'no'],
      needsSide: false,
      guidance: 'Pale or grey skin and lips, sweaty, drawn or exhausted face. Lighting and skin tone change how pale someone looks; if you cannot tell, answer "cannot_determine".',
      sentence: (a) => a.value === 'yes' ? withDetail('looks pale or unwell', a) : 'does not look pale or unwell',
    },
  },
};

const ABDOMINAL_PAIN: ExamMediaProtocol = {
  examinationId: examinationIds.ABDOMINAL_PAIN,
  name: examinationDisplayNames[examinationIds.ABDOMINAL_PAIN],
  shots: [ABDOMEN_SHOT([1])],
  questions: {
    1: {
      questionNumber: 1,
      text: 'Can you see any distension, asymmetry, discoloration, or surgical scars?',
      options: ['yes', 'no'],
      needsSide: false,
      guidance: 'A clearly bulging belly, one side fuller than the other, bruising or discoloured skin (blue, purple, yellow, red), or scars. If "yes", say which and where.',
      sentence: (a) => a.value === 'yes'
        ? withDetail('distension, asymmetry, discoloration or scars of the abdomen', a)
        : 'no distension, asymmetry, discoloration or scars of the abdomen',
    },
  },
};

// Facial symmetry for the neurologic checks. A drooping side of the face is a
// stroke sign, so any visible difference is "no" and a tilted or unclear photo
// is "cannot_determine" — never "yes, symmetrical" by default.
const FACE_SYMMETRY_GUIDANCE =
  'Compare the two halves of the face: the corners of the mouth, the fold from nose to mouth corner, the eyelids, the eyebrows and forehead lines. ' +
  'Any side that droops or moves less means "no" — give that side (the patient\'s side; in a frontal photo the patient\'s right is on the LEFT of the image). ' +
  'If the head is tilted or turned, or the face is not clearly visible, answer "cannot_determine".';

const FACE_SHOTS = {
  smile: (answers: number[]): MediaShot => ({
    id: 'smile', kind: 'photo', flash: false, answers,
    instruction: 'Ask the patient to smile broadly. Photograph the whole face straight on from about 50 cm, head upright, in good light.',
  }),
  teeth: (answers: number[]): MediaShot => ({
    id: 'show-teeth', kind: 'photo', flash: false, answers,
    instruction: 'Ask the patient to show their teeth (lips pulled back). Photograph the whole face straight on from about 50 cm, head upright.',
  }),
  eyebrows: (answers: number[]): MediaShot => ({
    id: 'raise-eyebrows', kind: 'photo', flash: false, answers,
    instruction: 'Ask the patient to raise both eyebrows as high as they can. Photograph the whole face straight on from about 50 cm, head upright.',
  }),
};

const faceSymmetryQuestion = (questionNumber: number, action: string, when: string): MediaQuestion => ({
  questionNumber,
  text: `Ask the patient to ${action}. Does the face look symmetrical and normal?`,
  options: ['yes', 'no'],
  needsSide: true,
  guidance: FACE_SYMMETRY_GUIDANCE,
  sentence: (a) => a.value === 'yes'
    ? `face symmetrical when ${when}`
    : withDetail(`face not symmetrical when ${when}${a.side && a.side !== 'both' ? ` (${a.side} side droops)` : ''}`, a),
});

const SIMPLE_NEURO: ExamMediaProtocol = {
  examinationId: examinationIds.SIMPLE_NEURO,
  name: examinationDisplayNames[examinationIds.SIMPLE_NEURO],
  shots: [FACE_SHOTS.smile([1]), FACE_SHOTS.teeth([2]), FACE_SHOTS.eyebrows([3])],
  questions: {
    1: faceSymmetryQuestion(1, 'smile', 'smiling'),
    2: faceSymmetryQuestion(2, 'show teeth', 'showing the teeth'),
    3: faceSymmetryQuestion(3, 'raise eyebrows', 'raising the eyebrows'),
  },
};

const ADVANCED_NEURO: ExamMediaProtocol = {
  examinationId: examinationIds.ADVANCED_NEURO,
  name: examinationDisplayNames[examinationIds.ADVANCED_NEURO],
  shots: [
    { ...EYE_EXAM.shots[0], answers: [4] },
    FACE_SHOTS.smile([7]),
    FACE_SHOTS.teeth([8]),
    FACE_SHOTS.eyebrows([9]),
    {
      id: 'mouth-open',
      kind: 'photo',
      instruction: 'Ask the patient to open the mouth and stick out the tongue. Shine a flashlight in and photograph the tongue and lips from about 20 cm.',
      flash: true,
      answers: [11],
    },
  ],
  questions: {
    4: {
      questionNumber: 4,
      text: 'Check the pupils, are they similar in size and round?',
      options: ['yes', 'no'],
      needsSide: true,
      // Unequal pupils after a head injury can mean bleeding in the skull: a
      // visible difference must never be rounded to "similar".
      guidance:
        'Compare the two pupils (the black centres) in size and shape. Any difference you can see, or a pupil that is not round, means "no" — ' +
        'give the side of the larger or irregular pupil. If a pupil cannot be told apart from its iris, answer "cannot_determine".',
      sentence: (a) => a.value === 'yes'
        ? 'pupils similar in size and round'
        : withDetail(`pupils not similar in size or not round${a.side && a.side !== 'both' ? ` (${a.side} larger or irregular)` : ''}`, a),
    },
    7: faceSymmetryQuestion(7, 'smile', 'smiling'),
    8: faceSymmetryQuestion(8, 'show teeth', 'showing the teeth'),
    9: faceSymmetryQuestion(9, 'raise eyebrows', 'raising the eyebrows'),
    11: {
      questionNumber: 11,
      text: 'Ask the patient to open their mouth. Are there any wounds on the tongue or lips?',
      options: ['yes', 'no'],
      needsSide: false,
      // A bitten tongue suggests the patient had a seizure.
      guidance: 'Bite marks, cuts, swelling or bleeding on the tongue (especially its sides) or the lips. If "yes", say where.',
      sentence: (a) => a.value === 'yes' ? withDetail('wounds on the tongue or lips', a) : 'no wounds on the tongue or lips',
    },
  },
};

// General appearance. Talking (Q1), breathing (Q2) and walking (Q6) need a
// video, sweaty / warm skin (Q4) needs touch — they stay with the officer.
const GENERAL_APPEARANCE: ExamMediaProtocol = {
  examinationId: examinationIds.GENERAL_APPEARANCE,
  name: examinationDisplayNames[examinationIds.GENERAL_APPEARANCE],
  shots: [
    {
      id: 'face-front',
      kind: 'photo',
      instruction: 'Photograph the whole face straight on from about 50 cm, in daylight or good white light, with the patient looking at the camera.',
      flash: false,
      answers: [3],
    },
    {
      id: 'body-front',
      kind: 'photo',
      instruction:
        'Photograph the whole patient from the front, from about 2 m, in good light. ' +
        'Uncover the places that hurt or were hit, as far as decency and warmth allow.',
      flash: false,
      answers: [5],
    },
  ],
  questions: {
    3: {
      questionNumber: 3,
      text: 'Does the person look more pale or grey than usual?',
      options: ['yes', 'no'],
      needsSide: false,
      guidance: 'Pale, grey or bluish skin and lips. Lighting and skin tone change how pale someone looks, and the photo cannot show what is "usual" for this person; if you cannot tell, answer "cannot_determine".',
      sentence: (a) => a.value === 'yes' ? withDetail('looks pale or grey', a) : 'does not look pale or grey',
    },
    5: {
      questionNumber: 5,
      text: 'Are there any signs of trauma, such as wounds or bruising?',
      options: ['yes', 'no'],
      needsSide: false,
      guidance: 'Wounds, blood, bruises, swelling or burns anywhere visible. If "yes", say what and where. Covered body parts cannot be judged — mention it in detail.',
      sentence: (a) => a.value === 'yes' ? withDetail('signs of trauma', a) : withDetail('no visible signs of trauma', a),
    },
  },
};

// Thrombosis and edema check. Calf (Q3) and groin (Q4) pain need pressing.
// Pitting (Q5) is a photo taken right after the thumb press: the dent is
// still visible for a few seconds.
const THROMBOSIS_EDEMA: ExamMediaProtocol = {
  examinationId: examinationIds.THROMBOSIS_EDEMA,
  name: examinationDisplayNames[examinationIds.THROMBOSIS_EDEMA],
  shots: [
    {
      id: 'legs-both',
      kind: 'photo',
      instruction:
        'Uncover both legs from the knees down. Place the feet side by side, in the same position, and photograph both lower legs, ankles and feet ' +
        'from the front, about 1 m away, in good light.',
      flash: false,
      answers: [1, 2],
    },
    {
      id: 'pitting-test',
      kind: 'photo',
      instruction:
        'Press your thumb firmly into the skin just above the ankle bone for 5 seconds, then let go and photograph the spot straight away, ' +
        'slightly from the side and close up, so a remaining dent would be visible.',
      flash: true,
      answers: [5],
    },
  ],
  questions: {
    1: {
      questionNumber: 1,
      text: 'Are the legs, feet, or ankles swollen?',
      options: ['yes', 'no'],
      needsSide: true,
      guidance: 'Puffy ankles or feet, ankle bones not visible, tight shiny skin, or marks from socks. Give the side, or "both".',
      sentence: (a) => a.value === 'yes'
        ? withDetail(`swollen ${a.side === 'both' || !a.side ? 'legs, feet or ankles' : `${a.side} leg, foot or ankle`}`, a)
        : 'legs, feet and ankles not swollen',
    },
    2: {
      questionNumber: 2,
      text: 'Is one leg more swollen and clearly larger than the other?',
      options: ['yes', 'no'],
      needsSide: true,
      // One-sided swelling is the warning sign for a deep vein thrombosis.
      guidance: 'Compare the width of both calves and ankles. If one is clearly larger, answer "yes" with its side. Both legs must be in the photo; otherwise "cannot_determine".',
      sentence: (a) => a.value === 'yes'
        ? withDetail(`one leg clearly larger than the other${onSide(a)}`, a)
        : 'both legs similar in size',
    },
    5: {
      questionNumber: 5,
      text: 'Press your thumb above the ankle, then release. Does a dent or dipped area remain in the skin?',
      options: ['yes', 'no'],
      needsSide: false,
      guidance: 'A visible pit or dip in the skin where the thumb pressed. A red mark without a dip is "no".',
      sentence: (a) => a.value === 'yes' ? withDetail('pitting edema (dent remains after pressing)', a) : 'no pitting edema',
    },
  },
};

export const EXAM_MEDIA_PROTOCOLS: Record<number, ExamMediaProtocol> = {
  [GENERAL_APPEARANCE.examinationId]: GENERAL_APPEARANCE,
  [THROMBOSIS_EDEMA.examinationId]: THROMBOSIS_EDEMA,
  [ABDOMEN_EXAM.examinationId]: ABDOMEN_EXAM,
  [ABDOMINAL_PAIN.examinationId]: ABDOMINAL_PAIN,
  [SIMPLE_NEURO.examinationId]: SIMPLE_NEURO,
  [ADVANCED_NEURO.examinationId]: ADVANCED_NEURO,
  [NOSE_CHECK.examinationId]: NOSE_CHECK,
  [JOINT_EXAM.examinationId]: JOINT_EXAM,
  [INJURY_ASSESSMENT.examinationId]: INJURY_ASSESSMENT,
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
