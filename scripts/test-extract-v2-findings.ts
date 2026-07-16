// A/B: does injecting the SYBRA pathway's examination questions + test list
// into the findings batch help gpt-oss-120b recognise terse spoken answers
// ("colour came back in two seconds" = capillary refill)? Also guards that the
// checklist never leaks into the output for undone items.
//
// Run: cd marina-api && node_modules/.bin/tsx scripts/test-extract-v2-findings.ts [reps]
import 'dotenv/config';
import { findingsBatchFor, parallelExtractV2 } from '../src/lib/medicalExtractV2.js';
import { chatWithFallback } from '../src/lib/llmFallback.js';
import { config } from '../src/config.js';
import { ovh } from '../src/lib/ovh.js';

const REPS = parseInt(process.argv[2] ?? '3', 10);

async function runBatch(text: string, prompt: string): Promise<Record<string, string>> {
  const completion = await chatWithFallback(
    {
      temperature: 0.3, max_tokens: 1500, reasoning_effort: 'low',
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: text }],
    } as any,
    { primaryModel: config.nebius.extractV2Model, timeoutMs: 10000, backupClient: ovh, backupModel: config.ovh.model },
  );
  let raw = completion.choices[0]?.message?.content?.trim() ?? '{}';
  raw = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(raw); } catch { return {}; }
}

interface Case {
  id: string;
  pathway: string;
  text: string;
  expect: Record<string, RegExp[]>;   // every regex must match
  forbid?: Record<string, RegExp>;
}

const CASES: Case[] = [
  {
    id: 'abdo-terse-answers',
    pathway: 'Abdominal Pain',
    text: `USER: The patient has bad stomach pain on the lower right side since yesterday. I pressed on his fingernail and the colour came back after about two seconds. He looks pale and tired and lies very still. When I press on the right side of his belly and let go quickly, the pain gets much worse. The urine stick was all clear, and the malaria test showed just the one line.`,
    expect: {
      exam: [/capillary refill|colou?r return|2 seconds|two seconds/i, /rebound/i, /pale/i],
      investigations: [/dipstick|urine/i, /malaria/i, /negative/i],
    },
  },
  {
    id: 'eye-terse-answers',
    pathway: 'Eye Pain',
    text: `USER: His right eye has been hurting since this morning. Both pupils are round and the same size, and they get smaller when I shine my torch in. He counted my fingers from a meter away with no problem. There is some redness around the coloured part of the right eye but no discharge. I pulled the lids back and there is nothing stuck in there.`,
    expect: {
      exam: [/pupils?.*(round|equal|same size)/i, /finger|vision|count/i, /redness/i, /foreign body|nothing (stuck|found)|no foreign/i],
    },
  },
  {
    id: 'no-exam-done-guard',
    pathway: 'Abdominal Pain',
    text: `USER: The patient is an oiler with stomach pain since this morning, about 6 out of 10, around his belly button. He also feels nauseous. I have not had a chance to examine him yet, I will call back with more details.`,
    expect: { exam: [/^$/], investigations: [/^$/] },
    forbid: { exam: /capillary|dipstick|not (performed|done|assessed)/i, investigations: /CRP|pregnancy|malaria|not (performed|done)/i },
  },
];

async function main() {
  console.log(`model=${config.nebius.extractV2Model} reps=${REPS}\n`);
  const plainPrompt = findingsBatchFor(null).prompt;

  for (const c of CASES) {
    const enrichedPrompt = findingsBatchFor(c.pathway).prompt;
    if (enrichedPrompt === plainPrompt) throw new Error(`no enrichment for ${c.pathway}`);
    for (const [variant, prompt] of [['PLAIN   ', plainPrompt], ['ENRICHED', enrichedPrompt]] as const) {
      let pass = 0, total = 0;
      const notes: string[] = [];
      const runs = await Promise.all(Array.from({ length: REPS }, () => runBatch(c.text, prompt)));
      runs.forEach((out, r) => {
        for (const [field, rxs] of Object.entries(c.expect)) {
          const v = (out[field] ?? '').toString();
          for (const rx of rxs) {
            total++;
            if (rx.test(v)) pass++;
            else notes.push(`  rep${r + 1} MISS ${field} ${rx} → ${JSON.stringify(v.slice(0, 160))}`);
          }
        }
        for (const [field, rx] of Object.entries(c.forbid ?? {})) {
          const v = (out[field] ?? '').toString();
          total++;
          if (!rx.test(v)) pass++;
          else notes.push(`  rep${r + 1} LEAK ${field} → ${JSON.stringify(v.slice(0, 160))}`);
        }
      });
      console.log(`${c.id} ${variant} ${pass}/${total}`);
      notes.forEach((n) => console.log(n));
    }
    console.log('');
  }

  // End-to-end: pathway detection wiring + latency through parallelExtractV2.
  console.log('================ FULL PIPELINE (wiring + latency) ================');
  const t0 = Date.now();
  const full = await parallelExtractV2([{ role: 'user', content: CASES[0].text }]);
  console.log(`latency=${Date.now() - t0}ms chiefSymptom=${JSON.stringify(full.chiefSymptom)}`);
  console.log(`exam=${JSON.stringify(full.exam)}`);
  console.log(`investigations=${JSON.stringify(full.investigations)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
