// Investigations completeness: several test results spread across a long
// Whisper-style transcript (dipstick EARLY, others later) — do all survive
// every extraction, and stay out of `exam`?
import 'dotenv/config';
import { findingsBatchFor } from '../src/lib/medicalExtractV2.js';
import { chatWithFallback } from '../src/lib/llmFallback.js';
import { config } from '../src/config.js';
import { ovh } from '../src/lib/ovh.js';

const REPS = parseInt(process.argv[2] ?? '6', 10);

const TRANSCRIPT = `USER: okay marina second officer here the patient is our messman he has stomach pain since last night lower right side maybe 7 out of 10 first thing I did was the urine test the dipstick it was all clear nothing in it no blood no white cells okay then I talked to him some more he vomited once no diarrhea no fever feeling when I touched him though the thermometer says 38.4 so I checked his belly it is soft but it hurts when I press down on the right side and when I let go quickly it hurts even more he lies very still doesn't want to move around okay then I did the blood sugar it was 5.8 so that's normal and because of the temperature I also ran the the blood test for infection the CRP and that came back at 48 which is high I think and last thing because he was in Nigeria last month I did the malaria test just now it shows one line so negative`;

const INV_EXPECTED: Array<[string, RegExp]> = [
  ['dipstick-early',  /dipstick|urine/i],
  ['blood-sugar',     /blood (sugar|glucose)|5\.8/i],
  ['crp-result',      /c-?reactive|infection.*48|crp|48/i],
  ['malaria',         /malaria/i],
];
const EXAM_EXPECTED: Array<[string, RegExp]> = [
  ['tender',   /tender|hurts.*press/i],
  ['rebound',  /rebound|let(ting)? go/i],
];

async function run(prompt: string): Promise<{ inv: string; exam: string }> {
  const completion = await chatWithFallback(
    { temperature: 0.3, max_tokens: 1500, reasoning_effort: 'low', response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: TRANSCRIPT }] } as any,
    { primaryModel: config.nebius.extractV2Model, timeoutMs: 10000, backupClient: ovh, backupModel: config.ovh.model },
  );
  let raw = completion.choices[0]?.message?.content?.trim() ?? '{}';
  raw = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
  try { const p = JSON.parse(raw); return { inv: (p.investigations ?? '').toString(), exam: (p.exam ?? '').toString() }; }
  catch { return { inv: '', exam: '' }; }
}

async function main() {
  const prompt = findingsBatchFor('Abdominal Pain').prompt;
  const counts = new Map<string, number>([...INV_EXPECTED, ...EXAM_EXPECTED].map(([k]) => [k, 0]));
  const runs = await Promise.all(Array.from({ length: REPS }, () => run(prompt)));
  runs.forEach((out, i) => {
    console.log(`rep${i + 1} inv : ${JSON.stringify(out.inv)}`);
    console.log(`rep${i + 1} exam: ${JSON.stringify(out.exam)}\n`);
    for (const [k, rx] of INV_EXPECTED) if (rx.test(out.inv)) counts.set(k, (counts.get(k) ?? 0) + 1);
    for (const [k, rx] of EXAM_EXPECTED) if (rx.test(out.exam)) counts.set(k, (counts.get(k) ?? 0) + 1);
  });
  console.log('================ CAPTURE RATES ================');
  for (const [k, n] of counts) console.log(`${k}: ${n}/${REPS}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
