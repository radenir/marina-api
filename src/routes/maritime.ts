import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { findNearestPorts, portCount } from '../lib/portIndex';

export const maritimeRouter = Router();

// Coerce string query params to numbers; reject anything out of WGS-84 range.
const NearestPortQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  limit: z.coerce.number().int().min(1).max(50).optional().default(5),
  // Cap the search radius so a query in the middle of the Pacific doesn't
  // pretend Honolulu is "near". Default 2000 km is generous for routing.
  max_km: z.coerce.number().min(1).max(20000).optional().default(2000),
});

// GET /maritime/nearest-port?lat=55.6&lon=12.5&limit=5&max_km=500
maritimeRouter.get(
  '/nearest-port',
  requireAuth,
  (req: Request, res: Response): void => {
    const parsed = NearestPortQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }
    const { lat, lon, limit, max_km } = parsed.data;
    const ports = findNearestPorts(lat, lon, limit, max_km);
    res.json({ ports, total_indexed: portCount() });
  },
);
