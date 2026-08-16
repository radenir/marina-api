/**
 * Phase 2 end-to-end: boots the real Express app against the throwaway
 * marina_phase2_check database and drives /cases over HTTP with a real
 * RS256 bearer token.
 *
 * src/lib/db.ts hardcodes ssl for the OVH instance; the local scratch server
 * has no TLS, so the driver is patched here rather than changing shipped code.
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
  require(`${ROOT}/src/index`); // starts the server

  // wait for /health
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }

  const { query, pool } = require(`${ROOT}/src/lib/db`);
  const { signAccessToken } = require(`${ROOT}/src/lib/jwt`);
  const {
    createConversation,
    saveNoteTaker,
  } = require(`${ROOT}/src/lib/conversationStore`);

  const { rows: [user] } = await query(
    `INSERT INTO users (email, password, first_name, last_name, ship_name, call_sign,
                        email_verified, is_active)
     VALUES ('officer@esvagt.test','x','Lars','Nielsen','Esvagt Delta','OZBD2', TRUE, TRUE)
     RETURNING id`,
  );
  const { rows: [other] } = await query(
    `INSERT INTO users (email, password, ship_name, email_verified, is_active)
     VALUES ('other@dfds.test','x','DFDS Seaways', TRUE, TRUE) RETURNING id`,
  );
  TOKEN = (await signAccessToken(user.id)).token;

  const fakeState = (symptom: string) => ({
    stage: 1,
    conversationHistory: [{ role: 'user', content: `${symptom} since yesterday.` }],
    variables: { symptom, patientLanguage: 'tl', medicalOfficerLanguage: 'da' },
    data: { vitals: [], investigations: [], examFindings: [] },
    done: false,
  });

  // ---- auth ---------------------------------------------------------------
  const noAuth = await fetch(`${BASE}/cases`);
  check('unauthenticated is 401', noAuth.status, 401);

  // ---- a session mints a recording case, invisible on the list ------------
  const convA = (await createConversation(user.id, fakeState('chest pain'))).conversationId;
  const caseA = (await query(`SELECT case_id FROM conversations WHERE id = $1`, [convA]))
    .rows[0].case_id;

  let list = await api('GET', '/cases');
  check('recording case not on the list', list.body.items.length, 0);
  check('but visible with ?status=all', (await api('GET', '/cases?status=all')).body.items.length, 1);

  // ---- promotion requires naming the patient ------------------------------
  let r = await api('PATCH', `/cases/${caseA}`, { status: 'open' });
  check('promote without patient_ref is 400', r.status, 400);
  check('  ...with the reason', r.body.error, 'patient_ref is required to put a case on the list');

  r = await api('PATCH', `/cases/${caseA}`, {
    status: 'open', patient_ref: 'Ramil', severity: 3,
  });
  check('promote succeeds', r.status, 200);
  check('  status', r.body.case.status, 'open');
  check('  opened_at stamped', typeof r.body.case.opened_at === 'string', true);

  list = await api('GET', '/cases');
  check('now on the list', list.body.items.length, 1);
  check('  patient shown', list.body.items[0].patient_ref, 'Ramil');
  check('  chief symptom carried', list.body.items[0].chief_symptom, 'chest pain');
  check('  encounter count', list.body.items[0].encounter_count, 1);
  check('  not overdue yet', list.body.items[0].is_overdue, false);

  // ---- unknown fields are rejected, not silently ignored -------------------
  r = await api('PATCH', `/cases/${caseA}`, { patinet_ref: 'typo' });
  check('unknown field is 400', r.status, 400);

  // ---- due dates drive the list ordering ----------------------------------
  const past = new Date(Date.now() - 3600_000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();

  const convB = (await saveNoteTaker(user.id, null, {
    messages: [{ role: 'user', content: 'burn on the left hand' }],
    patientLanguage: 'tl', medicalOfficerLanguage: 'da',
  })).conversationId;
  const caseB = (await query(`SELECT case_id FROM conversations WHERE id = $1`, [convB]))
    .rows[0].case_id;
  await api('PATCH', `/cases/${caseB}`, {
    status: 'monitoring', patient_ref: 'Chief Cook', next_check_due_at: future,
  });
  await api('PATCH', `/cases/${caseA}`, { next_check_due_at: past });

  list = await api('GET', '/cases');
  check('overdue sorts first', list.body.items.map((i: any) => i.patient_ref), ['Ramil', 'Chief Cook']);
  check('  overdue flagged', list.body.items[0].is_overdue, true);
  check('  not-yet-due is not', list.body.items[1].is_overdue, false);

  // ---- closing requires an outcome ----------------------------------------
  r = await api('PATCH', `/cases/${caseA}`, { status: 'closed' });
  check('close without outcome is 400', r.status, 400);
  check('  ...with the reason', r.body.error, 'outcome is required to close a case');

  r = await api('PATCH', `/cases/${caseA}`, {
    status: 'closed', outcome: 'evacuated', outcome_note: 'Helicopter from Esbjerg.',
  });
  check('close with outcome succeeds', r.status, 200);
  check('  closed_at stamped', typeof r.body.case.closed_at === 'string', true);
  check('  outcome stored', r.body.case.outcome, 'evacuated');

  r = await api('PATCH', `/cases/${caseA}`, { outcome: 'unknown' });
  check('editing a closed case is 400', r.status, 400);
  check('  ...with the reason', r.body.error, 'Case is closed. Reopen it before editing.');

  list = await api('GET', '/cases');
  check('closed case leaves the list', list.body.items.map((i: any) => i.patient_ref), ['Chief Cook']);

  // ---- reopening clears the outcome ---------------------------------------
  r = await api('PATCH', `/cases/${caseA}`, { status: 'monitoring' });
  check('reopen succeeds', r.status, 200);
  check('  outcome cleared', [r.body.case.outcome, r.body.case.closed_at], [null, null]);
  await api('PATCH', `/cases/${caseA}`, {
    status: 'closed', outcome: 'resolved_aboard',
  });

  // ---- encounter two, attached explicitly ---------------------------------
  const convC = (await createConversation(user.id, fakeState('cough'))).conversationId;
  const caseC = (await query(`SELECT case_id FROM conversations WHERE id = $1`, [convC]))
    .rows[0].case_id;

  r = await api('POST', `/cases/${caseB}/encounters`, { conversation_id: convC });
  check('move encounter to another case', r.status, 201);
  check('  seq increments', r.body.encounter_seq, 2);

  r = await api('POST', `/cases/${caseB}/encounters`, { conversation_id: convC });
  check('re-attaching same encounter is 409', r.status, 409);

  r = await api('POST', `/cases/${caseA}/encounters`, { conversation_id: convB });
  check('attach into a closed case is 400', r.status, 400);

  const detail = await api('GET', `/cases/${caseB}`);
  check('case detail: encounters', detail.body.encounters.length, 2);
  check('  ordered by seq', detail.body.encounters.map((e: any) => e.encounter_seq), [1, 2]);
  check('  departure logged on old case',
    (await api('GET', `/cases/${caseC}`)).body.events.some((e: any) => e.event_type === 'encounter_moved'),
    true);

  // ---- client-appendable events, with lifecycle types refused -------------
  r = await api('POST', `/cases/${caseB}/events`, {
    event_type: 'medicine_given', payload: { drug: 'Paracetamol', dose: '1g' },
  });
  check('append medicine_given', r.status, 201);
  r = await api('POST', `/cases/${caseB}/events`, { event_type: 'case_closed' });
  check('forging a lifecycle event is 400', r.status, 400);

  const timeline = (await api('GET', `/cases/${caseB}`)).body.events.map((e: any) => e.event_type);
  check('timeline is complete', timeline, [
    'case_created', 'encounter_recorded', 'case_opened', 'check_scheduled',
    'encounter_moved', 'medicine_given',
  ]);

  // ---- another vessel's case is invisible ---------------------------------
  const otherToken = (await signAccessToken(other.id)).token;
  const saved = TOKEN;
  TOKEN = otherToken;
  check("other vessel: list is empty", (await api('GET', '/cases')).body.items.length, 0);
  check("other vessel: detail is 404", (await api('GET', `/cases/${caseB}`)).status, 404);
  check("other vessel: patch is 404", (await api('PATCH', `/cases/${caseB}`, { severity: 1 })).status, 404);
  TOKEN = saved;

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
