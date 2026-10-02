/**
 * Short-lived partner tokens (`mpt_…`).
 *
 * A partner backend holds its long-lived `mk_live_` API key and trades it for
 * one of these via POST /partner/tokens, then hands the token to its mobile
 * app so audio can go straight to Marina instead of through the partner's
 * servers. See middleware/authenticate.ts for where they are accepted.
 *
 * WHY HMAC AND NOT THE JWT KEY
 * verifyAccessToken() (lib/jwt.ts) checks only signature and expiry. A token
 * signed with the same RS256 key would, with its prefix stripped, pass as a
 * user login token — and stopping that would mean changing the user login
 * path. Signing with a separate HMAC secret means the RS256-only verifier
 * rejects these outright, with no change to it.
 *
 * WHY THE SECRET IS OPTIONAL
 * config.ts refuses to start when a required variable is missing, so making
 * this one required would break the next deploy. Unset, minting returns 503
 * and every `mpt_` token is rejected — the API behaves exactly as before.
 *
 * Format: mpt_<base64url(JSON payload)>.<base64url(HMAC-SHA256 signature)>
 */
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { config } from '../config.js';

export const PARTNER_TOKEN_PREFIX = 'mpt_';

/**
 * The most a token can ever do. Intersected with the key's CURRENT scopes on
 * every request, so removing a scope from a key removes it from its tokens.
 * `pdf:email` is deliberately absent: a phone must not be able to mail a
 * medical PDF to an arbitrary address.
 */
export const PARTNER_TOKEN_SCOPES: readonly string[] = ['transcribe:write', 'extract:write', 'pdf:write'];

export interface PartnerTokenPayload {
  /** partner_api_clients.id of the key that minted the token. */
  cid: string;
  /** partners.id */
  pid: string;
  /** The partner's opaque end-user ref, fixed at mint time. */
  ref: string;
  jti: string;
  iat: number;
  exp: number;
}

export function partnerTokensEnabled(): boolean {
  return config.partnerToken.secret !== null;
}

function sign(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function mintPartnerToken(input: {
  apiClientId: string;
  partnerId: string;
  userRef: string;
  ttlSeconds: number;
}): { token: string; payload: PartnerTokenPayload } {
  const secret = config.partnerToken.secret;
  if (!secret) throw new Error('Partner tokens are not configured');

  const now = Math.floor(Date.now() / 1000);
  const payload: PartnerTokenPayload = {
    cid: input.apiClientId,
    pid: input.partnerId,
    ref: input.userRef,
    jti: randomUUID(),
    iat: now,
    exp: now + input.ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { token: `${PARTNER_TOKEN_PREFIX}${encoded}.${sign(secret, encoded)}`, payload };
}

/** Throws on any problem; callers map every failure to the same generic 401. */
export function verifyPartnerToken(token: string): PartnerTokenPayload {
  const secret = config.partnerToken.secret;
  if (!secret) throw new Error('Partner tokens are not configured');
  if (!token.startsWith(PARTNER_TOKEN_PREFIX)) throw new Error('Not a partner token');

  const parts = token.slice(PARTNER_TOKEN_PREFIX.length).split('.');
  if (parts.length !== 2) throw new Error('Invalid token format');
  const [encoded, sig] = parts;

  const given = Buffer.from(sig, 'base64url');
  const expected = Buffer.from(sign(secret, encoded), 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<PartnerTokenPayload>;
  if (
    typeof payload.cid !== 'string' || typeof payload.pid !== 'string' ||
    typeof payload.ref !== 'string' || typeof payload.exp !== 'number'
  ) {
    throw new Error('Invalid token payload');
  }
  if (Math.floor(Date.now() / 1000) >= payload.exp) throw new Error('Token expired');

  return payload as PartnerTokenPayload;
}
