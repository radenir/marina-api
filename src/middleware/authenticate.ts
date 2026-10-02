import type { Request, Response, NextFunction } from 'express';
import { isIP } from 'net';
import { verifyAccessToken } from '../lib/jwt.js';
import { query } from '../lib/db.js';
import { sha256hex } from '../lib/tokens.js';
import { PARTNER_TOKEN_PREFIX, PARTNER_TOKEN_SCOPES, verifyPartnerToken } from '../lib/partnerTokens.js';

const API_KEY_PREFIX = 'mk_live_';
const PARTNER_USER_REF_HEADER = 'x-partner-user-ref';
const PARTNER_USER_REF_MAX_LEN = 200;

interface ApiClientRow {
  id: string;
  partner_id: string;
  scopes: string[];
}

/**
 * Accepts a JWT (existing user flow), a partner API key
 * (`Authorization: Bearer mk_live_…`) or a short-lived partner token minted
 * from one (`Bearer mpt_…`), and populates `req.principal`.
 *
 * Failure responses are deliberately generic ("Invalid API key" / "Unauthorized")
 * so callers can't probe whether a key exists, is revoked, is expired, or is
 * coming from a disallowed IP — every case returns the same 401.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }
  const token = auth.slice(7);

  // Short-lived partner token. No API key starts with `mpt_` and no JWT can
  // (a JWT starts with "eyJ"), so this branch is reachable only by tokens
  // minted at POST /partner/tokens — the two paths below are unchanged.
  if (token.startsWith(PARTNER_TOKEN_PREFIX)) {
    await authenticatePartnerToken(token, req, res, next);
    return;
  }

  if (token.startsWith(API_KEY_PREFIX)) {
    await authenticateApiKey(token, req, res, next);
    return;
  }
  await authenticateJwt(token, req, res, next);
}

async function authenticateApiKey(
  token: string,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const clientIp = getIp(req);

  // Reject malformed IPs up front so the inet cast below can never throw.
  // `trust proxy 1` is set in src/index.ts so req.ip / X-Forwarded-For
  // should always be a valid IP in production.
  if (isIP(clientIp) === 0) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  const hash = sha256hex(token);

  try {
    const result = await query<ApiClientRow>(
      `SELECT id, partner_id, scopes
         FROM partner_api_clients
        WHERE key_hash = $1
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())
          AND (
            allowed_ips IS NULL
            OR cardinality(allowed_ips) = 0
            OR $2::inet <<= ANY(allowed_ips)
          )`,
      [hash, clientIp],
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    const client = result.rows[0];
    req.principal = {
      type: 'partner',
      partnerId: client.partner_id,
      apiClientId: client.id,
      scopes: client.scopes ?? [],
      partnerUserRef: readPartnerUserRef(req),
    };

    // Fire-and-forget — never block the request on this.
    void query(
      'UPDATE partner_api_clients SET last_used_at = NOW() WHERE id = $1',
      [client.id],
    ).catch((err) =>
      console.error(
        '[authenticate] last_used_at update failed:',
        (err as Error).message,
      ),
    );

    next();
  } catch (err) {
    console.error('[authenticate] API key lookup error:', (err as Error).message);
    res.status(401).json({ error: 'Invalid API key' });
  }
}

/**
 * Accepts a short-lived `mpt_` token minted from an API key.
 *
 * The signature proves we minted it; the lookup proves the key behind it is
 * still good, so revoking or expiring a key stops its tokens on the next
 * request rather than up to 15 minutes later. No IP allowlist here — tokens
 * exist for phones, which have no fixed egress — and the short lifetime plus
 * the narrowed scopes are what stand in for it.
 */
async function authenticatePartnerToken(
  token: string,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let payload;
  try {
    payload = verifyPartnerToken(token);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  try {
    const result = await query<ApiClientRow>(
      `SELECT id, partner_id, scopes
         FROM partner_api_clients
        WHERE id = $1
          AND partner_id = $2
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())`,
      [payload.cid, payload.pid],
    );
    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const client = result.rows[0];
    req.principal = {
      type: 'partner',
      partnerId: client.partner_id,
      apiClientId: client.id,
      scopes: (client.scopes ?? []).filter((s) => PARTNER_TOKEN_SCOPES.includes(s)),
      partnerUserRef: payload.ref,
      via: 'token',
    };
    next();
  } catch (err) {
    console.error('[authenticate] partner token lookup error:', (err as Error).message);
    res.status(401).json({ error: 'Invalid token' });
  }
}

async function authenticateJwt(
  token: string,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const payload = await verifyAccessToken(token);
    const role = payload.roles[0] ?? 'user';
    req.user = { id: payload.sub, role };
    req.jti = payload.jti;
    req.principal = { type: 'user', userId: payload.sub, role };
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid token';
    res.status(401).json({ error: `Unauthorized: ${message}` });
  }
}

function readPartnerUserRef(req: Request): string | undefined {
  const raw = req.headers[PARTNER_USER_REF_HEADER];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > PARTNER_USER_REF_MAX_LEN) return undefined;
  return trimmed;
}

function getIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}
