/**
 * Prove the Fleet Activity Summary renders whatever real data throws at it.
 *
 * The first production render died on `WinAnsi cannot encode "→"` — an arrow in
 * this report's own language-pair labels. The demo fixture had no language
 * mismatches, so nothing caught it locally, and the customer got a JSON error
 * where a PDF should have been.
 *
 * pdf-lib's standard Helvetica is WinAnsi-encoded and THROWS on anything
 * outside CP1252 rather than substituting, so every string drawn on this page
 * is a potential 500. This walks the characters that actually turn up in a
 * maritime fleet: Polish and Czech crew names, Nordic vessel names, Turkish
 * ports, and non-Latin scripts.
 *
 *   npx tsx tests/e2e/verify-fleet-pdf.ts
 *
 * Reads no database and no .env.
 */

import { buildFleetReportPdf } from '../../src/lib/fleetReportPdf';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BASE: any = {
  organisation: 'Test Fleet',
  by_month: [{ month: '2026-08', sessions: 10, substantive: 4, reports: 6, red_flags: 1 }],
  by_vessel: [{ vessel_name: 'Test', sessions: 10, red_flags: 1 }],
  by_language: [{ language: 'English', n: 10 }],
  by_pathway: [{ pathway: 'Headache', n: 4 }],
  by_mode: [{ mode: 'marina', n: 10 }],
  by_hour: [{ hour: 9, n: 10 }],
  by_port: [],
  by_destination: [],
  by_urgency: [{ urgency: 'low', n: 6, mews_0_1: 6, mews_2_3: 0, mews_4_plus: 0 }],
  language_pairs: [],
  duration: { n: 4, median_minutes: '2.0', p25_minutes: '1.0', p75_minutes: '5.0' },
  demographics: {
    age: { items: [], suppressed: 0, recorded: 0 },
    sex: { items: [], suppressed: 0, recorded: 0 },
    rank: { items: [], suppressed: 0, recorded: 0 },
    nationality: { items: [], suppressed: 0, recorded: 0 },
    min_cell: 5,
  },
  abnormal: { any_abnormal: 2 },
  operational: {
    language_known: 10, language_gap: 0, with_vitals: 3, distinct_presentations: 4,
    vital_pulse: 3, vital_bp: 3, vital_resp: 2, vital_spo2: 2, vital_temp: 3,
    history_past: 2, history_allergies: 5, history_medications: 5,
    pdfs_generated: 1, pdfs_emailed: 0, unidentified_reports: 3,
  },
  totals: { sessions: 10, vessels: 1, substantive: 4, reports: 6, red_flags: 1, classified: 4 },
  as_of: new Date().toISOString(),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CASES: [string, (r: any) => void][] = [
  ['plain ASCII throughout', () => {}],
  [
    'language pairs (the arrow that broke production)',
    (r) => {
      r.language_pairs = [
        { officer_language: 'Danish', patient_language: 'Polish', n: 10 },
        { officer_language: 'English', patient_language: 'Danish', n: 5 },
      ];
      r.operational.language_gap = 15;
    },
  ],
  ['Nordic vessel names (æ ø å)', (r) => {
    r.by_vessel = [{ vessel_name: 'Esvagt Bøjle Håkon', sessions: 9, red_flags: 0 }];
  }],
  ['Polish crew and ports (ń ł ś ż)', (r) => {
    r.by_vessel = [{ vessel_name: 'Gdańsk Wisła', sessions: 9, red_flags: 0 }];
    r.by_port = [{ port: 'Świnoujście', n: 4 }];
    r.demographics.nationality = { items: [{ label: 'Polish', n: 6 }], suppressed: 0, recorded: 6 };
  }],
  ['Czech / Turkish / German (č ř ğ ü ß)', (r) => {
    r.by_port = [{ port: 'Çanakkale', n: 3 }, { port: 'Großenbrode', n: 3 }];
    r.by_vessel = [{ vessel_name: 'Přerov', sessions: 9, red_flags: 0 }];
  }],
  ['non-Latin script (Chinese, Arabic, Greek)', (r) => {
    r.demographics.nationality = {
      items: [{ label: '中文', n: 6 }, { label: 'العربية', n: 5 }, { label: 'Ελληνικά', n: 5 }],
      suppressed: 0, recorded: 16,
    };
  }],
  ['typographic punctuation in a vessel name', (r) => {
    r.by_vessel = [{ vessel_name: 'M/V “Nordlys” — no. 1…', sessions: 9, red_flags: 0 }];
  }],
  ['an organisation name with accents', (r) => { r.organisation = 'Rederiet Æbeløy A/S'; }],
  ['empty fleet — nothing recorded at all', (r) => {
    r.by_month = []; r.by_vessel = []; r.by_language = []; r.by_pathway = [];
    r.by_mode = []; r.by_urgency = [];
    r.totals = { sessions: 0, vessels: 0, substantive: 0, reports: 0, red_flags: 0, classified: 0 };
  }],
  ['very long labels that must clip, not overflow', (r) => {
    r.by_vessel = [{
      vessel_name: 'Esvagt Something Extremely Long Indeed That Will Not Fit In The Column',
      sessions: 9, red_flags: 3,
    }];
    r.by_pathway = [{ pathway: 'Anaphylaxis and Allergic Reactions of an Unusually Long Kind', n: 4 }];
  }],
  ['enough rows to force a page break', (r) => {
    r.by_vessel = Array.from({ length: 40 }, (_, i) => ({
      vessel_name: `Vessel ${i + 1}`, sessions: 40 - i, red_flags: 0,
    }));
  }],
];

async function main() {
  let failures = 0;
  console.log('\nFleet PDF — content the renderer must survive\n');

  for (const [name, mutate] of CASES) {
    const r = JSON.parse(JSON.stringify(BASE));
    mutate(r);
    try {
      const bytes = await buildFleetReportPdf(r);
      if (!bytes || bytes.length < 1000) throw new Error(`suspiciously small: ${bytes?.length} bytes`);
      console.log(`  ok    ${name}  (${(bytes.length / 1024).toFixed(1)} KB)`);
    } catch (err) {
      failures++;
      console.log(`  FAIL  ${name}\n        ${(err as Error).message}`);
    }
  }

  console.log(
    failures === 0
      ? `\nALL PASS — ${CASES.length} cases rendered`
      : `\n${failures} FAILURE(S) of ${CASES.length}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('fatal:', (err as Error).message);
  process.exit(1);
});
