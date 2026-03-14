import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { config } from './config';
import { authRouter } from './routes/auth';
import { pool } from './lib/db';
import { redis } from './lib/redis';

const app = express();

// ---------------------------------------------------------------------------
// Trust proxy (for correct IP behind nginx/load balancer)
// SECURITY: This trusts X-Forwarded-For from the first upstream hop.
// The API MUST always sit behind a reverse proxy in production — if exposed
// directly to the internet, clients can forge X-Forwarded-For to bypass all
// IP-based rate limits (login brute force, registration, password reset).
// ---------------------------------------------------------------------------
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Security middleware
// ---------------------------------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  frameguard: { action: 'deny' },
  hsts: {
    maxAge: 31_536_000,
    includeSubDomains: true,
    preload: true,
  },
}));

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return cb(null, true);
    if (config.allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/auth', authRouter);

// ---------------------------------------------------------------------------
// 404
// ---------------------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status: number = err.status ?? err.statusCode ?? 500;
  if (status === 413) {
    return res.status(413).json({ error: 'Request too large' });
  }
  if (typeof err.message === 'string' && err.message.startsWith('CORS:')) {
    return res.status(403).json({ error: 'CORS: origin not allowed' });
  }
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function start() {
  // Connect redis eagerly
  await redis.connect();

  // Verify DB connection
  await pool.query('SELECT 1');
  console.log('[db] connected');

  app.listen(config.port, () => {
    console.log(`[server] marina-api running on port ${config.port} (${config.nodeEnv})`);
  });
}

start().catch((err) => {
  console.error('[startup] fatal error:', err.message);
  process.exit(1);
});
