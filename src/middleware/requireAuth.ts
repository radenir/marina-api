import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyAccessToken(token);
    const role = payload.roles[0] ?? 'user';
    // email is intentionally not stored in the JWT — fetch from DB if needed
    req.user = { id: payload.sub, role };
    req.jti = payload.jti;
    req.principal = { type: 'user', userId: payload.sub, role };
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid token';
    res.status(401).json({ error: `Unauthorized: ${message}` });
  }
}
