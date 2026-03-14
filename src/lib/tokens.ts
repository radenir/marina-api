import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { config } from '../config';

/**
 * Generate a self-validating HMAC token.
 * Format: base64url(JSON payload).base64url(HMAC-SHA256 signature)
 */

interface TokenPayload {
  userId: string;
  iat: number;
  exp: number;
  version?: number;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64url');
}

function hmacSign(secret: string, data: string): string {
  return base64url(
    createHmac('sha256', secret).update(data).digest()
  );
}

export function generateSignedToken(
  userId: string,
  ttlSeconds: number,
  secret: string,
  version?: number
): string {
  const payload: TokenPayload = {
    userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    ...(version !== undefined ? { version } : {}),
  };

  const encodedPayload = base64url(JSON.stringify(payload));
  const sig = hmacSign(secret, encodedPayload);
  return `${encodedPayload}.${sig}`;
}

export interface VerifiedToken {
  userId: string;
  version?: number;
}

export function verifySignedToken(
  token: string,
  secret: string
): VerifiedToken {
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Invalid token format');

  const [encodedPayload, sig] = parts;
  const expectedSig = hmacSign(secret, encodedPayload);

  // Timing-safe comparison
  const sigBuf = Buffer.from(sig, 'base64url');
  const expectedBuf = Buffer.from(expectedSig, 'base64url');
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error('Invalid token signature');
  }

  const payload: TokenPayload = JSON.parse(
    Buffer.from(encodedPayload, 'base64url').toString('utf8')
  );

  if (Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error('Token expired');
  }

  return { userId: payload.userId, version: payload.version };
}

/** Generate a cryptographically random opaque refresh token (base64url, 32 bytes) */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA256 hex digest of a string — for storing opaque tokens or hashing PII */
export function sha256hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
