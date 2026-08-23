import type { Request, Response, NextFunction } from 'express';

const DEVICE_HEADER = 'x-marina-device';
const DEVICE_ID_MAX_LEN = 128;

function getIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

/**
 * Assigns an anonymous principal for the free, no-login Note Taker routes
 * (`/free/ai/*`). Unlike `authenticate`, it NEVER rejects for a missing
 * Authorization header — the whole point is that a signed-out client can reach
 * a small, rate-limited subset of the AI surface.
 *
 * `deviceId` comes from the `x-marina-device` header (a per-install id the app
 * generates) and falls back to the caller IP. It is used only as a rate-limit
 * key; it is not an identity and grants no access to any user or partner data.
 * Because it is client-supplied it can be rotated, so the free rate limiters
 * also fall back to IP — see `freeRateLimitKey` in routes/ai.ts. Stronger
 * abuse control (App Attest / DeviceCheck) is a deliberate future step.
 *
 * Apply ONLY to the `/free/ai/*` routes. The authenticated `/ai` and `/v2/ai`
 * routes keep `authenticate`, so this adds no anonymous access to them.
 */
export function allowAnonymous(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const raw = req.headers[DEVICE_HEADER];
  let deviceId = typeof raw === 'string' ? raw.trim() : '';
  if (deviceId.length === 0 || deviceId.length > DEVICE_ID_MAX_LEN) {
    deviceId = getIp(req);
  }
  req.principal = { type: 'anonymous', deviceId };
  next();
}
