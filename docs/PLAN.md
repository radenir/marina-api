 Plan: marina-api — Standalone Secure Auth API                                                                                                                                                                                                                
                                                        
 Context
                                                                                                                                                                                                                                                              
 The existing Next.js app has critical auth vulnerabilities: API keys exposed in the frontend, 25+ unauthenticated medical endpoints, in-memory rate limiting that resets on restart, bcrypt (should be Argon2id), and no JWT — just session cookies stored   
 in PostgreSQL. We are rebuilding the auth layer as a standalone, platform-agnostic REST API at ../marina-api that any client (web, iOS, Android, desktop) can consume.                                                                                       

 ---
 Project Location

 /Users/marinahealth/Documents/marina-api/

 ---
 Architecture

 - Framework: Express + TypeScript
 - Password hashing: Argon2id (argon2 npm)
 - JWT: RS256 asymmetric keys via jose (Web Crypto-based)
 - Opaque refresh tokens: Cryptographically random, stored hashed in PostgreSQL
 - Rate limiting: ioredis (Redis-backed, persistent across restarts and replicas)
 - Email: Nodemailer via existing SMTP (smtp.office365.com:587)
 - Validation: zod (runtime schema validation on every request body)
 - Security middleware: helmet (security headers), cors (explicit allow-list)
 - Database: Same OVH PostgreSQL instance (shared with existing app), new tables via migration

 ---
 Folder Structure

 marina-api/
 ├── src/
 │   ├── index.ts               # Express app bootstrap, routes mount
 │   ├── config.ts              # Typed env var loader (throws on missing)
 │   ├── routes/
 │   │   └── auth.ts            # All /auth/* routes
 │   ├── middleware/
 │   │   └── requireAuth.ts     # JWT Bearer verification, sets req.user
 │   ├── lib/
 │   │   ├── db.ts              # pg.Pool, query(), transaction()
 │   │   ├── redis.ts           # ioredis client
 │   │   ├── jwt.ts             # signAccessToken(), verifyAccessToken() — RS256
 │   │   ├── tokens.ts          # generateSignedToken(), verifySignedToken() — HMAC
 │   │   ├── password.ts        # hashPassword(), verifyPassword() — Argon2id
 │   │   ├── rateLimit.ts       # Redis sliding-window rate limiter
 │   │   └── email.ts           # Nodemailer send helpers
 │   └── types/
 │       └── index.ts           # User, RefreshToken, AuditLog, JWTPayload interfaces
 ├── migrations/
 │   ├── 001_auth_tables.sql    # users table (+ new columns), refresh_tokens, audit_logs
 │   └── run.ts                 # Migration runner script
 ├── scripts/
 │   └── generate-keys.ts       # Generates RS256 key pair, prints to stdout
 ├── .env.example               # All required env vars documented
 ├── package.json
 ├── tsconfig.json
 └── README.md

 ---
 Database Changes

 New columns on existing users table (additive, backward-compatible)

 ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
 ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE;
 ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_requested_at TIMESTAMP WITH TIME ZONE;
 ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_version INT DEFAULT 0;
 ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash_algo VARCHAR(20) DEFAULT 'bcrypt';

 New refresh_tokens table

 CREATE TABLE refresh_tokens (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   token_hash VARCHAR(64) NOT NULL UNIQUE,   -- SHA256 hex of opaque token
   family_id UUID NOT NULL,                  -- Revoke entire chain on theft detection
   user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   device_name VARCHAR(255),                 -- "iPhone 14 Pro", "Chrome/macOS"
   device_type VARCHAR(20),                  -- "ios" | "android" | "web" | "server"
   ip_address_hash VARCHAR(64),              -- SHA256 of IP (no plain PII)
   expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
   used BOOLEAN DEFAULT FALSE,               -- Reuse = theft → revoke family
   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 );

 New audit_logs table

 CREATE TABLE audit_logs (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   user_id UUID REFERENCES users(id) ON DELETE SET NULL,
   event_type VARCHAR(50) NOT NULL,   -- "login_success" | "login_failed" | "token_refresh" | ...
   ip_address_hash VARCHAR(64),
   user_agent_hash VARCHAR(64),
   metadata JSONB,                    -- Extra context (no PII), e.g. {"device_type": "ios"}
   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 );

 ---
 Endpoints

 All under prefix /auth:

 ┌────────┬───────────────────────────┬────────────┬──────────────────────────────────────────────┐
 │ Method │           Path            │    Auth    │                 Description                  │
 ├────────┼───────────────────────────┼────────────┼──────────────────────────────────────────────┤
 │ POST   │ /auth/register            │ Public     │ Create user, send verification email         │
 ├────────┼───────────────────────────┼────────────┼──────────────────────────────────────────────┤
 │ POST   │ /auth/login               │ Public     │ Validate credentials, issue token pair       │
 ├────────┼───────────────────────────┼────────────┼──────────────────────────────────────────────┤
 │ POST   │ /auth/logout              │ Public     │ Invalidate refresh token (cookie + body)     │
 ├────────┼───────────────────────────┼────────────┼──────────────────────────────────────────────┤
 │ POST   │ /auth/refresh             │ Public     │ Rotate refresh token, issue new access token │
 ├────────┼───────────────────────────┼────────────┼──────────────────────────────────────────────┤
 │ POST   │ /auth/forgot-password     │ Public     │ Send HMAC-signed reset link                  │
 ├────────┼───────────────────────────┼────────────┼──────────────────────────────────────────────┤
 │ POST   │ /auth/reset-password      │ Public     │ Consume reset token, update password         │
 ├────────┼───────────────────────────┼────────────┼──────────────────────────────────────────────┤
 │ POST   │ /auth/verify-email        │ Public     │ Mark account email_verified = true           │
 ├────────┼───────────────────────────┼────────────┼──────────────────────────────────────────────┤
 │ POST   │ /auth/verify-email/resend │ Public     │ Rate-limited resend of verification email    │
 ├────────┼───────────────────────────┼────────────┼──────────────────────────────────────────────┤
 │ GET    │ /auth/me                  │ Bearer JWT │ Return current user profile                  │
 ├────────┼───────────────────────────┼────────────┼──────────────────────────────────────────────┤
 │ PUT    │ /auth/me                  │ Bearer JWT │ Update maritime profile fields               │
 └────────┴───────────────────────────┴────────────┴──────────────────────────────────────────────┘

 ---
 Token Design

 Access Token (JWT, RS256)

 - Lifetime: 15 minutes
 - Payload: { sub: userId, jti: uuid, iat, exp, roles: [] }
 - Signed with RSA private key; verified with public key (no DB hit)
 - Clients send as: Authorization: Bearer <token>

 Refresh Token (opaque)

 - 32 cryptographically random bytes → base64url string
 - Stored as SHA256 hash in refresh_tokens table
 - Lifetime: 30 days
 - Rotation on every use; reuse = full family revocation
 - Web clients: HttpOnly Secure SameSite=Strict cookie (path /auth/refresh)
 - Mobile clients: also returned in response body

 HMAC Tokens (email verify, password reset)

 - Self-validating: base64url(payload).HMAC-SHA256-signature
 - Payload contains: { userId, iat, exp, version? }
 - No DB storage needed for email verification
 - Reset tokens embed reset_token_version for one-time-use enforcement

 ---
 Security Measures

 ┌──────────────────────────────────────┬───────────────────────────────────────────────────────────┐
 │                Threat                │                        Mitigation                         │
 ├──────────────────────────────────────┼───────────────────────────────────────────────────────────┤
 │ Timing-based user enumeration        │ Always run Argon2id verify (dummy hash if user not found) │
 ├──────────────────────────────────────┼───────────────────────────────────────────────────────────┤
 │ Brute force login                    │ Redis sliding-window: 5 attempts / 15 min per IP+email    │
 ├──────────────────────────────────────┼───────────────────────────────────────────────────────────┤
 │ Refresh token theft                  │ Reuse detection → full family revocation                  │
 ├──────────────────────────────────────┼───────────────────────────────────────────────────────────┤
 │ Race condition on refresh            │ DB transaction: mark used + create new atomically         │
 ├──────────────────────────────────────┼───────────────────────────────────────────────────────────┤
 │ Email enumeration on forgot-password │ Always 200; work done in setImmediate after response      │
 ├──────────────────────────────────────┼───────────────────────────────────────────────────────────┤
 │ Password reset replay                │ reset_token_version embedded in token, incremented on use │
 ├──────────────────────────────────────┼───────────────────────────────────────────────────────────┤
 │ CSRF (web)                           │ SameSite=Strict cookie                                    │
 ├──────────────────────────────────────┼───────────────────────────────────────────────────────────┤
 │ Secret exposure                      │ No NEXT_PUBLIC_* vars; all keys server-only               │
 ├──────────────────────────────────────┼───────────────────────────────────────────────────────────┤
 │ Insecure headers                     │ Helmet middleware (HSTS, CSP, X-Frame-Options, etc.)      │
 ├──────────────────────────────────────┼───────────────────────────────────────────────────────────┤
 │ Missing HTTPS                        │ Enforced via trust proxy + redirect middleware            │
 └──────────────────────────────────────┴───────────────────────────────────────────────────────────┘

 ---
 Implementation Steps

 Step 1 — Scaffold project

 - mkdir ../marina-api && cd ../marina-api && npm init -y
 - Install all dependencies
 - Write tsconfig.json, .env.example, package.json scripts

 Step 2 — Core libs

 - src/config.ts — typed env loader
 - src/lib/db.ts — pg.Pool (with proper SSL CA from env)
 - src/lib/redis.ts — ioredis client
 - src/lib/password.ts — Argon2id hash/verify
 - src/lib/jwt.ts — RS256 sign/verify via jose
 - src/lib/tokens.ts — HMAC signed token generate/verify
 - src/lib/rateLimit.ts — Redis sliding window rate limiter
 - src/lib/email.ts — Nodemailer with SMTP config

 Step 3 — Types

 - src/types/index.ts — User, RefreshToken, AuditLog, JWTPayload, DeviceInfo

 Step 4 — Middleware

 - src/middleware/requireAuth.ts — Extract Bearer token, verify JWT, set req.user

 Step 5 — Auth routes (src/routes/auth.ts)

 Implement all 10 endpoints per the design with:
 - Zod input validation on every body
 - Rate limiting on sensitive endpoints
 - Audit log writes on key events
 - Device info extraction from User-Agent header

 Step 6 — App bootstrap (src/index.ts)

 - Express app with helmet(), cors(), json() middleware
 - Mount routes under /auth
 - Health check: GET /health
 - Error handler

 Step 7 — Migration

 - migrations/001_auth_tables.sql — all SQL
 - migrations/run.ts — runner that reads and executes SQL files in order

 Step 8 — Key generation script

 - scripts/generate-keys.ts — generates RSA-4096 key pair, outputs to stdout for pasting into .env

 Step 9 — README

 - Setup instructions, env var documentation, how to generate keys, how to run migration

 ---
 Dependencies

 {
   "dependencies": {
     "express": "^4.19.2",
     "argon2": "^0.31.2",
     "jose": "^5.6.3",
     "pg": "^8.12.0",
     "ioredis": "^5.4.1",
     "nodemailer": "^6.9.14",
     "zod": "^3.23.8",
     "cors": "^2.8.5",
     "helmet": "^7.1.0",
     "cookie-parser": "^1.4.6",
     "morgan": "^1.10.0"
   },
   "devDependencies": {
     "typescript": "^5.5.3",
     "tsx": "^4.15.7",
     "@types/express": "^4.17.21",
     "@types/node": "^22.0.0",
     "@types/pg": "^8.11.6",
     "@types/nodemailer": "^6.4.15",
     "@types/cors": "^2.8.17",
     "@types/cookie-parser": "^1.4.7",
     "@types/morgan": "^1.9.9"
   }
 }

 ---
 Environment Variables (.env.example)

 # Server
 PORT=4000
 NODE_ENV=development
 ALLOWED_ORIGINS=http://localhost:3000,https://marinahealth.eu

 # Database (same OVH instance)
 DATABASE_HOST=ua61837-001.eu.clouddb.ovh.net
 DATABASE_PORT=35887
 DATABASE_USER=
 DATABASE_PASSWORD=
 DATABASE_NAME=anonymized-data

 # Redis
 REDIS_URL=redis://localhost:6379

 # JWT RS256 Keys (generate with: npm run generate-keys)
 JWT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...
 JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...

 # HMAC secrets (generate with: openssl rand -hex 32)
 EMAIL_SECRET=
 RESET_SECRET=

 # SMTP (existing Outlook config)
 SMTP_HOST=smtp.office365.com
 SMTP_PORT=587
 SMTP_USER=adrian.radomski@marinahealth.org
 SMTP_PASS=
 EMAIL_FROM=adrian.radomski@marinahealth.org

 # App URL (for email links)
 APP_URL=https://marinahealth.eu
 API_URL=https://api.marinahealth.eu

 ---
 Verification

 After implementation, verify by:
 1. npm run generate-keys → pastes RSA keys into .env
 2. npm run migrate → runs SQL against OVH PostgreSQL
 3. npm run dev → starts on port 4000
 4. Test with curl:
   - POST /auth/register → should get 201 + check email
   - POST /auth/login → should get access_token + refresh_token
   - GET /auth/me with Authorization: Bearer <token> → should get user profile
   - POST /auth/refresh with refresh token → should get new token pair
   - POST /auth/forgot-password → should receive reset email
