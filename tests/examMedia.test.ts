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
import { getProtocol, getShot, renderExamSentence } from '../src/lib/examMediaProtocols.js';
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
