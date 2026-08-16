/**
 * Step 3: /fleet endpoints, role isolation, and the redaction guarantee.
 *
 * The assertions that matter are the last block: a management token must not
 * be able to reach a patient name, a symptom, a transcript or a vital sign by
 * any route the API exposes.
 */
const ROOT = '/Users/marinahealth/Documents/marina-api';
const pg = require(`${ROOT}/node_modules/pg`);
const OriginalPool = pg.Pool;
function PatchedPool(this: unknown, cfg: Record<string, unknown>) {
  return new OriginalPool({ ...cfg, ssl: false });
}
PatchedPool.prototype = OriginalPool.prototype;
pg.Pool = PatchedPool;

const BASE = `http://127.0.0.1:${process.env.PORT}`;

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? '  ok  ' : ' FAIL '} ${label}${ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`,
  );
}

let TOKEN = '';
async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

async function main() {
  require(`${ROOT}/src/index`);
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) break; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 150));
  }

  const { query, pool } = require(`${ROOT}/src/lib/db`);
  const { signAccessToken } = require(`${ROOT}/src/lib/jwt`);
  const { createConversation } = require(`${ROOT}/src/lib/conversationStore`);

  // ---- two companies, so cross-tenant leakage has something to leak -------
  const esvagt = (await query(
    `INSERT INTO partners (name, slug, kind) VALUES ('Esvagt A/S','esvagt','owner') RETURNING id`)).rows[0].id;
  const dfds = (await query(
    `INSERT INTO partners (name, slug, kind) VALUES ('DFDS','dfds','owner') RETURNING id`)).rows[0].id;

  const dana = (await query(
    `INSERT INTO vessels (org_id, name, call_sign) VALUES ($1,'Esvagt Dana','OZBD2') RETURNING id`,
    [esvagt])).rows[0].id;
  const seaways = (await query(
    `INSERT INTO vessels (org_id, name, call_sign) VALUES ($1,'DFDS Seaways','OZAA1') RETURNING id`,
    [dfds])).rows[0].id;

  const mkUser = async (email: string, role: string, org: string | null, vessel: string | null,
                        ship: string | null, cs: string | null) =>
    (await query(
      `INSERT INTO users (email, password, role, org_id, vessel_id, ship_name, call_sign,
                          email_verified, is_active)
       VALUES ($1,'x',$2,$3,$4,$5,$6,TRUE,TRUE) RETURNING id`,
      [email, role, org, vessel, ship, cs])).rows[0].id;

  const officer   = await mkUser('officer@esvagt.test',  'officer',    esvagt, dana,    'Esvagt Dana',  'OZBD2');
  const manager   = await mkUser('office@esvagt.test',   'management', esvagt, null,    null,           null);
  const rival     = await mkUser('office@dfds.test',     'management', dfds,   null,    null,           null);
  const orphan    = await mkUser('nobody@nowhere.test',  'management', null,   null,    null,           null);
  await mkUser('officer@dfds.test', 'officer', dfds, seaways, 'DFDS Seaways', 'OZAA1');

  const fakeState = (symptom: string) => ({
    stage: 1,
    conversationHistory: [{ role: 'user', content: `${symptom}. Patient says it is severe.` }],
    variables: { symptom, patientLanguage: 'tl', medicalOfficerLanguage: 'da' },
    data: { vitals: [{ type: 'Pulse', value: '124', unit: 'bpm', timestamp: '' }],
            investigations: [], examFindings: [] },
    done: false,
  });

  // ---- an Esvagt officer runs a case -------------------------------------
  TOKEN = (await signAccessToken(officer)).token;
  const conv = (await createConversation(officer, fakeState('crushing chest pain'))).conversationId;
  const caseId = (await query(`SELECT case_id FROM conversations WHERE id = $1`, [conv]))
    .rows[0].case_id;

  check('case stamped with the officer\'s organisation',
    (await query(`SELECT org_id FROM cases WHERE id = $1`, [caseId])).rows[0].org_id, esvagt);

  await api('PATCH', `/cases/${caseId}`, {
    status: 'monitoring', patient_ref: 'Ramil Santos', severity: 3,
    next_check_due_at: new Date(Date.now() - 3600_000).toISOString(),
  });
  await api('POST', `/cases/${caseId}/events`, {
    event_type: 'medicine_given', payload: { drug: 'Paracetamol' },
  });
  await query(
    `INSERT INTO case_decisions (case_id, decision, method, port_name, notified, recorded_by_user_id)
     VALUES ($1,'evacuate','helicopter','Esbjerg','Agent, insurer',$2)`, [caseId, officer]);

  // ---- role isolation -----------------------------------------------------
  check('officer token cannot open the fleet board', (await api('GET', '/fleet/board')).status, 403);

  TOKEN = (await signAccessToken(orphan)).token;
  check('management with no organisation is refused', (await api('GET', '/fleet/board')).status, 403);

  TOKEN = (await signAccessToken(rival)).token;
  const rivalBoard = await api('GET', '/fleet/board');
  check('a rival company sees an empty board', rivalBoard.body.items.length, 0);

  // ---- the office sees its own fleet --------------------------------------
  TOKEN = (await signAccessToken(manager)).token;
  const board = await api('GET', '/fleet/board');
  check('board is 200', board.status, 200);
  check('  one case on it', board.body.items.length, 1);
  check('  vessel resolved', board.body.items[0].vessel_name, 'Esvagt Dana');
  check('  urgency present', board.body.items[0].severity, 3);
  check('  overdue flagged', board.body.items[0].is_overdue, true);
  check('  encounter counted', board.body.items[0].encounter_count, 1);
  check('  staleness stated', 'as_of' in board.body, true);
  check('  vessel last-seen present', 'vessel_last_seen_at' in board.body.items[0], true);

  const vessels = await api('GET', '/fleet/vessels');
  check('vessels lists only our own', vessels.body.items.map((v: any) => v.name), ['Esvagt Dana']);
  check('  open case counted', vessels.body.items[0].open_cases, 1);

  const decisions = await api('GET', '/fleet/decisions');
  check('decisions visible to the office', decisions.body.items.length, 1);
  check('  what was decided', decisions.body.items[0].decision, 'evacuate');
  check('  and the port', decisions.body.items[0].port_name, 'Esbjerg');

  const stats = await api('GET', '/fleet/stats');
  check('stats is 200', stats.status, 200);
  check('  one case open now', stats.body.totals.open_now, 1);
  check('  decisions tallied', stats.body.decisions[0].decision, 'evacuate');

  // ---- THE REDACTION GUARANTEE -------------------------------------------
  // Nothing a management token can reach may contain the patient, the
  // complaint, the transcript or a vital sign.
  const CLINICAL = ['Ramil', 'Santos', 'chest pain', 'crushing', '124', 'Paracetamol'];
  const surfaces = ['/fleet/board', '/fleet/vessels', '/fleet/cases', '/fleet/decisions', '/fleet/stats'];

  for (const path of surfaces) {
    const body = JSON.stringify((await api('GET', path)).body);
    const leaked = CLINICAL.filter((needle) => body.includes(needle));
    check(`no clinical data in ${path}`, leaked, []);
  }

  // and the clinical routes themselves must refuse a management token
  check('management cannot read the case itself',
    (await api('GET', `/cases/${caseId}`)).status, 404);
  check('management cannot read the trend',
    (await api('GET', `/cases/${caseId}/trend`)).status, 404);
  check('management cannot read conversations',
    (await api('GET', `/conversations/${conv}`)).status, 404);

  // ---- and no write path exists in the namespace --------------------------
  for (const [method, path] of [['POST', '/fleet/board'], ['PATCH', '/fleet/cases'],
                                ['DELETE', '/fleet/vessels'], ['PUT', '/fleet/stats']] as const) {
    const r = await api(method, path, {});
    check(`${method} ${path} is not routed`, r.status === 404 || r.status === 405, true);
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
