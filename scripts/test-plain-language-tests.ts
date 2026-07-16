// 1) Judge: "Blood test for infection shows no infection" must credit the CRP
//    rule (was scored 0% — the exact screenshot case).
// 2) Extraction: plain-spoken test results get the canonical name, stably.
import 'dotenv/config';
import { scoreInvestigations } from '../src/lib/investigationScore.js';
import { findingsBatchFor } from '../src/lib/medicalExtractV2.js';
import { chatWithFallback } from '../src/lib/llmFallback.js';
import { config } from '../src/config.js';
import { ovh } from '../src/lib/ovh.js';

const REPS = parseInt(process.argv[2] ?? '4', 10);

async function main() {
  console.log('================ JUDGE: plain-language credit ================');
  for (let r = 1; r <= REPS; r++) {
    const res = await scoreInvestigations({
      documentation: 'Blood test for infection shows no infection.',
      pathway: 'Headache',
      temperatureCelsius: '38.9',
      gender: 'male',
      caseSummary: 'Severe headache since this morning, right side, 7 out of 10. Temperature 38.9.',
    });
    const crp = res.facets?.find((f) => /crp/i.test(f.investigation));
    const ok = crp?.status === 'complete';
    console.log(`rep${r} ${ok ? 'PASS' : 'FAIL'} score=${res.score} CRP=${crp?.status} suggestion=${JSON.stringify(res.suggestion)}`);
  }

  console.log('\n================ EXTRACTION: canonical naming ================');
  const TRANSCRIPT = `USER: the patient has a bad headache since this morning 7 out of 10 temperature is 38.9 he is alert I did the blood test for infection and it shows no infection all clear`;
  const prompt = findingsBatchFor('Headache').prompt;
  for (let r = 1; r <= REPS; r++) {
    const completion = await chatWithFallback(
      { temperature: 0.3, max_tokens: 1500, reasoning_effort: 'low', response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: prompt }, { role: 'user', content: TRANSCRIPT }] } as any,
      { primaryModel: config.nebius.extractV2Model, timeoutMs: 10000, backupClient: ovh, backupModel: config.ovh.model },
    );
    let raw = completion.choices[0]?.message?.content?.trim() ?? '{}';
    raw = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    let inv = ''; try { inv = (JSON.parse(raw).investigations ?? '').toString(); } catch {}
    const ok = /c-?reactive|crp/i.test(inv) && /negative|no infection|normal/i.test(inv);
    console.log(`rep${r} ${ok ? 'PASS' : 'FAIL'} investigations=${JSON.stringify(inv)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
