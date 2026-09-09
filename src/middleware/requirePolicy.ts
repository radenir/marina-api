import type { Request, Response, NextFunction } from 'express';
import { policyForUser } from '../lib/policyStore.js';
import type { PolicyKey } from '../lib/policy.js';

/**
 * Refuse a request the account's fleet has switched off.
 *
 * Hiding a button is not a control. The clients read the same policy from
 * GET /auth/me and hide the affected control, but that is cosmetics: this is
 * the part that has to hold when someone calls the endpoint directly, and it is
 * the part a customer's IT security review is actually asking about.
 *
 * Partner API clients short-circuit. Their access is governed by the API key
 * and its scopes (requireScope), they have no `users` row, and an integrator's
 * downstream customers are not members of the fleet whose policy this is.
 *
 * Usage: after `authenticate`, e.g. `requirePolicy('pdf_download')`.
 */
export function requirePolicy(key: PolicyKey) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const principal = req.principal;
    if (!principal) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (principal.type === 'partner') return next();
    if (principal.type === 'anonymous') {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const policy = await policyForUser(principal.userId);
      if (policy[key]) return next();

      // A distinct code, because the client has to say something true here.
      // "Download failed" would send an officer to look for a network problem
      // that does not exist; this is a decision their own company made.
      res.status(403).json({
        error: 'This feature has been disabled for your fleet',
        code: 'policy_disabled',
        policy: key,
      });
    } catch (err) {
      console.error(`[requirePolicy:${key}]`, (err as Error).message);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
