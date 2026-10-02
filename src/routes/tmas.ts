import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { rateLimit } from '../lib/rateLimit.js';
import { TMAS } from '../lib/tmas.js';

export const tmasRouter = Router();

// ---------------------------------------------------------------------------
// GET /tmas
// The TMAS directory: each service's contact details, the form it receives
// (`template`, as accepted by /ai/generate-pdf) and the one address
// /ai/email-pdf sends to when called with `tmas: <id>`. Static data, so any
// authenticated caller may read it — user JWT, partner API key or short-lived
// token — without a scope.
// ---------------------------------------------------------------------------

function callerKey(req: Request): string {
  const p = req.principal;
  if (p?.type === 'user') return `u:${p.userId}`;
  if (p?.type === 'partner') return `p:${p.apiClientId}`;
  return req.ip ?? 'unknown';
}

const tmasRateLimit = rateLimit({
  prefix: 'tmas-list',
  limit: 600,
  windowSeconds: 60 * 60,
  keyFn: callerKey,
});

tmasRouter.get('/', authenticate, tmasRateLimit, (_req: Request, res: Response): void => {
  res.json({ tmas: TMAS });
});
