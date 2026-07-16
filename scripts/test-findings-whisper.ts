// Realistic Whisper-style transcript: run-on 5s fragments, fillers, boundary
// repeats, garbles ("Sphere P" = CRP). Orientation is said EARLY and casually.
import 'dotenv/config';
import { findingsBatchFor } from '../src/lib/medicalExtractV2.js';
import { chatWithFallback } from '../src/lib/llmFallback.js';
import { config } from '../src/config.js';
import { ovh } from '../src/lib/ovh.js';

const REPS = parseInt(process.argv[2] ?? '6', 10);

const TRANSCRIPT = `USER: okay so marina this is the second officer we have the motorman here he has a bad headache since this morning about 7 out of 10 on the on the right side temperature is 39 so I asked him some questions he knows his name he knows he's on the ship and he knows what day it is so that's all fine and his speech is clear no slurring okay so no previous illnesses no operations no medicines no allergies nothing like that now the eyes so the pupils they are equal both round same size when I shine the light in they don't get smaller they just stay the same which seems wrong to me eye movements are smooth he follows my finger no jerky movements no problem there okay I did the blood test the the sphere P test it came back normal blood sugar normal as well and when he smiles both sides of the face move the same it's symmetric and I showed him my pen and he said pen right away no problem so yeah that's where we are I will do the the swallow check next and call back`;

const EXPECTED: Array<[string, RegExp]> = [
  ['orientation',      /orient|knows (his )?(own )?name/i],
  ['speech',           /speech.*(clear|no slur)|no slurring/i],
  ['pupils-equal',     /pupils?.*(equal|round|same size)/i],
  ['pupils-no-react',  /pupils?.*(do not|don't|not|non).*(constrict|react|smaller|shrink)|stay the same|no (pupil|light) (reaction|response)/i],
  ['eye-movement',     /eye movement|extraocular|follow.*finger/i],
  ['face-symmetry',    /symmetr|both sides/i],
  ['naming-object',    /nam(ed|es|ing)?.*(pen|object|item|correctly)|said pen/i],
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
  const prompt = findingsBatchFor('Headache').prompt;
  const counts = new Map(EXPECTED.map(([k]) => [k, 0]));
  const runs = await Promise.all(Array.from({ length: REPS }, () => run(prompt)));
  runs.forEach((exam, i) => {
    console.log(`rep${i + 1}: ${JSON.stringify(exam)}\n`);
    for (const [k, rx] of EXPECTED) if (rx.test(exam)) counts.set(k, (counts.get(k) ?? 0) + 1);
  });
  console.log('================ CAPTURE RATES ================');
  for (const [k, n] of counts) console.log(`${k}: ${n}/${REPS}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
