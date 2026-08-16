/**
 * The additivity proof.
 *
 * Boots the NEW code against a database migrated only to 014 — i.e. exactly
 * the schema live in production right now, with no `cases` table and no
 * `conversations.case_id` column at all.
 *
 * Everything the live apps depend on must behave exactly as it does today.
 * The case machinery must degrade to silence, not to an error.
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

const watchdog = setTimeout(() => {
  console.error('WATCHDOG: still running after 60s — hung');
  process.exit(2);
}, 60_000);
watchdog.unref?.();

async function main() {
  require(`${ROOT}/src/index`);
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) break; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 150));
  }

  const { query, pool } = require(`${ROOT}/src/lib/db`);
  const { signAccessToken } = require(`${ROOT}/src/lib/jwt`);
  const {
    createConversation, createNoteTakerConversation, saveNoteTaker,
    updateFromChat, updateFromExtract,
  } = require(`${ROOT}/src/lib/conversationStore`);

  // confirm we really are on the pre-015 schema
  const cols = await query(
    `SELECT COUNT(*)::int AS n FROM information_schema.columns
      WHERE table_name = 'conversations' AND column_name = 'case_id'`,
  );
  const tables = await query(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_name = 'cases'`,
  );
  check('precondition: no conversations.case_id', cols.rows[0].n, 0);
  check('precondition: no cases table', tables.rows[0].n, 0);

  const { rows: [user] } = await query(
    `INSERT INTO users (email, password, ship_name, email_verified, is_active)
     VALUES ('officer@esvagt.test','x','Esvagt Delta', TRUE, TRUE) RETURNING id`,
  );
  TOKEN = (await signAccessToken(user.id)).token;

  const fakeState = (symptom: string) => ({
    stage: 1,
    conversationHistory: [{ role: 'user', content: `${symptom} since yesterday.` }],
    variables: { symptom, patientLanguage: 'tl', medicalOfficerLanguage: 'da' },
    data: { vitals: [], investigations: [], examFindings: [] },
    done: false,
  });

  // ---- the endpoint that would 500 if case work could propagate ----------
  let r = await api('POST', '/ai/note-taker/save', {
    messages: [{ role: 'user', content: 'Burn on the left hand.' }],
    patientLanguage: 'tl', medicalOfficerLanguage: 'da',
  });
  check('POST /ai/note-taker/save is 200', r.status, 200);
  check('  conversationId returned', typeof r.body.conversationId === 'string', true);
  check('  caseId degrades to null', r.body.caseId, null);
  const conv1 = r.body.conversationId;
  check('  row really is in the database',
    (await query('SELECT COUNT(*)::int AS n FROM conversations WHERE id = $1', [conv1])).rows[0].n, 1);

  // ---- resuming an existing note-taker session ---------------------------
  r = await api('POST', '/ai/note-taker/save', {
    conversationId: conv1,
    messages: [
      { role: 'user', content: 'Burn on the left hand.' },
      { role: 'assistant', content: 'Cooled under running water.' },
    ],
    patientLanguage: 'tl', medicalOfficerLanguage: 'da',
  });
  check('resume note-taker is 200', r.status, 200);
  check('  messages actually updated',
    (await query('SELECT jsonb_array_length(messages) AS n FROM conversations WHERE id = $1', [conv1]))
      .rows[0].n, 2);

  // ---- translator mode ----------------------------------------------------
  r = await api('POST', '/ai/note-taker/save', {
    messages: [{ role: 'user', content: 'hej' }],
    patientLanguage: 'tl', medicalOfficerLanguage: 'da', mode: 'translator',
  });
  check('translator save is 200', r.status, 200);

  // ---- the store functions the interview endpoint calls -------------------
  const created = await createConversation(user.id, fakeState('chest pain'));
  check('createConversation does not throw', typeof created.conversationId === 'string', true);
  check('  caseId null', created.caseId, null);
  check('  conversation persisted',
    (await query('SELECT COUNT(*)::int AS n FROM conversations WHERE id = $1',
      [created.conversationId])).rows[0].n, 1);

  const chatCase = await updateFromChat(created.conversationId, user.id, fakeState('chest pain, worse'));
  check('updateFromChat does not throw', chatCase, null);
  check('  state actually updated',
    (await query(`SELECT chief_symptom FROM conversations WHERE id = $1`,
      [created.conversationId])).rows[0].chief_symptom, 'chest pain, worse');

  const extractCase = await updateFromExtract(created.conversationId, user.id, { foo: 'bar' });
  check('updateFromExtract does not throw', extractCase, null);
  check('  summary actually written',
    (await query(`SELECT extracted_summary->>'foo' AS v FROM conversations WHERE id = $1`,
      [created.conversationId])).rows[0].v, 'bar');

  const nt = await createNoteTakerConversation(
    { userId: user.id },
    { messages: [{ role: 'user', content: 'fever' }], summary: {},
      patientLanguage: 'en', medicalOfficerLanguage: 'en', chiefSymptom: 'fever' },
  );
  check('createNoteTakerConversation does not throw', typeof nt.conversationId === 'string', true);
  check('  caseId null', nt.caseId, null);

  // ---- the read endpoints existing apps use -------------------------------
  check('GET /conversations still works', (await api('GET', '/conversations')).status, 200);
  check('GET /conversations/:id still works', (await api('GET', `/conversations/${conv1}`)).status, 200);

  // ---- every session was saved despite cases being absent -----------------
  // create + resume(same row) + translator + createConversation
  // + createNoteTakerConversation = 4 distinct rows
  check('every session persisted despite cases being absent',
    (await query('SELECT COUNT(*)::int AS n FROM conversations')).rows[0].n, 4);

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
