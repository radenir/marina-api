import { redis } from './redis';
import type { Request, Response, NextFunction } from 'express';

interface RateLimitOptions {
  /** Redis key prefix */
  prefix: string;
  /** Max requests in window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
  /** Key builder from request — defaults to IP */
  keyFn?: (req: Request) => string;
}

/**
 * Redis sliding-window rate limiter middleware.
 * Uses a sorted set (ZRANGEBYSCORE + ZADD + EXPIRE) for accurate counting.
 */
export function rateLimit(opts: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identifier = opts.keyFn ? opts.keyFn(req) : getIp(req);
    const key = `rl:${opts.prefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - opts.windowSeconds * 1000;

    try {
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(key, '-inf', windowStart);
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      pipeline.zcard(key);
      pipeline.expire(key, opts.windowSeconds);
      const results = await pipeline.exec();

      const count = (results?.[2]?.[1] as number) ?? 0;

      res.setHeader('X-RateLimit-Limit', opts.limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, opts.limit - count));
      res.setHeader('X-RateLimit-Reset', Math.ceil((now + opts.windowSeconds * 1000) / 1000));

      if (count > opts.limit) {
        res.status(429).json({
          error: 'Too many requests',
          retryAfter: opts.windowSeconds,
        });
        return;
      }
    } catch (err) {
      // Redis unavailable — fail open (log and continue)
      console.error('[rateLimit] Redis error, failing open:', (err as Error).message);
    }

    next();
  };
}

function getIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}
