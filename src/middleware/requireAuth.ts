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
    // email is intentionally not stored in the JWT — fetch from DB if needed
    req.user = { id: payload.sub, role: payload.roles[0] ?? 'user' };
    req.jti = payload.jti;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid token';
    res.status(401).json({ error: `Unauthorized: ${message}` });
  }
}
