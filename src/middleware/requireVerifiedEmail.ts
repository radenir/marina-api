import type { Request, Response, NextFunction } from 'express';
import { query } from '../lib/db.js';

export async function requireVerifiedEmail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await query<{ email_verified: boolean }>(
      'SELECT email_verified FROM users WHERE id = $1',
      [req.user!.id]
    );

    const user = result.rows[0];
    if (!user || !user.email_verified) {
      res.status(403).json({ error: 'Email address not verified' });
      return;
    }

    next();
  } catch (err) {
    console.error('[requireVerifiedEmail] DB error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
