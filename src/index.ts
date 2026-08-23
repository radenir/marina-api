import 'dotenv/config';
import path from 'path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { config } from './config';
import { authRouter } from './routes/auth';
import { aiRouter, aiV2Router, aiFreeRouter } from './routes/ai';
import { casesRouter } from './routes/cases';
import { fleetRouter } from './routes/fleet';
import { conversationsRouter } from './routes/conversations';
import { maritimeRouter } from './routes/maritime';
import { pool } from './lib/db';
import { redis } from './lib/redis';
import { createEmailWorker } from './lib/emailQueue';

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
// Path-specific body size limits. body-parser checks req._body and skips
// re-parsing, so the global 10kb limit below won't override these.
//
// /ai/interview — conversationHistory accumulates all tool-use messages across
//   9 stages and can reach ~400kb by the final stage.
// /ai/extract  — visible conversation (user+assistant text only) sent after
//   a full interview can be 50-100kb.
app.use('/ai/interview', express.json({ limit: '1mb' }));
app.use('/ai/extract', express.json({ limit: '1mb' }));
app.use('/v2/ai/extract', express.json({ limit: '1mb' }));
// /v2/ai/revise-field — a long Investigations or Physical Examination draft
//   plus the spoken instruction exceeds the 10kb default.
app.use('/v2/ai/revise-field', express.json({ limit: '1mb' }));
// Free, no-login Note Taker carries the same large extract/revise bodies.
app.use('/free/ai/extract', express.json({ limit: '1mb' }));
app.use('/free/ai/revise-field', express.json({ limit: '1mb' }));
app.use('/free/ai/revise-vitals', express.json({ limit: '1mb' }));
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

// Domain validation files
app.get('/88f0890a3f0963ee1584b36186bf8382.txt', (_req, res) => {
  res.set('Content-Type', 'text/plain').send('');
});
app.get('/5623acf06b367e73e7acd16fd111529a.txt', (_req, res) => {
  res.set('Content-Type', 'text/plain').send('');
});

// Demo videos for examination suggestions. Served cross-origin so the
// eu.marinahealth.eu frontend can embed them via <video src="…">. Helmet's
// default Cross-Origin-Resource-Policy is "same-origin" which would block
// that, so we override CORP on this route only.
app.use(
  '/videos',
  (_req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(path.join(process.cwd(), 'public', 'videos'), {
    maxAge: '7d',
  }),
);

app.use('/auth', authRouter);
app.use('/ai', aiRouter);
app.use('/v2/ai', aiV2Router);
app.use('/free/ai', aiFreeRouter);
app.use('/conversations', conversationsRouter);
app.use('/cases', casesRouter);
app.use('/fleet', fleetRouter);
app.use('/maritime', maritimeRouter);

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

  // Start email queue worker
  const emailWorker = createEmailWorker();
  console.log('[email-queue] worker started');

  const server = app.listen(config.port, () => {
    console.log(`[server] marina-api running on port ${config.port} (${config.nodeEnv})`);
  });

  // Graceful shutdown — finish in-flight jobs before exiting
  async function shutdown(signal: string) {
    console.log(`[server] ${signal} received, shutting down`);
    server.close();
    await emailWorker.close();
    await redis.quit();
    await pool.end();
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('[startup] fatal error:', err.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection] — process kept alive:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] — process kept alive:', err.message, err.stack);
});
