/**
 * Report photos: POST/GET/DELETE /ai/exam-media/photos and `photoIds` on
 * /ai/generate-pdf, /ai/email-pdf and /ai/email-tmas.
 *
 * Runs against two schemas (see run.sh):
 *   full    — migration 028 applied: the photo endpoints and photo pages work.
 *   pre028  — the code shipped ahead of its migration, which is the normal
 *             deploy order. Every PDF route without photoIds must behave as
 *             before; the photo endpoints must answer an error, not hang.
 * The suite tells which it is in from whether report_photos exists.
 *
 * The email queue is paused, so nothing is sent; queued jobs are inspected.
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

async function api(method: string, path: string, bearer: string | null, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  let json: any = null;
  try { json = JSON.parse(buf.toString()); } catch { json = null; }
  return { status: res.status, body: json, buf, headers: res.headers };
}

async function upload(bearer: string | null, bytes: Buffer, type: string, fields: Record<string, string> = {}) {
  const form = new FormData();
  form.append('image', new Blob([bytes], { type }), 'photo');
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(`${BASE}/ai/exam-media/photos`, {
    method: 'POST',
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
    body: form,
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

  const sharp = require(`${ROOT}/node_modules/sharp`);
  const { PDFDocument } = require(`${ROOT}/node_modules/pdf-lib`);
  const { query, pool } = require(`${ROOT}/src/lib/db`);
  const { sha256hex } = require(`${ROOT}/src/lib/tokens`);
  const { signAccessToken } = require(`${ROOT}/src/lib/jwt`);
  const { emailQueue } = require(`${ROOT}/src/lib/emailQueue`);

  await emailQueue.pause();
  await emailQueue.drain(true);
  const lastJob = async () => {
    const jobs = await emailQueue.getJobs(['waiting', 'paused', 'delayed', 'active']);
    jobs.sort((a: any, b: any) => b.timestamp - a.timestamp);
    return jobs[0]?.data;
  };
  const pages = async (buf: Buffer) => (await PDFDocument.load(buf)).getPageCount();

  const hasTable = (await query(`SELECT to_regclass('public.report_photos') AS t`)).rows[0].t !== null;
  console.log(`schema: ${hasTable ? 'full (028 applied)' : 'pre028'}`);

  // ---- fixtures -------------------------------------------------------------
  const partner = (await query(
    `INSERT INTO partners (name, slug) VALUES ('Youwell AS','youwell') RETURNING id`)).rows[0].id;
  const key = `mk_live_${require('crypto').randomBytes(32).toString('hex')}`;
  await query(
    `INSERT INTO partner_api_clients (partner_id, name, key_hash, key_prefix, scopes)
     VALUES ($1, 'k', $2, $3, $4)`,
    [partner, sha256hex(key), key.slice(0, 16), ['pdf:write', 'pdf:email', 'tmas:email']]);
  const mkUser = async (email: string) => (await query(
    `INSERT INTO users (email, password, first_name, last_name, email_verified, is_active)
     VALUES ($1,'x','Jane','Doe', TRUE, TRUE) RETURNING id`, [email])).rows[0].id;
  const user = await mkUser('officer@ship.test');
  const other = await mkUser('other@ship.test');
  const jwt = (await signAccessToken(user, ['user'])).token;
  const otherJwt = (await signAccessToken(other, ['user'])).token;

  const summary = { patientFirstName: 'Jane', shipName: 'MV Northern Star', shipCallSign: 'LAXY7' };
  const photo = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#b45a3c' } })
    .jpeg({ quality: 95 })
    .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '55/1 40/1 0/1' } })
    .toBuffer();

  // ---- PDF routes without photoIds: identical on both schemas ---------------
  const plain = await api('POST', '/ai/generate-pdf', jwt, { summary, template: 'marina' });
  check('generate-pdf without photoIds → 200', plain.status, 200);
  const basePages = await pages(plain.buf);
  check('partner generate-pdf without photoIds → 200', (await api('POST', '/ai/generate-pdf', key, { summary })).status, 200);

  await api('POST', '/ai/email-pdf', jwt, { summary });
  let job = await lastJob();
  check('email-pdf without photoIds → job has no photo fields', [job?.to, 'photoIds' in job, 'photoUserId' in job], ['officer@ship.test', false, false]);
  await api('POST', '/ai/email-tmas', jwt, { summary, tmas: 'de' });
  job = await lastJob();
  check('email-tmas without photoIds → job has no photo fields', [job?.to, 'photoIds' in job], ['medico@tmas-germany.de', false]);

  // ---- validation, before any database access -------------------------------
  const fakeId = '00000000-0000-4000-8000-000000000000';
  check('partner with photoIds → 400', (await api('POST', '/ai/generate-pdf', key, { summary, photoIds: [fakeId] })).status, 400);
  check('partner email-tmas with photoIds → 400', (await api('POST', '/ai/email-tmas', key, { summary, tmas: 'de', photoIds: [fakeId] })).status, 400);
  check('more than 8 photoIds → 400', (await api('POST', '/ai/generate-pdf', jwt, { summary, photoIds: Array(9).fill(fakeId) })).status, 400);
  check('non-uuid photoId → 400', (await api('POST', '/ai/generate-pdf', jwt, { summary, photoIds: ['x'] })).status, 400);
  check('upload without auth → 401', (await upload(null, photo, 'image/jpeg')).status, 401);
  check('upload a non-image type → 400', (await upload(jwt, Buffer.from('hello'), 'text/plain')).status, 400);
  check('upload unreadable "jpeg" → 400', (await upload(jwt, Buffer.from('not really a jpeg'), 'image/jpeg')).status, 400);

  if (!hasTable) {
    // ---- pre028: errors, not hangs, and never a PDF missing its photos ------
    check('pre028: upload → 500', (await upload(jwt, photo, 'image/jpeg')).status, 500);
    check('pre028: GET photo → 500', (await api('GET', `/ai/exam-media/photos/${fakeId}`, jwt)).status, 500);
    check('pre028: DELETE photo → 500', (await api('DELETE', `/ai/exam-media/photos/${fakeId}`, jwt)).status, 500);
    check('pre028: generate-pdf with photoIds → 502, not a PDF without them',
      (await api('POST', '/ai/generate-pdf', jwt, { summary, template: 'marina', photoIds: [fakeId] })).status, 502);
  } else {
    // ---- upload and read back -----------------------------------------------
    const up = await upload(jwt, photo, 'image/jpeg');
    check('upload → 201 with photoId', [up.status, typeof up.body?.photoId], [201, 'string']);
    const id = up.body.photoId;
    check('stored copy is much smaller than the upload', up.body.byteSize < photo.length / 3, true);

    const got = await api('GET', `/ai/exam-media/photos/${id}`, jwt);
    const meta = await sharp(got.buf).metadata();
    check('GET own photo → JPEG, 1200 px, no EXIF/GPS',
      [got.status, got.headers.get('content-type'), meta.width, meta.exif === undefined], [200, 'image/jpeg', 1200, true]);
    check('GET → not cacheable', got.headers.get('cache-control'), 'private, no-store');
    check('GET another user\'s photo → 404', (await api('GET', `/ai/exam-media/photos/${id}`, otherJwt)).status, 404);
    check('GET bad id → 404', (await api('GET', '/ai/exam-media/photos/nope', jwt)).status, 404);

    const otherUp = await upload(otherJwt, photo, 'image/jpeg');
    const conv = (await query(`INSERT INTO conversations (user_id, mode) VALUES ($1, 'note_taker') RETURNING id`, [other])).rows[0].id;
    check('upload naming someone else\'s conversation → 404', (await upload(jwt, photo, 'image/jpeg', { conversationId: conv })).status, 404);

    // ---- photo pages ----------------------------------------------------------
    const one = await api('POST', '/ai/generate-pdf', jwt, { summary, template: 'marina', photoIds: [id] });
    check('marina + 1 photo → one extra page', [one.status, await pages(one.buf)], [200, basePages + 1]);
    const up2 = (await upload(jwt, photo, 'image/jpeg')).body.photoId;
    const up3 = (await upload(jwt, await sharp(photo).negate().jpeg().toBuffer(), 'image/jpeg')).body.photoId;
    const three = await api('POST', '/ai/generate-pdf', jwt, { summary, template: 'marina', photoIds: [id, up3, up2] });
    // id and up2 are the same image: embedded once, so two photos, one page.
    check('same image twice + another → one extra page', [three.status, await pages(three.buf)], [200, basePages + 1]);

    const rmdBase = await api('POST', '/ai/generate-pdf', jwt, { summary, template: 'rmd' });
    const rmd = await api('POST', '/ai/generate-pdf', jwt, { summary, template: 'rmd', photoIds: [id] });
    check('rmd (pdftk) + 1 photo → one extra page', [rmd.status, await pages(rmd.buf)], [200, (await pages(rmdBase.buf)) + 1]);

    const foreign = await api('POST', '/ai/generate-pdf', jwt, { summary, template: 'marina', photoIds: [otherUp.body.photoId] });
    check('another user\'s photoId is skipped, not added', [foreign.status, await pages(foreign.buf)], [200, basePages]);

    const { rows: [audit] } = await query(
      `SELECT metadata FROM audit_logs WHERE event_type = 'pdf_generated' ORDER BY created_at DESC LIMIT 1`);
    check('audit records photos requested', audit?.metadata.photos_requested, 1);

    // ---- email jobs carry ids, never images ----------------------------------
    await api('POST', '/ai/email-pdf', jwt, { summary, photoIds: [id] });
    job = await lastJob();
    check('email-pdf with photoIds → job carries ids and owner', [job?.photoIds, job?.photoUserId], [[id], user]);
    await api('POST', '/ai/email-tmas', jwt, { summary, tmas: 'de', photoIds: [id] });
    job = await lastJob();
    check('email-tmas with photoIds → job carries ids, TMAS fields intact', [job?.to, job?.tmasId, job?.photoIds, job?.photoUserId], ['medico@tmas-germany.de', 'de', [id], user]);

    // ---- delete ---------------------------------------------------------------
    check('DELETE another user\'s photo → 404', (await api('DELETE', `/ai/exam-media/photos/${id}`, otherJwt)).status, 404);
    check('DELETE own photo → 204', (await api('DELETE', `/ai/exam-media/photos/${id}`, jwt)).status, 204);
    check('GET after delete → 404', (await api('GET', `/ai/exam-media/photos/${id}`, jwt)).status, 404);
    check('row is really gone', (await query('SELECT count(*)::int AS n FROM report_photos WHERE id = $1', [id])).rows[0].n, 0);
    const gone = await api('POST', '/ai/generate-pdf', jwt, { summary, template: 'marina', photoIds: [id] });
    check('generate-pdf with a deleted photoId → no photo page', [gone.status, await pages(gone.buf)], [200, basePages]);
  }

  await emailQueue.drain(true);
  await emailQueue.resume();
  await pool.end();
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 90_000).unref();
main().catch((e) => { console.error(e); process.exit(1); });
