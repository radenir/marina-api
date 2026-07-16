// Reproduce the "report forgets orientation" bug: a long dictation where the
// advanced-neuro answers are spread out (orientation EARLY, rest later). Each
// "Update report" re-extracts from the full transcript, so any finding the
// model drops is "forgotten" in the app. Measure per-finding capture rates.
//
// Run: cd marina-api && node_modules/.bin/tsx scripts/test-findings-completeness.ts [reps]
import 'dotenv/config';
import { findingsBatchFor } from '../src/lib/medicalExtractV2.js';
import { chatWithFallback } from '../src/lib/llmFallback.js';
import { config } from '../src/config.js';
import { ovh } from '../src/lib/ovh.js';

const REPS = parseInt(process.argv[2] ?? '6', 10);

// Mimics the user's session: headache + fever, neuro answers spread over ~3
// minutes of dictation with vitals and investigations in between.
const TRANSCRIPT = `USER: Marina, this is the second officer. The patient is a motorman with a bad headache since this morning, he rates it 7 out of 10, mostly on the right side. His temperature is 39. He knows his own name, he knows he is on the ship and he knows today's date, so orientation is fine. His speech is clear, no slurring at all.

I also asked about his medical history — no previous illnesses, no operations, takes no medicines, no allergies.

Now the eyes. The pupils are equal in size and shape, both round. When I shine the torch in, the pupils do not get smaller — they stay the same, that seems wrong. His eye movements are smooth when he follows my finger, no jerky movements, and he can follow my finger with his eyes without any problem.

I did the blood test for infection, the C-reactive protein, it came back normal. Blood sugar also normal.

One more thing on the examination — when he smiles, both sides of his face move the same, the smile is symmetric. And I showed him my pen and he named it correctly straight away.`;

// The findings that MUST survive every extraction, wherever they were said.
const EXPECTED: Array<[string, RegExp]> = [
  ['orientation',      /orient|knows (his )?(own )?name|name.*(location|where|place|ship).*(date|day)/i],
  ['speech',           /speech.*(clear|no slur)|no slurring/i],
  ['pupils-equal',     /pupils?.*(equal|round|same size)/i],
  ['pupils-no-react',  /pupils?.*(do not|don't|not).*(constrict|react|smaller|shrink)|no (pupil )?reaction to light/i],
  ['eye-movement',     /eye movement|follow.*finger|smooth.*(pursuit|movement)/i],
  ['face-symmetry',    /symmetr|both sides.*(face|smile)|smile.*(even|same|symmetric)/i],
  ['naming-object',    /named?.*(pen|object|item|correctly)/i],
];

async function runFindings(prompt: string): Promise<Record<string, string>> {
  const completion = await chatWithFallback(
    {
      temperature: 0.3, max_tokens: 1500, reasoning_effort: 'low',
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: TRANSCRIPT }],
    } as any,
    { primaryModel: config.nebius.extractV2Model, timeoutMs: 10000, backupClient: ovh, backupModel: config.ovh.model },
  );
  let raw = completion.choices[0]?.message?.content?.trim() ?? '{}';
  raw = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(raw); } catch { return {}; }
}

async function main() {
  console.log(`model=${config.nebius.extractV2Model} reps=${REPS}\n`);
  const prompt = findingsBatchFor('Headache').prompt;

  const counts = new Map<string, number>(EXPECTED.map(([k]) => [k, 0]));
  const outputs: string[] = [];
  const runs = await Promise.all(Array.from({ length: REPS }, () => runFindings(prompt)));
  runs.forEach((out, i) => {
    const exam = (out.exam ?? '').toString();
    outputs.push(`rep${i + 1}: ${JSON.stringify(exam)}`);
    for (const [key, rx] of EXPECTED) {
      if (rx.test(exam)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  });

  outputs.forEach((o) => console.log(o + '\n'));
  console.log('================ CAPTURE RATES ================');
  for (const [key, n] of counts) console.log(`${key}: ${n}/${REPS}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
