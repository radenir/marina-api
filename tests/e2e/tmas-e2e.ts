/**
 * TMAS directory (GET /tmas) and POST /ai/email-tmas.
 *
 * The email queue is paused right after boot, so nothing is ever sent: the
 * suite inspects the queued jobs instead — who they go to, which form, and
 * whether the covering email is the TMAS one. /ai/email-pdf is checked to be
 * unchanged: it neither learned a `tmas` field nor opened up to tokens.
 */
const ROOT = '/Users/marinahealth/Documents/marina-api';
const pg = require(`${ROOT}/node_modules/pg`);
const OriginalPool = pg.Pool;
function PatchedPool(this: unknown, cfg: Record<string, unknown>) {
  return new OriginalPool({ ...cfg, ssl: false });
}
PatchedPool.prototype = OriginalPool.prototype;
pg.Pool = PatchedPool;

process.env.PARTNER_TOKEN_SECRET = 'e2e-partner-token-secret-0123456789abcdef';

const BASE = `http://127.0.0.1:${process.env.PORT}`;

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? '  ok  ' : ' FAIL '} ${label}${ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`,
  );
}

async function api(method: string, path: string, bearer: string | null, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
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
  const { sha256hex } = require(`${ROOT}/src/lib/tokens`);
  const { signAccessToken } = require(`${ROOT}/src/lib/jwt`);
  const { emailQueue } = require(`${ROOT}/src/lib/emailQueue`);
  const { buildTmasReportEmail } = require(`${ROOT}/src/lib/email`);

  // Nothing leaves this machine: jobs stay waiting where we can read them.
  await emailQueue.pause();
  await emailQueue.drain(true);
  const lastJob = async () => {
    const jobs = await emailQueue.getJobs(['waiting', 'paused', 'delayed', 'active']);
    jobs.sort((a: any, b: any) => b.timestamp - a.timestamp);
    return jobs[0]?.data;
  };

  // ---- fixtures -------------------------------------------------------------
  const partner = (await query(
    `INSERT INTO partners (name, slug) VALUES ('Youwell AS','youwell') RETURNING id`)).rows[0].id;
  const key = `mk_live_${require('crypto').randomBytes(32).toString('hex')}`;
  await query(
    `INSERT INTO partner_api_clients (partner_id, name, key_hash, key_prefix, scopes)
     VALUES ($1, 'k', $2, $3, $4)`,
    [partner, sha256hex(key), key.slice(0, 16), ['transcribe:write', 'extract:write', 'pdf:write', 'pdf:email', 'tmas:email']]);
  const keyNoTmas = `mk_live_${require('crypto').randomBytes(32).toString('hex')}`;
  await query(
    `INSERT INTO partner_api_clients (partner_id, name, key_hash, key_prefix, scopes)
     VALUES ($1, 'no-tmas', $2, $3, $4)`,
    [partner, sha256hex(keyNoTmas), keyNoTmas.slice(0, 16), ['pdf:write', 'pdf:email']]);
  const user = (await query(
    `INSERT INTO users (email, password, first_name, last_name, email_verified, is_active)
     VALUES ('officer@ship.test','x','Jane','Doe', TRUE, TRUE) RETURNING id`)).rows[0].id;
  const userJwt = (await signAccessToken(user, ['user'])).token;
  const token = (await api('POST', '/partner/tokens', key, { userRef: 'c' })).body.token;

  const summary = { patientFirstName: 'Jane', shipName: 'MV Northern Star', shipCallSign: 'LAXY7' };

  // ---- 1. GET /tmas --------------------------------------------------------
  check('GET /tmas without auth → 401', (await api('GET', '/tmas', null)).status, 401);
  const list = await api('GET', '/tmas', userJwt);
  check('GET /tmas (user) → 200', list.status, 200);
  check('GET /tmas (api key) → 200', (await api('GET', '/tmas', key)).status, 200);
  check('GET /tmas (short-lived token) → 200', (await api('GET', '/tmas', token)).status, 200);

  const tmas: any[] = list.body.tmas;
  check('15 services', tmas.length, 15);
  check('ids unique', new Set(tmas.map((t) => t.id)).size, 15);
  const tpl = Object.fromEntries(tmas.map((t) => [t.id, t.template]));
  check('Denmark → rmd', tpl.dk, 'rmd');
  check('Germany → german', tpl.de, 'german');
  check('everyone else → marina', tmas.filter((t) => !['dk', 'de'].includes(t.id)).every((t) => t.template === 'marina'), true);
  check('emails are valid or null', tmas.every((t) => t.email === null || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(t.email)), true);
  check('no-email services', tmas.filter((t) => t.email === null).map((t) => t.id).sort(), ['ca', 'gb', 'pl', 'se', 'us']);
  check('Germany address', tmas.find((t) => t.id === 'de').email, 'medico@tmas-germany.de');

  // ---- 2. POST /ai/email-tmas ---------------------------------------------
  const de = await api('POST', '/ai/email-tmas', key, { summary, tmas: 'de' });
  check('de → 200', de.status, 200);
  check('de → message names the TMAS', de.body.message, 'Report queued for delivery to Medico Cuxhaven (medico@tmas-germany.de)');
  let job = await lastJob();
  check('de → job to registry address, German form, TMAS email', [job?.to, job?.template, job?.tmasId], ['medico@tmas-germany.de', 'german', 'de']);
  const { rows: [audit] } = await query(
    `SELECT metadata FROM audit_logs WHERE event_type = 'pdf_emailed_tmas' ORDER BY created_at DESC LIMIT 1`);
  check('de → audited', [audit?.metadata.tmas, audit?.metadata.recipient_email, audit?.metadata.template], ['de', 'medico@tmas-germany.de', 'german']);

  await api('POST', '/ai/email-tmas', key, { summary, tmas: 'DK' });
  job = await lastJob();
  check('id is case-insensitive; Denmark gets rmd', [job?.to, job?.template], ['RMD@RSYD.dk', 'rmd']);

  await api('POST', '/ai/email-tmas', key, { summary, tmas: 'de', recipientEmail: 'attacker@evil.test', template: 'marina' });
  job = await lastJob();
  check('recipientEmail/template in body cannot redirect or change form', [job?.to, job?.template], ['medico@tmas-germany.de', 'german']);

  const fromUser = await api('POST', '/ai/email-tmas', userJwt, { summary, tmas: 'no' });
  job = await lastJob();
  check('user → TMAS, reply-to the officer', [fromUser.status, job?.to, job?.replyTo, job?.template], [200, 'advice@radiomedico.no', 'officer@ship.test', 'marina']);

  const viaToken = await api('POST', '/ai/email-tmas', token, { summary, tmas: 'it' });
  job = await lastJob();
  check('short-lived token can email a TMAS', [viaToken.status, job?.to], [200, 'telesoccorso@cirm.it']);
  check('key without tmas:email → 403', (await api('POST', '/ai/email-tmas', keyNoTmas, { summary, tmas: 'de' })).status, 403);
  check('no auth → 401', (await api('POST', '/ai/email-tmas', null, { summary, tmas: 'de' })).status, 401);

  check('unknown tmas → 400', (await api('POST', '/ai/email-tmas', key, { summary, tmas: 'xx' })).status, 400);
  check('missing tmas → 400', (await api('POST', '/ai/email-tmas', key, { summary })).status, 400);
  const ca = await api('POST', '/ai/email-tmas', key, { summary, tmas: 'ca' });
  check('tmas without email → 400', [ca.status, ca.body.error], [400, 'Joint Rescue Coordination Centre (JRCC) (Canada) does not accept reports by email']);

  // ---- 3. existing paths unchanged -----------------------------------------
  const plain = await api('POST', '/ai/email-pdf', key, { summary, recipientEmail: 'doctor@vessel.test' });
  job = await lastJob();
  check('recipientEmail path unchanged', [plain.status, plain.body.message, job?.to, job?.template, job?.tmasId], [200, 'Report queued for delivery to doctor@vessel.test', 'doctor@vessel.test', 'rmd', undefined]);
  const own = await api('POST', '/ai/email-pdf', userJwt, { summary });
  job = await lastJob();
  check('user own-address path unchanged', [own.status, own.body.message, job?.to, job?.tmasId], [200, 'Your report is being sent to your email address', 'officer@ship.test', undefined]);
  check('email-pdf ignores a tmas field (partner without recipient still 400)', (await api('POST', '/ai/email-pdf', key, { summary, tmas: 'de' })).status, 400);
  check('email-pdf still refuses short-lived tokens', (await api('POST', '/ai/email-pdf', token, { summary, recipientEmail: 'a@b.test' })).status, 403);

  // ---- 4. covering email ---------------------------------------------------
  const mail = buildTmasReportEmail({ tmasName: 'Medico Cuxhaven', vesselName: 'MV <b>X</b>', callSign: 'AB1', dateStr: '2 October 2026', filename: 'f.pdf' });
  check('covering email: subject names vessel', mail.subject, 'Maritime medical report — MV <b>X</b> (AB1)');
  check('covering email: html escapes vessel', [mail.html.includes('MV &lt;b&gt;X&lt;/b&gt;'), mail.html.includes('<b>X</b>')], [true, false]);
  check('covering email: no vessel fallback', buildTmasReportEmail({ tmasName: 'T', dateStr: 'd', filename: 'f' }).subject, 'Maritime medical report — a vessel');

  await emailQueue.drain(true);
  await emailQueue.resume();
  await pool.end();
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 60_000).unref();
main().catch((e) => { console.error(e); process.exit(1); });
