import type { Request, Response, NextFunction } from 'express';

/**
 * Scope check for partner principals. User principals (JWT) bypass — scopes
 * are a partner-only concept; user permissions are governed by req.user.role.
 *
 * Usage: `requireScope('extract:write')` after `authenticate`.
 */
export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const principal = req.principal;
    if (!principal) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (principal.type === 'user') return next();
    if (principal.type === 'anonymous') {
      res.status(403).json({ error: `Missing required scope: ${scope}` });
      return;
    }
    if (principal.scopes.includes(scope)) return next();
    res.status(403).json({ error: `Missing required scope: ${scope}` });
  };
}
