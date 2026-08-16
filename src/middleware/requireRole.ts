import type { Request, Response, NextFunction } from 'express';
import { query } from '../lib/db.js';

/**
 * Gate a route on the account's role, and attach its organisation.
 *
 * The role is read from the database, not from the JWT. Access tokens are
 * signed by `signAccessToken(user.id)` with no roles argument, so
 * `req.user.role` is always 'user' regardless of what the row says — trusting
 * the token here would let every account through.
 *
 * A management or doctor account with no `org_id` is rejected: an
 * organisation is the scope of every read these roles perform, and a null
 * scope must never fall through to "everything".
 */

export type AccountRole = 'officer' | 'management' | 'doctor';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireRole: the organisation this account acts within. */
      orgId?: string;
      accountRole?: AccountRole;
    }
  }
}

interface AccountRow {
  role: string;
  org_id: string | null;
  is_active: boolean;
}

export function requireRole(...allowed: AccountRole[]) {
  return async function roleGuard(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const result = await query<AccountRow>(
        'SELECT role, org_id, is_active FROM users WHERE id = $1',
        [userId],
      );
      const row = result.rows[0];

      if (!row) {
        res.status(401).json({ error: 'User not found' });
        return;
      }
      if (!row.is_active) {
        res.status(403).json({ error: 'Account is inactive' });
        return;
      }
      if (!allowed.includes(row.role as AccountRole)) {
        res.status(403).json({ error: 'Not permitted for this account' });
        return;
      }
      if (!row.org_id) {
        res.status(403).json({ error: 'Account is not attached to an organisation' });
        return;
      }

      req.accountRole = row.role as AccountRole;
      req.orgId = row.org_id;
      next();
    } catch (err) {
      console.error('[requireRole] DB error:', (err as Error).message);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * Record that this account's device reached the API.
 *
 * "Live" on the fleet board has to mean "as of the last connection", and a
 * board that looks current while a vessel has been dark for six hours is
 * worse than no board. Throttled to one write per five minutes per account by
 * the WHERE clause, and deliberately fire-and-forget: this sits on the hot
 * path of every authenticated request, so it must never delay or fail one.
 */
export function touchLastSeen(userId: string): void {
  void query(
    `UPDATE users
        SET last_seen_at = NOW()
      WHERE id = $1
        AND (last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL '5 minutes')`,
    [userId],
  ).catch((err: Error) => {
    console.error('[touchLastSeen] ignored:', err.message);
  });
}
