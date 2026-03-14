# marina-api

Standalone secure auth REST API for Marina Health. Platform-agnostic — consumable by web, iOS, Android, or desktop clients.

## Stack

- Express + TypeScript
- Argon2id password hashing
- RS256 JWT access tokens (via `jose`)
- Opaque refresh tokens with rotation + reuse detection
- Redis sliding-window rate limiting
- PostgreSQL (shared OVH instance)
- Zod request validation
- Nodemailer (SMTP via Outlook)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

### 3. Generate RSA key pair

```bash
npm run generate-keys
```

Copy the output into `.env` as `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY`.

### 4. Generate HMAC secrets

```bash
openssl rand -hex 32   # → EMAIL_SECRET
openssl rand -hex 32   # → RESET_SECRET
```

### 5. Run database migration

```bash
npm run migrate
```

This adds new columns to the existing `users` table and creates `refresh_tokens` and `audit_logs` tables. Safe to run multiple times.

### 6. Start the server

```bash
# Development (hot reload)
npm run dev

# Production
npm run build && npm start
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 4000) |
| `NODE_ENV` | No | `development` or `production` |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins |
| `DATABASE_HOST` | Yes | PostgreSQL host |
| `DATABASE_PORT` | Yes | PostgreSQL port |
| `DATABASE_USER` | Yes | PostgreSQL user |
| `DATABASE_PASSWORD` | Yes | PostgreSQL password |
| `DATABASE_NAME` | Yes | PostgreSQL database |
| `REDIS_URL` | No | Redis connection URL (default: `redis://localhost:6379`) |
| `JWT_PRIVATE_KEY` | Yes | RSA-4096 PKCS8 private key (PEM with `\n`) |
| `JWT_PUBLIC_KEY` | Yes | RSA-4096 SPKI public key (PEM with `\n`) |
| `EMAIL_SECRET` | Yes | 32-byte hex secret for email verification HMAC tokens |
| `RESET_SECRET` | Yes | 32-byte hex secret for password reset HMAC tokens |
| `SMTP_HOST` | No | SMTP host (default: `smtp.office365.com`) |
| `SMTP_PORT` | No | SMTP port (default: `587`) |
| `SMTP_USER` | Yes | SMTP username / from address |
| `SMTP_PASS` | Yes | SMTP password |
| `EMAIL_FROM` | No | From address override |
| `APP_URL` | No | Frontend URL for email links |
| `API_URL` | No | This API's public URL |

---

## API Reference

All endpoints under `/auth`. Returns JSON.

### Public endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/register` | Create account, sends verification email |
| `POST` | `/auth/login` | Validate credentials, issue token pair |
| `POST` | `/auth/logout` | Invalidate refresh token |
| `POST` | `/auth/refresh` | Rotate refresh token, issue new access token |
| `POST` | `/auth/forgot-password` | Send password reset email |
| `POST` | `/auth/reset-password` | Consume reset token, update password |
| `POST` | `/auth/verify-email` | Mark email verified |
| `POST` | `/auth/verify-email/resend` | Resend verification email |

### Protected endpoints (requires `Authorization: Bearer <token>`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/auth/me` | Get current user profile |
| `PUT` | `/auth/me` | Update maritime profile fields |

### Health check

```
GET /health
```

---

## Token Flow

### Access Token
- RS256 JWT, 15-minute lifetime
- Send as: `Authorization: Bearer <token>`
- Verified without a database query (asymmetric key)

### Refresh Token
- 32 random bytes, base64url encoded
- Stored as SHA256 hash in PostgreSQL
- 30-day lifetime, rotated on every use
- Web: set as `HttpOnly; Secure; SameSite=Strict` cookie on `/auth/refresh`
- Mobile: also returned in response body

### Token Reuse Detection
If a refresh token is presented a second time, the entire token family is revoked — forcing all sessions for that user to re-authenticate.

---

## Quick test with curl

```bash
BASE=http://localhost:4000

# Register
curl -X POST $BASE/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"secret1234","name":"Test User"}'

# Login
curl -X POST $BASE/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"secret1234"}'
# → save access_token and refresh_token from response

# Get profile
curl $BASE/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# Refresh
curl -X POST $BASE/auth/refresh \
  -H 'Content-Type: application/json' \
  -d "{\"refresh_token\":\"$REFRESH_TOKEN\"}"

# Forgot password
curl -X POST $BASE/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com"}'
```
