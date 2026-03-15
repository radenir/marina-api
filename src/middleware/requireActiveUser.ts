import type { Request, Response, NextFunction } from 'express';
import { query } from '../lib/db.js';

export async function requireActiveUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await query<{ is_active: boolean }>(
      'SELECT is_active FROM users WHERE id = $1',
      [req.user!.id]
    );

    const user = result.rows[0];
    if (!user || !user.is_active) {
      res.status(403).json({ error: 'Account is inactive' });
      return;
    }

    next();
  } catch (err) {
    console.error('[requireActiveUser] DB error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
