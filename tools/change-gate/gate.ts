// Change-record gate (SOP Change Management, IEC 62304 ch. 9; CAPA-1).
//
// Runs as a git pre-push hook in the four Marina repositories. Before anything
// reaches `main` on GitHub, every commit not yet recorded must be:
//   1. classified by Claude (change / bug fix / no product effect, Q1–Q10),
//   2. confirmed by the QMO (terminal prompt, or a one-time code when the push
//      runs without a terminal, e.g. inside Claude Code),
//   3. written to the Formwork records "CHM - Change Evaluation List" and
//      "CHM - Bug Fixes Documentation List" (as amendments with a comment).
// A change rated significant blocks the push: it needs a new UDI-DI first.
//
// State lives outside the repositories in ~/.marina-change-gate/:
//   baselines.json   origin/main per repository when the gate was installed
//                    (everything before it is covered by the retrospective
//                    evaluation of 2026-11-15)
//   ledger.jsonl     one line per recorded commit
//   pending/*.json   the proposal waiting for confirmation
//
// Run with: node tools/change-gate/gate.ts   (Node >= 23, type stripping)

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, rmSync, writeFileSync, closeSync, writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const STATE = join(homedir(), '.marina-change-gate');
const LEDGER = join(STATE, 'ledger.jsonl');
const BASELINES = join(STATE, 'baselines.json');
const PENDING_DIR = join(STATE, 'pending');

const CHANGE_LIST_ID = '03ea9b8e-710c-4f80-8c4d-dc982b42dfd5'; // CHM - Change Evaluation List
const BUG_LIST_ID = 'f3227e89-462f-4214-b7a6-10f40b577875';    // CHM - Bug Fixes Documentation List
const QMO = 'Adrian Radomski';

// Which repository is which, by GitHub name.
const REPOS: Record<string, string> = {
  'marina-api': 'API',
  'eu.marinahealth.eu': 'Web',
  'marina-ios-app': 'iOS',
  'marina-android-app': 'Android',
};

// Never sent to the model.
const SECRET_PATH = /(^|\/)(\.env[^/]*|.*\.(pem|key|p12|jks|keystore|mobileprovision)|google-services\.json|GoogleService-Info\.plist)$/i;
const SKIP_DIFF = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.(png|jpe?g|gif|webp|pdf|mp4|mov|ttf|otf|woff2?|ico|zip)|\.pbxproj)$/i;

type Item = {
  commits: string[];
  date: string;
  category: 'change' | 'bug_fix' | 'no_product_effect';
  description: string;
  yes_in: string[];
  outcome: 'Not significant' | 'Significant' | '';
  rationale: string;
  corrective_action?: string;
  area?: string;
};
type Proposal = { repo: string; software: string; commits: string[]; items: Item[] };

// ---------------------------------------------------------------------------

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}
function readJson<T>(p: string, fallback: T): T {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
}
function ledgerCommits(repo: string): Set<string> {
  if (!existsSync(LEDGER)) return new Set();
  const s = new Set<string>();
  for (const line of readFileSync(LEDGER, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line); if (e.repo === repo) s.add(e.commit); } catch { /* skip */ }
  }
  return s;
}
function say(msg: string) { process.stderr.write(msg + '\n'); }
function fail(msg: string): never { say(`\n✖ change gate: ${msg}\n`); process.exit(1); }

/** Ask on the terminal. Returns null when there is no terminal (e.g. inside Claude Code). */
function ask(question: string): string | null {
  let fd: number;
  try { fd = openSync('/dev/tty', 'r+'); } catch { return null; }
  try {
    writeSync(fd, question);
    const buf = Buffer.alloc(256);
    const n = readSync(fd, buf, 0, 256, null);
    return buf.subarray(0, n).toString('utf8').trim();
  } finally { closeSync(fd); }
}

function claude(prompt: string, tools: string[]): string {
  const args = ['-p', '--output-format', 'json'];
  if (tools.length) args.push('--allowedTools', tools.join(','));
  const r = spawnSync('claude', args, { input: prompt, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000 });
  if (r.status !== 0) fail(`claude exited with ${r.status}: ${(r.stderr || '').slice(0, 500)}`);
  let out: any;
  try { out = JSON.parse(r.stdout); } catch { fail('claude returned no JSON envelope'); }
  if (out.is_error) fail(`claude reported an error: ${String(out.result).slice(0, 500)}`);
  return String(out.result ?? '');
}
function extractJson(text: string): any {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) fail('no JSON object in the model answer');
  return JSON.parse(text.slice(a, b + 1));
}

// ---------------------------------------------------------------------------

function commitContext(cwd: string, sha: string): string {
  const meta = git(cwd, 'show', '-s', '--format=commit %h%nDate: %ad%nSubject: %s%n%b', '--date=short', sha);
  const files = git(cwd, 'show', '--format=', '--numstat', sha).split('\n').filter(Boolean);
  const listed = files.map((l) => { const [a, d, f] = l.split('\t'); return `  ${f} (+${a} -${d})`; }).join('\n');
  const diffPaths = files.map((l) => l.split('\t')[2]).filter((f) => f && !SECRET_PATH.test(f) && !SKIP_DIFF.test(f));
  let diff = diffPaths.length ? git(cwd, 'show', '--format=', '--unified=2', sha, '--', ...diffPaths) : '';
  const lines = diff.split('\n');
  if (lines.length > 400) diff = lines.slice(0, 400).join('\n') + `\n… (${lines.length - 400} more diff lines cut)`;
  return `${meta}\nFiles:\n${listed}\n\nDiff:\n${diff}`;
}

function classify(p: Proposal, cwd: string): Item[] {
  const contexts = p.commits.map((c) => commitContext(cwd, c)).join('\n\n========================================\n\n');
  const prompt = `You prepare change records for Marina, an MDR class I medical device software (documentation aid for maritime medical officers; the officer is the author of every report, Marina only transfers what was said into the authority's form).

Classify the following ${p.commits.length} commit(s) of the ${p.software} repository (${p.repo}) that are about to be released to production.

Categories:
- "no_product_effect": does not change the released software's behaviour (documentation, regulatory files, tests only, tooling, CI, comments, internal scripts not deployed, marketing pages without device claims).
- "bug_fix": restores the specified behaviour (crash, error, wrong output, data loss, security patch, efficiency).
- "change": anything else that changes the released software.
Group commits that belong to the same change or the same bug into one item.

For every "change", answer the questions of MDCG 2020-3 Rev.1 and list the ones answered YES in "yes_in":
Q1 Does the change alter specifications provided in the Intended Use? (Chart A)
Q2 Does the change affect conformity with the General Safety and Performance Requirements?
Q3 Change of built-in control mechanisms, operating principles, source of energy or alarm systems? (Chart B)
Q4 Does it affect safety or performance and negatively affect the benefit/risk ratio? (Chart B)
Q5 New or major change of the operating system or of any component (e.g. major SOUP update, AI model replaced)? (Chart C)
Q6 New or modified architecture or database structure, change of an algorithm? (Chart C)
Q7 Replaces previously required user input by a closed-loop algorithm? (Chart C)
Q8 New user interface, medical feature, channel of interoperability or presentation of data? (Chart C)
Q9 Negatively affects the benefit/risk ratio? (Chart C)
Q10 Impacts the way medical data is read or interpreted by the user, such that treatment or diagnosis may be altered? (Chart C)
YES in Q1 or Q2 always means "Significant". For YES only in Q3–Q10, propose "Significant" unless the rationale clearly shows the change is a correction to specification (restores or improves specified behaviour; intended use, clinical algorithms and interpretation of medical data unchanged). Use these rationale phrases where they fit: "Correction to specification", "Bug fix", "Internal API change between own clients", "Clarified label, same values", "Usability improvement", "Existing function brought to <platform>", "Management analytics, not a medical function", "Operating efficiency". When unsure, propose "Significant" — the QMO decides.

For every "bug_fix": "description" = what went wrong (plain English, one sentence), "corrective_action" = what was changed, "area" = short area name (e.g. "AI interview", "Auth / security", "PDF report").
For "no_product_effect": give a one-line "rationale".

Write descriptions in plain English, one sentence, like: "RMD form carries associated symptoms, past history, M-EWS and ETA".

Answer with ONLY this JSON, no other text:
{"items":[{"commits":["<short hash>",...],"date":"YYYY-MM-DD (latest commit)","category":"change|bug_fix|no_product_effect","description":"...","yes_in":["Q5",...],"outcome":"Not significant|Significant|","rationale":"...","corrective_action":"...","area":"..."}]}
Every commit below must appear in exactly one item.

COMMITS:

${contexts}`;
  const out = extractJson(claude(prompt, []));
  const items: Item[] = out.items ?? [];
  const covered = new Set(items.flatMap((i) => i.commits.map((c) => c.slice(0, 7))));
  const missing = p.commits.filter((c) => !covered.has(c.slice(0, 7)));
  if (missing.length) fail(`the model left commits unclassified: ${missing.join(', ')} — run the push again`);
  return items;
}

function show(p: Proposal, token: string, file: string) {
  say(`\n━━━ Change records for ${p.software} (${p.commits.length} commit(s)) ━━━`);
  p.items.forEach((it, i) => {
    const head = it.category === 'change' ? `CHANGE — ${it.outcome || '?'}${it.yes_in.length ? ` (YES in ${it.yes_in.join(', ')})` : ''}`
      : it.category === 'bug_fix' ? 'BUG FIX' : 'no product effect (not recorded in Formwork)';
    say(`\n[${i + 1}] ${head}\n    ${it.description}\n    commits: ${it.commits.join(', ')}  date: ${it.date}`);
    if (it.category === 'bug_fix') say(`    corrective action: ${it.corrective_action}\n    area: ${it.area}`);
    if (it.rationale) say(`    rationale: ${it.rationale}`);
  });
  say(`\nProposal file: ${file}\nConfirmation code: ${token}`);
}

function writeToFormwork(p: Proposal): any {
  const changes = p.items.filter((i) => i.category === 'change');
  const bugs = p.items.filter((i) => i.category === 'bug_fix');
  if (!changes.length && !bugs.length) return { changes: {}, bugs: {} };
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Append confirmed change records to two Formwork records. Use only the Formwork tools. Do not change any existing row or text except the "Result" sentence described below.

Software column value: "${p.software}". Confirmed by the QMO (${QMO}) on ${today} through the change gate.

1. Record "CHM - Change Evaluation List" (record id ${CHANGE_LIST_ID}).${changes.length ? `
   Read it. Append one table row per change below, after the last PCR row, numbering on from the highest existing PCR-YYYY-NN (use the current year ${today.slice(0, 4)}; if the year changes, start at -01). Columns: Change Request ID | Date | Software | Description | Commits | YES in ("None" if empty) | Overall Evaluation Outcome ("**Significant**" in bold, "Not significant" plain) | Rationale.
   Then update the "**Result:**" sentence so the counts include the new rows (keep its wording style).
   Save with update_formwork_resource and amendment_comment: "Change gate: ${changes.length} change(s) of ${p.software} added before release, confirmed by the QMO (${QMO}), ${today}."
   Changes:
${JSON.stringify(changes, null, 2)}` : ' No changes this time — do not touch it.'}

2. Record "CHM - Bug Fixes Documentation List" (record id ${BUG_LIST_ID}).${bugs.length ? `
   Read it and find the table for ${p.software} (the section for this software; if none exists, add a section "## ${p.software}" in the same table format at the end, before any closing notes). Append one row per bug fix below, numbering on from the highest existing bug ID in the whole record with the same ID format. Fill the columns the table has from the data below (date, commits, bug description, corrective action, area); leave columns you have no data for empty.
   Save with update_formwork_resource and amendment_comment: "Change gate: ${bugs.length} bug fix(es) of ${p.software} added before release, confirmed by the QMO (${QMO}), ${today}."
   Bug fixes:
${JSON.stringify(bugs, null, 2)}` : ' No bug fixes this time — do not touch it.'}

When done, answer with ONLY this JSON: {"changes":{"<first commit of each change>":"PCR-...", ...},"bugs":{"<first commit of each bug fix>":"<bug id>", ...}}`;
  return extractJson(claude(prompt, ['mcp__formwork__read_formwork_resource', 'mcp__formwork__update_formwork_resource']));
}

// ---------------------------------------------------------------------------

function main() {
  const cwd = process.cwd();
  const remote = git(cwd, 'remote', 'get-url', 'origin');
  const repo = remote.replace(/\.git$/, '').split(/[/:]/).pop()!;
  const software = REPOS[repo];
  if (!software) process.exit(0); // not a Marina product repository

  const baselines = readJson<Record<string, string>>(BASELINES, {});
  // CHANGE_GATE_BASELINE / CHANGE_GATE_DRY_RUN: for testing the gate only.
  const baseline = process.env.CHANGE_GATE_BASELINE || baselines[repo];
  const dryRun = process.env.CHANGE_GATE_DRY_RUN === '1';
  if (!baseline) fail(`no baseline for ${repo} — run tools/change-gate/install.sh`);

  // Refs being pushed (git passes them on stdin). Only pushes to main are releases.
  const stdin = readFileSync(0, 'utf8');
  const tips = stdin.split('\n').map((l) => l.trim().split(/\s+/))
    .filter((f) => f.length === 4 && f[2] === 'refs/heads/main' && !/^0+$/.test(f[1]))
    .map((f) => f[1]);
  if (!tips.length) process.exit(0);

  const recorded = ledgerCommits(repo);
  const commits = [...new Set(tips.flatMap((t) => git(cwd, 'rev-list', '--reverse', '--no-merges', `${baseline}..${t}`).split('\n').filter(Boolean)))]
    .map((c) => c.slice(0, 7))
    .filter((c) => !recorded.has(c));
  if (!commits.length) process.exit(0);

  mkdirSync(PENDING_DIR, { recursive: true });
  const file = join(PENDING_DIR, `${repo}${dryRun ? '.dry-run' : ''}.json`);
  let p: Proposal | null = readJson<Proposal | null>(file, null);
  if (!p || p.commits.join() !== commits.join()) {
    say(`change gate: classifying ${commits.length} new commit(s) of ${software} with Claude…`);
    p = { repo, software, commits, items: [] };
    p.items = classify(p, cwd);
    writeFileSync(file, JSON.stringify(p, null, 2));
  }
  const token = createHash('sha256').update(JSON.stringify(p.items)).digest('hex').slice(0, 8);
  show(p, token, file);

  if (dryRun) { say('\n(dry run — nothing written, push not affected)'); process.exit(0); }

  const significant = p.items.filter((i) => i.category === 'change' && i.outcome !== 'Not significant');
  if (significant.length) {
    fail(`${significant.length} change(s) rated significant or undecided — a significant change needs a new UDI-DI and updated technical documentation before release.
  If the QMO decides it is not significant: edit the proposal file (set "outcome" to "Not significant" and write the rationale), then push again and confirm.`);
  }

  if (process.env.CHANGE_GATE_CONFIRM !== token) {
    const a = ask(`\nWrite these records to Formwork and push? [y/N] `);
    if (a === null) {
      fail(`no terminal to confirm. Review the records above; to confirm, push again with:
  CHANGE_GATE_CONFIRM=${token} git push`);
    }
    if (a.toLowerCase() !== 'y') fail('not confirmed — nothing written, push stopped.');
  }

  say('change gate: writing records to Formwork…');
  const ids = writeToFormwork(p);
  const now = new Date().toISOString();
  for (const it of p.items) {
    const id = it.category === 'change' ? ids.changes?.[it.commits[0]] : it.category === 'bug_fix' ? ids.bugs?.[it.commits[0]] : null;
    for (const c of it.commits) {
      appendFileSync(LEDGER, JSON.stringify({ repo, commit: c.slice(0, 7), category: it.category, id: id ?? null, confirmedBy: QMO, at: now }) + '\n');
    }
  }
  rmSync(file, { force: true });
  say(`✔ change gate: records written (${JSON.stringify(ids)}). Push continues.`);
}

main();
