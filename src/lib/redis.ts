import Redis from 'ioredis';
import { config } from '../config';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableReadyCheck: true,
});

redis.on('error', (err) => {
  console.error('[redis] connection error:', err.message);
});

redis.on('ready', () => {
  console.log('[redis] connected');
});
