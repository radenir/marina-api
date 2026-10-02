/**
 * Short-lived partner tokens (`mpt_`): minting, use, revocation, and — the part
 * that makes the change additive — that API keys and user JWTs behave exactly
 * as before.
 *
 * Routes are driven with bodies that fail validation in the handler: a 400
 * proves the request got through authenticate, requireScope, the rate limit
 * and requireVerifiedActiveUser, without needing a live AI provider.
 *
 * The secret is set in-process before the app loads, so run.sh needs no new
 * variable; the "disabled" block clears it at runtime.
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

async function api(method: string, path: string, bearer: string | null, body?: unknown, extra: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, type: res.headers.get('content-type') ?? '' };
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
  const { mintPartnerToken } = require(`${ROOT}/src/lib/partnerTokens`);
  const { config } = require(`${ROOT}/src/config`);

  // ---- fixtures -------------------------------------------------------------
  const partner = (await query(
    `INSERT INTO partners (name, slug) VALUES ('Youwell AS','youwell') RETURNING id`)).rows[0].id;
  const mkKey = async (name: string, scopes: string[]) => {
    const plaintext = `mk_live_${require('crypto').randomBytes(32).toString('hex')}`;
    const id = (await query(
      `INSERT INTO partner_api_clients (partner_id, name, key_hash, key_prefix, scopes)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [partner, name, sha256hex(plaintext), plaintext.slice(0, 16), scopes])).rows[0].id;
    return { id, plaintext };
  };
  const full = await mkKey('full', ['transcribe:write', 'extract:write', 'pdf:write', 'pdf:email']);
  const transcribeOnly = await mkKey('transcribe-only', ['transcribe:write']);

  const user = (await query(
    `INSERT INTO users (email, password, first_name, last_name, email_verified, is_active)
     VALUES ('officer@test.test','x','Jane','Doe', TRUE, TRUE) RETURNING id`)).rows[0].id;
  const userJwt = (await signAccessToken(user, ['user'])).token;

  const badExtract = { conversation: 'not-an-array' };

  // ---- 1. baseline: existing auth paths are unchanged ----------------------
  check('api key: /ai/extract reaches handler', (await api('POST', '/ai/extract', full.plaintext, badExtract)).status, 400);
  check('user jwt: /ai/extract reaches handler', (await api('POST', '/ai/extract', userJwt, badExtract)).status, 400);
  check('user jwt: /conversations works', (await api('GET', '/conversations', userJwt)).status, 200);
  check('api key: /conversations still 401', (await api('GET', '/conversations', full.plaintext)).status, 401);
  check('garbage mpt_ on /ai/extract → 401', (await api('POST', '/ai/extract', 'mpt_garbage', badExtract)).status, 401);

  // ---- 2. minting ----------------------------------------------------------
  const minted = await api('POST', '/partner/tokens', full.plaintext, { userRef: 'clinician-42' });
  check('mint: 201', minted.status, 201);
  check('mint: mpt_ prefix', String(minted.body.token).startsWith('mpt_'), true);
  check('mint: default 900s', minted.body.expiresIn, 900);
  check('mint: scopes exclude pdf:email', minted.body.scopes, ['transcribe:write', 'extract:write', 'pdf:write']);
  const TOKEN = minted.body.token as string;

  check('mint: custom ttl', (await api('POST', '/partner/tokens', full.plaintext, { userRef: 'c', ttlSeconds: 120 })).body.expiresIn, 120);
  check('mint: ttl over 900 → 400', (await api('POST', '/partner/tokens', full.plaintext, { userRef: 'c', ttlSeconds: 901 })).status, 400);
  check('mint: missing userRef → 400', (await api('POST', '/partner/tokens', full.plaintext, {})).status, 400);
  check('mint: no auth → 401', (await api('POST', '/partner/tokens', null, { userRef: 'c' })).status, 401);
  check('mint: user jwt → 403', (await api('POST', '/partner/tokens', userJwt, { userRef: 'c' })).status, 403);
  check('mint: token cannot mint → 403', (await api('POST', '/partner/tokens', TOKEN, { userRef: 'c' })).status, 403);

  const { rows: audit } = await query(
    `SELECT partner_id, api_client_id, metadata FROM audit_logs WHERE event_type = 'partner_token_minted' ORDER BY created_at LIMIT 1`);
  check('mint: audited with key + ref', [audit[0]?.api_client_id, audit[0]?.metadata?.partner_user_ref], [full.id, 'clinician-42']);

  // ---- 3. using the token --------------------------------------------------
  check('token: /ai/transcribe reaches handler', (await api('POST', '/ai/transcribe', TOKEN)).status, 400);
  check('token: /ai/extract reaches handler', (await api('POST', '/ai/extract', TOKEN, badExtract)).status, 400);
  check('token: /v2/ai/extract reaches handler', (await api('POST', '/v2/ai/extract', TOKEN, badExtract)).status, 400);
  const pdf = await api('POST', '/ai/generate-pdf', TOKEN, { summary: { patientFirstName: 'Jane' }, template: 'marina' });
  check('token: /ai/generate-pdf returns a PDF', [pdf.status, pdf.type.startsWith('application/pdf')], [200, true]);
  const { rows: pdfAudit } = await query(
    `SELECT partner_id, api_client_id FROM audit_logs WHERE event_type = 'pdf_generated' ORDER BY created_at DESC LIMIT 1`);
  check('token: calls attributed to the key', [pdfAudit[0]?.partner_id, pdfAudit[0]?.api_client_id], [partner, full.id]);

  check('token: /ai/email-pdf → 403 (no pdf:email)', (await api('POST', '/ai/email-pdf', TOKEN, { summary: {}, recipientEmail: 'a@b.test' })).status, 403);
  check('token: user-only /conversations → 401', (await api('GET', '/conversations', TOKEN)).status, 401);
  check('token: user-only /ai/translate → 401', (await api('POST', '/ai/translate', TOKEN, {})).status, 401);

  // A token never gains a scope its key lacks.
  const narrow = (await api('POST', '/partner/tokens', transcribeOnly.plaintext, { userRef: 'c' })).body.token;
  check('narrow token: transcribe ok', (await api('POST', '/ai/transcribe', narrow)).status, 400);
  check('narrow token: extract → 403', (await api('POST', '/ai/extract', narrow, badExtract)).status, 403);

  // ---- 4. forgery, expiry, confusion with user tokens ----------------------
  const [body, sig] = TOKEN.slice(4).split('.');
  const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
  check('tampered signature → 401', (await api('POST', '/ai/extract', `mpt_${body}.${flipped}`, badExtract)).status, 401);
  const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), ref: 'someone-else' })).toString('base64url');
  check('tampered payload → 401', (await api('POST', '/ai/extract', `mpt_${forgedPayload}.${sig}`, badExtract)).status, 401);
  const expired = mintPartnerToken({ apiClientId: full.id, partnerId: partner, userRef: 'c', ttlSeconds: -1 }).token;
  check('expired token → 401', (await api('POST', '/ai/extract', expired, badExtract)).status, 401);
  check('token without prefix is not a user jwt (/conversations)', (await api('GET', '/conversations', TOKEN.slice(4))).status, 401);
  check('token without prefix is not a user jwt (/ai/extract)', (await api('POST', '/ai/extract', TOKEN.slice(4), badExtract)).status, 401);

  // ---- 5. the key's IP lock does not apply to its tokens -------------------
  await query(`UPDATE partner_api_clients SET allowed_ips = ARRAY['10.0.0.0/8']::inet[] WHERE id = $1`, [full.id]);
  check('ip-locked key from 127.0.0.1 → 401', (await api('POST', '/ai/extract', full.plaintext, badExtract)).status, 401);
  check('ip-locked key cannot mint from 127.0.0.1', (await api('POST', '/partner/tokens', full.plaintext, { userRef: 'c' })).status, 401);
  check('existing token still works off-allowlist', (await api('POST', '/ai/extract', TOKEN, badExtract)).status, 400);
  await query(`UPDATE partner_api_clients SET allowed_ips = NULL WHERE id = $1`, [full.id]);

  // ---- 6. disabled server: no secret → 503 and tokens rejected -------------
  const secret = config.partnerToken.secret;
  config.partnerToken.secret = null;
  check('disabled: mint → 503', (await api('POST', '/partner/tokens', full.plaintext, { userRef: 'c' })).status, 503);
  check('disabled: token → 401', (await api('POST', '/ai/extract', TOKEN, badExtract)).status, 401);
  check('disabled: api key unaffected', (await api('POST', '/ai/extract', full.plaintext, badExtract)).status, 400);
  config.partnerToken.secret = secret;

  // ---- 7. revoking the key kills its tokens immediately --------------------
  await query(`UPDATE partner_api_clients SET revoked_at = NOW() WHERE id = $1`, [full.id]);
  check('revoked key: token → 401', (await api('POST', '/ai/extract', TOKEN, badExtract)).status, 401);
  check('revoked key: cannot mint', (await api('POST', '/partner/tokens', full.plaintext, { userRef: 'c' })).status, 401);

  await pool.end();
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 60_000).unref();
main().catch((e) => { console.error(e); process.exit(1); });
