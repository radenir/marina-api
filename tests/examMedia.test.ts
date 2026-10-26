/**
 * Tests for the exam-media photo pipeline that run without a network or DB:
 * - parseModelOutput reduces every malformed or doubtful model answer to "cannot_determine"
 * - renderExamSentence writes confirmed answers into the report's "exam" wording
 * - withPhotoFindings tells the findings batch which questions photos already cover
 *
 * No test runner is configured; run directly:
 *     ./node_modules/.bin/tsx tests/examMedia.test.ts
 * Exits non-zero on any failure.
 */
import { getProtocol, getShot, isValidAnswer, renderExamSentence } from '../src/lib/examMediaProtocols.js';
import { parseModelOutput } from '../src/lib/examMediaAnalyze.js';
import { withPhotoFindings } from '../src/lib/medicalExtractV2.js';

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

const eye = getProtocol(2)!;
const shot = getShot(eye, 'eyes-front')!;
const parse = (raw: string) => parseModelOutput(raw, eye, shot, 0.7);

console.log('parseModelOutput');
{
  const r = parse(JSON.stringify({
    quality: { ok: true, reason: null },
    answers: [
      { questionNumber: 1, value: 'no', confidence: 0.9 },
      { questionNumber: 2, value: 'yes', side: 'right', confidence: 0.85, detail: 'diffuse' },
      { questionNumber: 3, value: 'purple', confidence: 0.95 },
      { questionNumber: 4, value: 'yes', confidence: 0.5 },
      { questionNumber: 5, value: 'cannot_determine', reason: 'pupils hidden by glare' },
    ],
  }));
  const by = new Map(r.answers.map((a) => [a.questionNumber, a]));
  check('answers every question of the shot', r.answers.length === 5, r.answers);
  check('valid answer kept', by.get(1)?.status === 'answered' && by.get(1)?.value === 'no');
  check('side and detail kept', by.get(2)?.side === 'right' && by.get(2)?.detail === 'diffuse');
  check('value outside options → cannot_determine', by.get(3)?.status === 'cannot_determine');
  check('low confidence → cannot_determine', by.get(4)?.status === 'cannot_determine');
  check('model cannot_determine kept with reason', by.get(5)?.status === 'cannot_determine' && by.get(5)?.reason === 'pupils hidden by glare');
}
{
  const r = parse('```json\n{"quality":{"ok":true},"answers":[{"questionNumber":4,"value":"yes","confidence":0.95}]}\n```');
  check('code fence stripped', r.answers.find((a) => a.questionNumber === 4)?.status === 'answered');
  check('missing answers → cannot_determine', r.answers.filter((a) => a.status === 'cannot_determine').length === 4);
}
{
  // Kimi-K3 leaves "answers" out entirely when it rejects a photo.
  const r = parse('{"quality":{"ok":false,"reason":"Too dark — turn on the cabin light and retake."}}');
  check('bad photo → retake with reason', !r.quality.ok && r.quality.reason!.startsWith('Too dark'));
  check('bad photo → nothing answered', r.answers.every((a) => a.status === 'cannot_determine'));
}
{
  const r = parse('I cannot help with that.');
  check('non-JSON → everything cannot_determine', r.answers.length === 5 && r.answers.every((a) => a.status === 'cannot_determine'));
}

{
  // One over-long detail must not throw away the other answers.
  const r = parse(JSON.stringify({
    quality: { ok: true },
    answers: [
      { questionNumber: 1, value: 'no', confidence: 0.9 },
      { questionNumber: 2, value: 'yes', side: 'right', confidence: 0.9, detail: 'x'.repeat(280) },
    ],
  }));
  const q2 = r.answers.find((a) => a.questionNumber === 2)!;
  check('long detail is shortened, not rejected',
    r.answers.find((a) => a.questionNumber === 1)?.status === 'answered' && q2.status === 'answered' && q2.detail!.length === 200 && q2.detail!.endsWith('…'),
    q2);
}

console.log('renderExamSentence');
{
  const s = renderExamSentence(2, [
    { questionNumber: 5, value: 'yes' },
    { questionNumber: 2, value: 'yes', side: 'right' },
    { questionNumber: 1, value: 'no' },
    { questionNumber: 3, value: 'yellow', side: 'both' },
    { questionNumber: 4, value: 'yes' },
  ]);
  check(
    'eye findings in question order',
    s === 'Eye examination (photo, confirmed by officer): no redness around the iris; redness of the white of the right eye; yellow discharge from both eyes; pupils round; pupils equal in size.',
    s,
  );
  check('detail appended', renderExamSentence(2, [{ questionNumber: 5, value: 'no', detail: 'left pupil larger' }])
    === 'Eye examination (photo, confirmed by officer): pupils unequal in size (left pupil larger).');
  check('nothing confirmed → empty', renderExamSentence(2, []) === '');
  check('unknown examination → empty', renderExamSentence(999, [{ questionNumber: 1, value: 'yes' }]) === '');
}

console.log('wound protocol');
{
  const wound = getProtocol(21)!;
  const close = getShot(wound, 'wound-close')!;
  const r = parseModelOutput(JSON.stringify({
    quality: { ok: true },
    answers: [
      { questionNumber: 1, value: '4.5 x 1.0', confidence: 0.8, detail: 'measured against ruler' },
      { questionNumber: 2, value: 'jagged', confidence: 0.85 },
      { questionNumber: 3, value: 'gaping', confidence: 0.9 },
      { questionNumber: 4, value: 'fat', confidence: 0.75 },
      { questionNumber: 5, value: 'no', confidence: 0.8 },
      { questionNumber: 6, value: 'yes', confidence: 0.8, detail: 'grit' },
    ],
  }), wound, close, 0.7);
  check('all six close-up answers kept', r.answers.every((a) => a.status === 'answered'), r.answers);
  const bad = parseModelOutput('{"quality":{"ok":true},"answers":[{"questionNumber":1,"value":"about 4 cm","confidence":0.9}]}', wound, close, 0.7);
  check('size not in "L x W" form → cannot_determine', bad.answers.find((a) => a.questionNumber === 1)?.status === 'cannot_determine');
  check('size format valid', isValidAnswer(wound, { questionNumber: 1, value: '12 x 0.5' }));
  check('size format invalid', !isValidAnswer(wound, { questionNumber: 1, value: '12cm' }));
  check('Q7 belongs to the distal shot only', getShot(wound, 'wound-distal')!.answers.join() === '7' && !close.answers.includes(7));

  const s = renderExamSentence(21, [
    { questionNumber: 7, value: 'normal' },
    { questionNumber: 1, value: '4.5 x 1.0', detail: 'estimated from a coin' },
    { questionNumber: 2, value: 'jagged' },
    { questionNumber: 3, value: 'gaping' },
    { questionNumber: 4, value: 'fat' },
    { questionNumber: 5, value: 'no' },
    { questionNumber: 6, value: 'yes', detail: 'grit' },
  ]);
  check(
    'wound findings from both photos in one sentence',
    s === 'Wound examination (photo, confirmed by officer): wound about 4.5 cm long and 1.0 cm wide (estimated from a coin); ' +
      'edges uneven and jagged; edges gaping open; fat visible in the wound; no signs of infection; debris in the wound (grit); ' +
      'skin beyond the wound of normal colour (warmth not assessed).',
    s,
  );
  check('retaken photo: later answer wins', renderExamSentence(2, [
    { questionNumber: 2, value: 'no' }, { questionNumber: 2, value: 'yes', side: 'left' },
  ]) === 'Eye examination (photo, confirmed by officer): redness of the white of the left eye.');
}

console.log('skin protocol');
{
  const skin = getProtocol(19)!;
  check('wide photo answers Q1-3, close-up Q4-6',
    getShot(skin, 'skin-wide')!.answers.join() === '1,2,3' && getShot(skin, 'skin-close')!.answers.join() === '4,5,6');
  check('body area from the fixed list', isValidAnswer(skin, { questionNumber: 1, value: 'forearm', side: 'left' }));
  check('body area outside the list rejected', !isValidAnswer(skin, { questionNumber: 1, value: 'left wrist' }));
  const s = renderExamSentence(19, [
    { questionNumber: 1, value: 'forearm', side: 'left' },
    { questionNumber: 2, value: 'no' },
    { questionNumber: 3, value: 'no' },
    { questionNumber: 4, value: 'raised' },
    { questionNumber: 5, value: 'weeping', detail: 'yellow crusts' },
    { questionNumber: 6, value: 'yes', detail: 'small blisters' },
  ]);
  check(
    'skin findings in one sentence',
    s === 'Skin assessment (photo, confirmed by officer): skin condition on the left forearm; confined to one area; not symmetrical; ' +
      'raised; weeping (yellow crusts); blisters or open wounds present (small blisters).',
    s,
  );
  check('both sides / widespread wording',
    renderExamSentence(19, [{ questionNumber: 1, value: 'lower leg', side: 'both' }]) === 'Skin assessment (photo, confirmed by officer): skin condition on the lower leg on both sides.' &&
    renderExamSentence(19, [{ questionNumber: 1, value: 'widespread' }]) === 'Skin assessment (photo, confirmed by officer): widespread skin condition.');
}

console.log('throat and dental protocols');
{
  const throat = getProtocol(5)!;
  const dental = getProtocol(20)!;
  check('same mouth-opening shot id in both', !!getShot(throat, 'mouth-opening') && !!getShot(dental, 'mouth-opening'));
  check('mouth opening answers Throat Q6 and Dental Q4',
    getShot(throat, 'mouth-opening')!.answers.join() === '6' && getShot(dental, 'mouth-opening')!.answers.join() === '4');
  check('finger count must be 0-4', isValidAnswer(throat, { questionNumber: 6, value: '2' }) && !isValidAnswer(throat, { questionNumber: 6, value: 'two' }));
  check('throat Q1 is an instruction, not a photo question', !throat.questions[1]);

  const t = renderExamSentence(5, [
    { questionNumber: 2, value: 'swollen with patches', side: 'right' },
    { questionNumber: 3, value: 'redness' },
    { questionNumber: 4, value: 'no', side: 'right' },
    { questionNumber: 6, value: '1' },
  ]);
  check('throat sentence',
    t === 'Throat check (photo, confirmed by officer): swollen tonsils with white or yellow patches (right); redness in the throat; ' +
      'tonsils not symmetrical (right larger); mouth opening limited to 1 finger (trismus suspected).', t);

  const d = renderExamSentence(20, [
    { questionNumber: 1, value: 'yes', side: 'left', detail: 'cheek' },
    { questionNumber: 4, value: '3' },
    { questionNumber: 5, value: 'no' },
    { questionNumber: 6, value: 'yes', detail: 'swollen gum lower left' },
    { questionNumber: 7, value: 'no' },
    { questionNumber: 8, value: 'yes', detail: 'lower left molar' },
  ]);
  check('dental sentence',
    d === 'Dental examination (photo, confirmed by officer): face swollen or red on the left side (cheek); mouth opens normally (3 fingers); ' +
      'no sores or blisters in the mouth; gums red, swollen, bleeding or with pus (swollen gum lower left); no broken or missing teeth seen; ' +
      'black or brown teeth (lower left molar).', d);
}

console.log('joint and local injury protocols');
{
  const joint = getProtocol(23)!;
  const injury = getProtocol(27)!;
  check('same compare-sides shot in both',
    getShot(joint, 'compare-sides')!.answers.join() === '1,2,3' && getShot(injury, 'compare-sides')!.answers.join() === '1,2');
  const j = renderExamSentence(23, [
    { questionNumber: 1, value: 'yes', side: 'right' },
    { questionNumber: 2, value: 'no' },
    { questionNumber: 3, value: 'no' },
  ]);
  check('joint sentence',
    j === 'Joint examination (photo, confirmed by officer): swelling of the joint on the right side, compared with the healthy side; joint not red (warmth not assessed); joint not deformed.', j);
  const i = renderExamSentence(27, [
    { questionNumber: 1, value: 'yes', side: 'left', detail: 'wrist bent' },
    { questionNumber: 2, value: 'yes', side: 'left', detail: 'swelling and bruising' },
  ]);
  check('local injury sentence',
    i === 'Local injury assessment (photo, confirmed by officer): injured part crooked, deformed or out of place on the left side (wrist bent); ' +
      'open wound, bruising or swelling on the left side (swelling and bruising).', i);
}

console.log('nose protocol');
{
  const nose = getProtocol(3)!;
  check('face photo Q1+Q4, nostrils Q2/Q7/Q8, throat photo Q6',
    getShot(nose, 'face-front')!.answers.join() === '1,4' &&
    getShot(nose, 'nostrils')!.answers.join() === '2,7,8' &&
    getShot(nose, 'throat')!.answers.join() === '6');
  check('officer-only questions have no photo question', !nose.questions[3] && !nose.questions[5] && !nose.questions[9]);
  const s = renderExamSentence(3, [
    { questionNumber: 1, value: 'yes', detail: 'nose bent to the left' },
    { questionNumber: 2, value: 'none' },
    { questionNumber: 4, value: 'yes', side: 'right' },
    { questionNumber: 6, value: 'no' },
    { questionNumber: 7, value: 'yes', side: 'both' },
    { questionNumber: 8, value: 'no' },
  ]);
  check('nose sentence',
    s === 'Nose check (photo, confirmed by officer): swelling, bruising or deformity of the nose (nose bent to the left); ' +
      'no redness or yellow secretion at the nose; active nosebleed from the right nostril; no blood in the mouth or throat; ' +
      'crusts or clots in both nostrils; no foreign body seen in the nose.', s);
}

console.log('abdomen and neurologic protocols');
{
  const abdomen = getProtocol(8)!;
  const pain = getProtocol(22)!;
  const simple = getProtocol(6)!;
  const advanced = getProtocol(7)!;
  check('abdomen photo shared by Abdomen examination and Abdominal pain exam',
    getShot(abdomen, 'abdomen')!.answers.join() === '1,2' && getShot(pain, 'abdomen')!.answers.join() === '1');
  check('same face-symmetry shots in simple and advanced neuro',
    ['smile', 'show-teeth', 'raise-eyebrows'].every((id) => !!getShot(simple, id) && !!getShot(advanced, id)));
  check('advanced Q4 uses the eye photo', getShot(advanced, 'eyes-front')!.answers.join() === '4');
  check('eye examination shot unchanged', getShot(getProtocol(2)!, 'eyes-front')!.answers.join() === '1,2,3,4,5');

  const s = renderExamSentence(6, [
    { questionNumber: 1, value: 'no', side: 'left' },
    { questionNumber: 2, value: 'no', side: 'left' },
    { questionNumber: 3, value: 'yes' },
  ]);
  check('simple neuro sentence',
    s === 'Simple neurologic check (photo, confirmed by officer): face not symmetrical when smiling (left side droops); ' +
      'face not symmetrical when showing the teeth (left side droops); face symmetrical when raising the eyebrows.', s);
  const a = renderExamSentence(7, [
    { questionNumber: 4, value: 'no', side: 'right' },
    { questionNumber: 11, value: 'yes', detail: 'bite mark on the left side of the tongue' },
  ]);
  check('advanced neuro sentence',
    a === 'Advanced neurologic check (photo, confirmed by officer): pupils not similar in size or not round (right larger or irregular); ' +
      'wounds on the tongue or lips (bite mark on the left side of the tongue).', a);
  const b = renderExamSentence(8, [
    { questionNumber: 1, value: 'yes' }, { questionNumber: 2, value: 'yes', detail: 'appendectomy scar right lower belly' }, { questionNumber: 3, value: 'no' },
  ]);
  check('abdomen sentence',
    b === 'Abdomen examination (photo, confirmed by officer): belly swollen or distended; scars, surgical wounds or lumps on the belly ' +
      '(appendectomy scar right lower belly); does not look pale or unwell.', b);
}

console.log('withPhotoFindings');
{
  const batch = { name: 'findings', prompt: 'Rules...\nReturn JSON:\n{"exam":""}' };
  const out = withPhotoFindings(batch, 'Eye examination (photo, confirmed by officer): pupils round.');
  check('block inserted before Return JSON', out.prompt.includes('ALREADY RECORDED FROM PHOTOS') &&
    out.prompt.indexOf('ALREADY RECORDED') < out.prompt.indexOf('Return JSON:'));
  check('Return JSON kept exactly once', out.prompt.split('Return JSON:').length === 2);
  check('no photos → batch unchanged', withPhotoFindings(batch, '') === batch);
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nall passed');
