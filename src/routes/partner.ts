import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { rateLimit } from '../lib/rateLimit.js';
import { query } from '../lib/db.js';
import { sha256hex } from '../lib/tokens.js';
import { config } from '../config.js';
import { mintPartnerToken, partnerTokensEnabled, PARTNER_TOKEN_SCOPES } from '../lib/partnerTokens.js';

export const partnerRouter = Router();

// ---------------------------------------------------------------------------
// POST /partner/tokens
// A partner backend trades its long-lived `mk_live_` API key for a short-lived
// `mpt_` token it can hand to its own app, so the app calls /ai/transcribe,
// /ai/extract and /ai/generate-pdf directly and the key never leaves the
// partner's servers. See lib/partnerTokens.ts.
//
// API key only: the key's IP allowlist is what makes minting safe, so a user
// JWT or an existing token cannot mint (a token minting tokens would make the
// 15-minute lifetime meaningless).
// Middleware order: authenticate → requireApiKey → mintRateLimit → handler
// ---------------------------------------------------------------------------

function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const p = req.principal;
  if (!p || p.type !== 'partner' || p.via === 'token') {
    res.status(403).json({ error: 'A partner API key is required to mint tokens' });
    return;
  }
  next();
}

function apiClientKey(req: Request): string {
  const p = req.principal;
  return p && p.type === 'partner' ? p.apiClientId : 'unknown';
}

// Generous: one token per end-user every 15 minutes is 4/hr, so this covers
// ~150 concurrently active app users per key before anyone needs to ask.
const mintRateLimit = rateLimit({
  prefix: 'partner-token-mint',
  limit: 600,
  windowSeconds: 60 * 60,
  keyFn: apiClientKey,
});

const MintSchema = z.object({
  userRef: z.string().trim().min(1).max(200),
  ttlSeconds: z.number().int().min(60).max(config.partnerToken.maxTtlSeconds).optional(),
});

partnerRouter.post(
  '/tokens',
  authenticate,
  requireApiKey,
  mintRateLimit,
  async (req: Request, res: Response): Promise<void> => {
    if (!partnerTokensEnabled()) {
      res.status(503).json({ error: 'Short-lived tokens are not enabled on this server' });
      return;
    }

    const parsed = MintSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const principal = req.principal;
    if (!principal || principal.type !== 'partner') {
      res.status(403).json({ error: 'A partner API key is required to mint tokens' });
      return;
    }

    const ttlSeconds = parsed.data.ttlSeconds ?? config.partnerToken.defaultTtlSeconds;
    const { token, payload } = mintPartnerToken({
      apiClientId: principal.apiClientId,
      partnerId: principal.partnerId,
      userRef: parsed.data.userRef,
      ttlSeconds,
    });

    try {
      await query(
        `INSERT INTO audit_logs (user_id, partner_id, api_client_id, event_type, ip_address_hash, user_agent_hash, metadata)
         VALUES (NULL, $1, $2, 'partner_token_minted', $3, $4, $5)`,
        [
          principal.partnerId,
          principal.apiClientId,
          sha256hex(req.ip ?? ''),
          sha256hex(req.headers['user-agent'] ?? ''),
          JSON.stringify({ jti: payload.jti, ttl_seconds: ttlSeconds, partner_user_ref: payload.ref }),
        ],
      );
    } catch (err) {
      console.error('[audit] failed to write log:', (err as Error).message);
    }

    res.status(201).json({
      token,
      tokenType: 'Bearer',
      expiresIn: ttlSeconds,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      scopes: principal.scopes.filter((s) => PARTNER_TOKEN_SCOPES.includes(s)),
    });
  },
);
