/**
 * Phase 1 verification against the throwaway marina_015_check database.
 * Deliberately does NOT load dotenv — env is supplied by the caller so this
 * can never reach the real database.
 *
 * src/lib/db.ts hardcodes ssl for the OVH instance; the local scratch server
 * has no TLS, so the driver is patched here rather than changing shipped code.
 */
const pg = require(`${process.env.HOME}/Documents/marina-api/node_modules/pg`);
const OriginalPool = pg.Pool;
function PatchedPool(this: unknown, cfg: Record<string, unknown>) {
  return new OriginalPool({ ...cfg, ssl: false });
}
PatchedPool.prototype = OriginalPool.prototype;
pg.Pool = PatchedPool;

const API = '/Users/marinahealth/Documents/marina-api/src/lib';
/* eslint-disable @typescript-eslint/no-var-requires */
const { query, pool } = require(`${API}/db`);
const {
  createConversation,
  createNoteTakerConversation,
  saveNoteTaker,
} = require(`${API}/conversationStore`);
type InterviewState = Record<string, unknown>;
let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label} — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

function fakeState(symptom: string): InterviewState {
  return {
    stage: 1,
    conversationHistory: [{ role: 'user', content: `${symptom} since yesterday.` }],
    variables: { symptom, patientLanguage: 'tl', medicalOfficerLanguage: 'da' },
    data: { vitals: [], investigations: [], examFindings: [] },
    done: false,
  } as unknown as InterviewState;
}

async function main() {
  // --- fixtures -----------------------------------------------------------
  const { rows: [user] } = await query(
    `INSERT INTO users (email, password, first_name, last_name, ship_name, call_sign)
     VALUES ('officer@esvagt.test', 'x', 'Lars', 'Nielsen', 'Esvagt Delta', 'OZBD2')
     RETURNING id`,
  );
  const { rows: [partner] } = await query(
    `INSERT INTO partners (name, slug) VALUES ('MMG', 'mmg') RETURNING id`,
  );

  // --- 1. marina interview mints a recording case, stamped with the ship ---
  const convA = (await createConversation(user.id, fakeState('chest pain'))).conversationId;
  const { rows: [a] } = await query(
    `SELECT c.encounter_seq, k.status, k.ship_name, k.call_sign, k.user_id, k.patient_ref
       FROM conversations c JOIN cases k ON k.id = c.case_id WHERE c.id = $1`,
    [convA],
  );
  check('marina: status', a.status, 'recording');
  check('marina: ship stamped', [a.ship_name, a.call_sign], ['Esvagt Delta', 'OZBD2']);
  check('marina: encounter_seq', a.encounter_seq, 1);
  check('marina: patient not yet named', a.patient_ref, null);

  // --- 2. ship rename must NOT re-attribute the existing case -------------
  await query(`UPDATE users SET ship_name = 'Esvagt Echo' WHERE id = $1`, [user.id]);
  const { rows: [frozen] } = await query(
    `SELECT k.ship_name FROM conversations c JOIN cases k ON k.id = c.case_id WHERE c.id = $1`,
    [convA],
  );
  check('rename: old case frozen', frozen.ship_name, 'Esvagt Delta');
  await query(`UPDATE users SET ship_name = 'Esvagt Delta' WHERE id = $1`, [user.id]);

  // --- 3. second encounter attaches to the SAME case, seq increments ------
  const caseA = (await query(
    `SELECT case_id FROM conversations WHERE id = $1`, [convA])).rows[0].case_id;
  const convA2 = (await createConversation(user.id, fakeState('chest pain, day 3'), caseA)).conversationId;
  const { rows: [a2] } = await query(
    `SELECT case_id, encounter_seq FROM conversations WHERE id = $1`, [convA2],
  );
  check('encounter 2: same case', a2.case_id, caseA);
  check('encounter 2: seq', a2.encounter_seq, 2);
  check('encounter 2: no extra case',
    (await query(`SELECT 1 FROM cases WHERE user_id = $1`, [user.id])).rowCount, 1);

  // --- 4. translator sessions never become cases --------------------------
  const convT = (await saveNoteTaker(user.id, null, {
    messages: [{ role: 'user', content: 'hej' }],
    patientLanguage: 'tl', medicalOfficerLanguage: 'da', mode: 'translator',
  })).conversationId;
  check('translator: no case',
    (await query(
      `SELECT case_id FROM conversations WHERE id = $1`, [convT])).rows[0].case_id, null);

  // --- 5. note-taker first save DOES mint a case --------------------------
  const convN = (await saveNoteTaker(user.id, null, {
    messages: [{ role: 'user', content: 'burn on the left hand' }],
    patientLanguage: 'tl', medicalOfficerLanguage: 'da',
  })).conversationId;
  check('note-taker: case created',
    (await query(
      `SELECT COUNT(*)::text AS n FROM conversations c JOIN cases k ON k.id = c.case_id
        WHERE c.id = $1`, [convN])).rows[0].n, '1');

  // --- 6. partner-owned rows work, with null ship fields ------------------
  const convP = (await createNoteTakerConversation(
    { partnerId: partner.id, partnerUserRef: 'mmg-user-77' },
    { messages: [{ role: 'user', content: 'fever' }], summary: {},
      patientLanguage: 'en', medicalOfficerLanguage: 'en', chiefSymptom: 'fever' },
  )).conversationId;
  const { rows: [p] } = await query(
    `SELECT k.partner_id, k.user_id, k.ship_name, k.partner_user_ref
       FROM conversations c JOIN cases k ON k.id = c.case_id WHERE c.id = $1`, [convP],
  );
  check('partner: owned by partner', [p.partner_id, p.user_id], [partner.id, null]);
  check('partner: ship null', p.ship_name, null);
  check('partner: user ref carried', p.partner_user_ref, 'mmg-user-77');

  // --- 7. a foreign caseId is ignored, not honoured -----------------------
  const foreignCase = (await query(
    `SELECT case_id FROM conversations WHERE id = $1`, [convP])).rows[0].case_id;
  const convX = (await createConversation(user.id, fakeState('headache'), foreignCase)).conversationId;
  const { rows: [x] } = await query(
    `SELECT case_id FROM conversations WHERE id = $1`, [convX],
  );
  check('foreign caseId rejected', x.case_id !== foreignCase, true);

  // --- 8. a closed case does not accept new encounters --------------------
  await query(`UPDATE cases SET status = 'closed' WHERE id = $1`, [caseA]);
  const convC = (await createConversation(user.id, fakeState('follow up'), caseA)).conversationId;
  check('closed case rejected',
    (await query(
      `SELECT case_id FROM conversations WHERE id = $1`, [convC])).rows[0].case_id !== caseA, true);

  // --- 9. timeline is being written ---------------------------------------
  const { rows: ev } = await query(
    `SELECT event_type, COUNT(*)::text AS n FROM case_events GROUP BY event_type ORDER BY event_type`,
  );
  console.log('  case_events:', ev.map((e: any) => `${e.event_type}=${e.n}`).join(' '));
  check('events: created == cases',
    ev.find((e: any) => e.event_type === 'case_created')?.n,
    (await query(`SELECT COUNT(*)::text AS n FROM cases`)).rows[0].n);

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
