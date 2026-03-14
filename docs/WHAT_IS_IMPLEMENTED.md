  What's implemented

  ┌─────────────────┬────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────┐
  │      Layer      │              File              │                                What it does                                 │
  ├─────────────────┼────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ Config          │ src/config.ts                  │ Typed env loader — throws on startup if any required var missing            │
  ├─────────────────┼────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ DB              │ src/lib/db.ts                  │ pg.Pool with query() + transaction() helpers                                │
  ├─────────────────┼────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ Redis           │ src/lib/redis.ts               │ ioredis client with error/ready logging                                     │
  ├─────────────────┼────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ Password        │ src/lib/password.ts            │ Argon2id hash/verify + constant-time dummy path (prevents user enumeration) │
  ├─────────────────┼────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ JWT             │ src/lib/jwt.ts                 │ RS256 sign/verify via jose, lazy key import, cached                         │
  ├─────────────────┼────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ HMAC tokens     │ src/lib/tokens.ts              │ Self-validating signed tokens for email verify + password reset             │
  ├─────────────────┼────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ Rate limiting   │ src/lib/rateLimit.ts           │ Redis sliding-window, fails open if Redis unavailable                       │
  ├─────────────────┼────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ Email           │ src/lib/email.ts               │ Nodemailer + HTML templates for verify/reset emails                         │
  ├─────────────────┼────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ Auth middleware │ src/middleware/requireAuth.ts  │ Bearer JWT extraction + sets req.user                                       │
  ├─────────────────┼────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ Auth routes     │ src/routes/auth.ts             │ All 10 endpoints with Zod validation, audit logging, device detection       │
  ├─────────────────┼────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ App bootstrap   │ src/index.ts                   │ Helmet, CORS, cookie-parser, morgan, error handler                          │
  ├─────────────────┼────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ Migration       │ migrations/001_auth_tables.sql │ Idempotent SQL — adds columns to users, creates refresh_tokens + audit_logs │
  ├─────────────────┼────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ Key generator   │ scripts/generate-keys.ts       │ RSA-4096 keypair → prints .env-ready lines                                  │
  └─────────────────┴────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────┘

  Next steps to go live

  cd /Users/marinahealth/Documents/marina-api
  cp .env.example .env
  npm run generate-keys     # paste into .env
  # openssl rand -hex 32   (twice → EMAIL_SECRET, RESET_SECRET)
  npm run migrate           # runs against OVH PostgreSQL
  npm run dev               # starts on :4000
