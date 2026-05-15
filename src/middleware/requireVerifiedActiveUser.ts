import type { Request, Response, NextFunction } from 'express';
import { query } from '../lib/db.js';

/**
 * Combined replacement for `requireVerifiedEmail` + `requireActiveUser`
 * on routes that accept both user and partner principals. Partners
 * short-circuit (they're gated by the API key itself); users go through
 * the same email-verified + is-active checks as before, in one query.
 */
export async function requireVerifiedActiveUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = req.principal;
  if (!principal) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (principal.type === 'partner') return next();

  try {
    const result = await query<{ email_verified: boolean; is_active: boolean }>(
      'SELECT email_verified, is_active FROM users WHERE id = $1',
      [principal.userId],
    );
    const row = result.rows[0];
    if (!row) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    if (!row.email_verified) {
      res.status(403).json({ error: 'Email address not verified' });
      return;
    }
    if (!row.is_active) {
      res.status(403).json({ error: 'Account is inactive' });
      return;
    }
    next();
  } catch (err) {
    console.error('[requireVerifiedActiveUser] DB error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
