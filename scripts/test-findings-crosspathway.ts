// Same neuro-heavy transcript, but extracted with the WRONG pathway checklist
// (Fever → infection focus) — does the checklist bias drop neuro findings?
import 'dotenv/config';
import { findingsBatchFor } from '../src/lib/medicalExtractV2.js';
import { chatWithFallback } from '../src/lib/llmFallback.js';
import { config } from '../src/config.js';
import { ovh } from '../src/lib/ovh.js';

const TRANSCRIPT = `USER: Marina, this is the second officer. The patient is a motorman with a bad headache since this morning, he rates it 7 out of 10, mostly on the right side. His temperature is 39. He knows his own name, he knows he is on the ship and he knows today's date, so orientation is fine. His speech is clear, no slurring at all.

I also asked about his medical history — no previous illnesses, no operations, takes no medicines, no allergies.

Now the eyes. The pupils are equal in size and shape, both round. When I shine the torch in, the pupils do not get smaller — they stay the same, that seems wrong. His eye movements are smooth when he follows my finger, no jerky movements, and he can follow my finger with his eyes without any problem.

I did the blood test for infection, the C-reactive protein, it came back normal. Blood sugar also normal.

One more thing on the examination — when he smiles, both sides of his face move the same, the smile is symmetric. And I showed him my pen and he named it correctly straight away.`;

const EXPECTED: Array<[string, RegExp]> = [
  ['orientation',      /orient|knows (his )?(own )?name/i],
  ['speech',           /speech.*(clear|no slur)|no slurring/i],
  ['pupils-equal',     /pupils?.*(equal|round|same size)/i],
  ['pupils-no-react',  /pupils?.*(do not|don't|not|non).*(constrict|react|smaller|shrink)|stay the same/i],
  ['eye-movement',     /eye movement|follow.*finger/i],
  ['face-symmetry',    /symmetr|both sides/i],
  ['naming-object',    /named?.*(pen|object|item|correctly)/i],
];

async function run(prompt: string): Promise<string> {
  const completion = await chatWithFallback(
    { temperature: 0.3, max_tokens: 1500, reasoning_effort: 'low', response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: TRANSCRIPT }] } as any,
    { primaryModel: config.nebius.extractV2Model, timeoutMs: 10000, backupClient: ovh, backupModel: config.ovh.model },
  );
  let raw = completion.choices[0]?.message?.content?.trim() ?? '{}';
  raw = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
  try { return (JSON.parse(raw).exam ?? '').toString(); } catch { return ''; }
}

async function main() {
  for (const pathway of ['Fever', 'Unspecific Symptoms']) {
    const prompt = findingsBatchFor(pathway).prompt;
    const runs = await Promise.all(Array.from({ length: 4 }, () => run(prompt)));
    console.log(`\n===== checklist: ${pathway} =====`);
    const counts = new Map(EXPECTED.map(([k]) => [k, 0]));
    runs.forEach((exam, i) => {
      console.log(`rep${i + 1}: ${JSON.stringify(exam.slice(0, 220))}`);
      for (const [k, rx] of EXPECTED) if (rx.test(exam)) counts.set(k, (counts.get(k) ?? 0) + 1);
    });
    for (const [k, n] of counts) console.log(`  ${k}: ${n}/4`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
