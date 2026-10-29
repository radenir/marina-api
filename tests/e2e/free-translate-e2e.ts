/**
 * POST /free/ai/translate, and /ai/translate unchanged by sharing its handler.
 *
 * The suite runs with a dummy NEBIUS_API_KEY, so a valid request ends at the
 * model with 502 "Translation service unavailable" — which is exactly what
 * proves it got past auth, rate limiting and validation. The real translation
 * is checked against production after deploy.
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

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* not json */ }
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

  const device = { 'x-marina-device': 'e2e-device-1' };
  const ok = { text: 'I have had chest pain since this morning', fromLang: 'en', toLang: 'pl' };

  // ---- free: no login, past validation to the model ------------------------
  const free = await post('/free/ai/translate', ok, device);
  check('free: no login is accepted (reaches the model → 502 here)', [free.status, free.body?.error], [502, 'Translation service unavailable']);
  check('free: without a device id it still works (falls back to IP)', (await post('/free/ai/translate', ok)).status, 502);

  // ---- free: validation as on the signed-in route ---------------------------
  check('free: same language → 400', (await post('/free/ai/translate', { ...ok, toLang: 'en' }, device)).status, 400);
  check('free: unknown language → 400', (await post('/free/ai/translate', { ...ok, toLang: 'xx' }, device)).status, 400);
  check('free: empty text → 400', (await post('/free/ai/translate', { ...ok, text: '' }, device)).status, 400);
  check('free: text over 5000 chars → 400', (await post('/free/ai/translate', { ...ok, text: 'a'.repeat(5001) }, device)).status, 400);

  // ---- signed-in route: unchanged -------------------------------------------
  check('signed-in: no login → 401', (await post('/ai/translate', ok)).status, 401);
  const user = (await query(
    `INSERT INTO users (email, password, first_name, last_name, email_verified, is_active)
     VALUES ('officer@ship.test','x','Jane','Doe', TRUE, TRUE) RETURNING id`)).rows[0].id;
  const jwt = (await signAccessToken(user, ['user'])).token;
  const auth = { Authorization: `Bearer ${jwt}` };
  check('signed-in: valid → reaches the model (502 here)', (await post('/ai/translate', ok, auth)).status, 502);
  check('signed-in: same language → 400', (await post('/ai/translate', { ...ok, toLang: 'en' }, auth)).status, 400);
  check('free TTS still does not exist', (await post('/free/ai/tts', { text: 'x', language: 'en' }, device)).status, 404);

  await pool.end();
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 90_000).unref();
main().catch((e) => { console.error(e); process.exit(1); });
