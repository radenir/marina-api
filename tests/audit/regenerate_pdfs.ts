/**
 * Regenerate every report.pdf under tests/reports/ from its captured
 * summary.json using the LOCAL seafarer mapper + filler. Used to re-render the
 * audit evidence after a mapper fix without re-running interviews or calling the
 * (possibly older) deployed API. Run from the repo root: the filler resolves the
 * template via process.cwd().
 */
import * as fs from 'fs';
import * as path from 'path';
import { mapSummaryToSeafarerFields } from '../../src/lib/seafarerMapper.js';
import { fillSeafarerForm } from '../../src/lib/seafarerPdf.js';

async function main() {
  const reportsDir = path.join(process.cwd(), 'tests/reports');
  const dirs = fs.readdirSync(reportsDir).filter((d) => /^\d+_/.test(d)).sort();

  let ok = 0;
  for (const d of dirs) {
    const sp = path.join(reportsDir, d, 'summary.json');
    if (!fs.existsSync(sp)) continue;
    const summary = JSON.parse(fs.readFileSync(sp, 'utf8'));
    const out = path.join(reportsDir, d, 'report.pdf');
    await fillSeafarerForm(mapSummaryToSeafarerFields(summary), out);
    ok++;
    console.log(`  regenerated ${d}/report.pdf`);
  }
  console.log(`\n${ok} PDFs regenerated from local code.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
