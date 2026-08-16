/**
 * Phase 3 end-to-end: caseId threaded through the session-creating endpoints,
 * and the M-EWS trend across encounters. Boots the real app against the
 * throwaway marina_phase3_check database.
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
  const { vitalsToMewsInput, buildTrend } = require(`${ROOT}/src/lib/caseTrend`);

  const { rows: [user] } = await query(
    `INSERT INTO users (email, password, ship_name, call_sign, email_verified, is_active)
     VALUES ('officer@esvagt.test','x','Esvagt Delta','OZBD2', TRUE, TRUE) RETURNING id`,
  );
  TOKEN = (await signAccessToken(user.id)).token;

  // ==== 1. note-taker/save returns the caseId ==============================
  let r = await api('POST', '/ai/note-taker/save', {
    messages: [{ role: 'user', content: 'Burn on the left hand from the galley.' }],
    patientLanguage: 'tl', medicalOfficerLanguage: 'da',
  });
  check('note-taker/save is 200', r.status, 200);
  const conv1 = r.body.conversationId;
  const case1 = r.body.caseId;
  check('  returns a caseId', typeof case1 === 'string', true);

  // ==== 2. a translator session returns caseId: null =======================
  r = await api('POST', '/ai/note-taker/save', {
    messages: [{ role: 'user', content: 'hej hej' }],
    patientLanguage: 'tl', medicalOfficerLanguage: 'da', mode: 'translator',
  });
  check('translator caseId is null', r.body.caseId, null);

  // ==== 3. updating the same session keeps the caseId ======================
  r = await api('POST', '/ai/note-taker/save', {
    conversationId: conv1,
    messages: [
      { role: 'user', content: 'Burn on the left hand from the galley.' },
      { role: 'assistant', content: 'Cooled under running water for 20 minutes.' },
    ],
    patientLanguage: 'tl', medicalOfficerLanguage: 'da',
  });
  check('resumed session keeps the same case', r.body.caseId, case1);
  check('  and the same conversation', r.body.conversationId, conv1);

  // promote it so it is a real case on the list
  await api('PATCH', `/cases/${case1}`, { status: 'monitoring', patient_ref: 'Ramil' });

  // ==== 4. encounter two starts FROM the case ==============================
  r = await api('POST', '/ai/note-taker/save', {
    caseId: case1,
    messages: [{ role: 'user', content: 'Day 3 — the blister has not burst.' }],
    patientLanguage: 'tl', medicalOfficerLanguage: 'da',
  });
  check('second encounter lands on the same case', r.body.caseId, case1);
  const conv2 = r.body.conversationId;
  check('  is a different conversation', conv2 !== conv1, true);

  const detail = await api('GET', `/cases/${case1}`);
  check('case now has two encounters', detail.body.encounters.length, 2);
  check('  sequenced', detail.body.encounters.map((e: any) => e.encounter_seq), [1, 2]);

  // ==== 5. a foreign / closed caseId is ignored, session still persists ====
  await api('PATCH', `/cases/${case1}`, { status: 'closed', outcome: 'resolved_aboard' });
  r = await api('POST', '/ai/note-taker/save', {
    caseId: case1,
    messages: [{ role: 'user', content: 'Unrelated: toothache.' }],
    patientLanguage: 'tl', medicalOfficerLanguage: 'da',
  });
  check('closed caseId falls back to a new case', r.status, 200);
  check('  and it is not the closed one', r.body.caseId !== case1, true);
  check('  the session still persisted', typeof r.body.conversationId === 'string', true);

  // ==== 6. /conversations is left exactly as it was ========================
  check('GET /conversations/:id unchanged and working',
    (await api('GET', `/conversations/${conv2}`)).status, 200);

  // ==== 7. vitals → M-EWS mapping ==========================================
  const mapped = vitalsToMewsInput([
    { type: 'Pulse', value: '120', unit: 'bpm', timestamp: '' },
    { type: 'Pressure', value: '128/84', unit: 'mmHg', timestamp: '' },
    { type: 'Temperature', value: '38,7', unit: '°C', timestamp: '' },
    { type: 'Respiration', value: '24 breaths', unit: '/min', timestamp: '' },
    { type: 'Oxygen', value: '94%', unit: '%', timestamp: '' },
    { type: 'AVPU', value: 'Voice', unit: 'AVPU', timestamp: '' },
  ]);
  check('systolic from "128/84"', mapped.blood_pressure_systolic, 128);
  check('comma decimal "38,7"', mapped.temperature_celsius, 38.7);
  check('number inside text "24 breaths"', mapped.respiration_per_min, 24);
  check('percent stripped "94%"', mapped.oxygen_saturation_percent, 94);
  check('AVPU normalised', mapped.avpu, 'Voice');
  check('later reading wins',
    vitalsToMewsInput([
      { type: 'Pulse', value: '60', unit: 'bpm', timestamp: '' },
      { type: 'Pulse', value: '110', unit: 'bpm', timestamp: '' },
    ]).pulse_per_min, 110);

  // ==== 8. trend arithmetic, including a gap ===============================
  const trend = buildTrend([
    { id: 'a', encounter_seq: 1, created_at: new Date(), last_message_at: new Date(),
      vital_signs: [{ type: 'Pulse', value: '80', unit: 'bpm', timestamp: '' }] },
    { id: 'b', encounter_seq: 2, created_at: new Date(), last_message_at: new Date(),
      vital_signs: [] },
    { id: 'c', encounter_seq: 3, created_at: new Date(), last_message_at: new Date(),
      vital_signs: [{ type: 'Pulse', value: '125', unit: 'bpm', timestamp: '' }] },
  ]);
  check('first point has no delta', trend[0].delta, null);
  check('encounter with no vitals scores null', trend[1].mews, null);
  check('  and is skipped in the chain', trend[2].delta, trend[2].mews.total_score - trend[0].mews.total_score);
  check('no verdict field is emitted',
    Object.keys(trend[0]).sort(),
    ['conversation_id', 'delta', 'encounter_seq', 'mews', 'recorded_at', 'vitals']);

  // ==== 9. the trend endpoint over HTTP ====================================
  await query(
    `UPDATE conversations SET vital_signs = $1::jsonb WHERE id = $2`,
    [JSON.stringify([
      { type: 'Pulse', value: '78', unit: 'bpm', timestamp: '' },
      { type: 'Temperature', value: '37.1', unit: '°C', timestamp: '' },
    ]), conv1],
  );
  await query(
    `UPDATE conversations SET vital_signs = $1::jsonb WHERE id = $2`,
    [JSON.stringify([
      { type: 'Pulse', value: '132', unit: 'bpm', timestamp: '' },
      { type: 'Temperature', value: '39.2', unit: '°C', timestamp: '' },
      { type: 'AVPU', value: 'Voice', unit: 'AVPU', timestamp: '' },
    ]), conv2],
  );

  r = await api('GET', `/cases/${case1}/trend`);
  check('trend endpoint is 200', r.status, 200);
  check('  one point per encounter', r.body.points.length, 2);
  check('  scores rise', r.body.points[1].mews.total_score > r.body.points[0].mews.total_score, true);
  check('  delta is the difference',
    r.body.points[1].delta,
    r.body.points[1].mews.total_score - r.body.points[0].mews.total_score);
  check('  missing values named', r.body.points[0].mews.missing_values.length > 0, true);

  const otherCase = (await api('GET', '/cases?status=all')).body.items
    .find((i: any) => i.id !== case1);
  check('trend for an unknown case is 404',
    (await api('GET', '/cases/00000000-0000-0000-0000-000000000000/trend')).status, 404);
  check('trend for own other case is 200',
    (await api('GET', `/cases/${otherCase.id}/trend`)).status, 200);

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
