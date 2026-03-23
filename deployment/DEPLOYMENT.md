# Deployment Guide - api.marinahealth.eu

Deploy marina-api to any Ubuntu 22.04 server (e.g. OVH, Digital Ocean).

## Prerequisites

- Ubuntu 22.04 server with SSH access
- Domain `api.marinahealth.eu` with DNS A record pointed to server IP
- All required environment variables (see `.env.example`)

---

## Quick Start

### 1. Connect to your server

```bash
ssh root@YOUR_SERVER_IP
```

### 2. Clone the repository

```bash
cd /root
git clone https://YOUR_REPO_URL.git marina-api
cd marina-api
```

### 3. Configure environment variables

```bash
cp .env.example .env
nano .env
```

Fill in all required values. Key ones:

| Variable | Description |
|---|---|
| `DATABASE_*` | OVH PostgreSQL connection details |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | RSA-4096 key pair (run `npm run generate-keys` locally to generate) |
| `EMAIL_SECRET` / `RESET_SECRET` | 32-byte hex secrets (`openssl rand -hex 32`) |
| `SMTP_PASS` | Office365 SMTP password |
| `NEBIUS_API_KEY` | Nebius AI API key |
| `WHISPER_API_KEY` / `WHISPER_BASE_URL` | OVHcloud Whisper endpoint |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins |
| `NODE_ENV` | Set to `production` |

> `REDIS_URL` is automatically overridden to `redis://redis:6379` by docker-compose — leave it as-is in `.env`.

### 4. Run the deployment script

```bash
cd /root/marina-api/deployment
sudo bash deploy.sh
```

This will:
- Install Docker & Docker Compose
- Configure firewall (ports 22, 80, 443)
- Build the API (TypeScript → JS, installs pdftk)
- Start nginx reverse proxy + Redis sidecar
- Set up automatic restarts

### 5. Set up HTTPS (after DNS is configured)

Point `api.marinahealth.eu` to your server IP, then:

```bash
sudo bash deploy_https.sh
```

This will:
- Obtain a free Let's Encrypt SSL certificate
- Update nginx to serve HTTPS and redirect HTTP → HTTPS
- Set up automatic certificate renewal (twice daily via cron)

---

## DNS Configuration

```
Type: A
Name: api
Value: YOUR_SERVER_IP
TTL: 300
```

---

## Useful Commands

```bash
# View all logs
docker-compose logs -f

# View API logs only
docker-compose logs -f app

# View nginx logs only
docker-compose logs -f nginx

# View Redis logs
docker-compose logs -f redis

# Restart everything
docker-compose restart

# Stop everything
docker-compose down

# Rebuild after code changes
sudo bash rebuild.sh

# Check container status
docker-compose ps

# Test health endpoint
curl https://api.marinahealth.eu/health
```

## Updating the API

```bash
cd /root/marina-api
git pull
cd deployment
sudo bash rebuild.sh
```

---

## Architecture

```
Internet → nginx (80/443) → marina-api Express (4000)
                                    ↓
                             Redis (rate limits)
                                    ↓
                         PostgreSQL OVH (external)
```

- `nginx` — SSL termination, HTTP→HTTPS redirect, 30M body limit for audio uploads
- `app` — Express API, compiled TypeScript, runs as non-root user
- `redis` — sliding-window rate limiting (alpine, ephemeral — rate limit state resets on restart)

---

## Troubleshooting

**API not starting:**
```bash
docker-compose logs app
```
Most likely cause: missing or malformed env var. The API throws on startup if any required variable is absent.

**Redis connection error:**
```bash
docker-compose logs redis
docker-compose ps redis
```

**Nginx not starting:**
```bash
docker-compose logs nginx
docker-compose exec nginx nginx -t
```

**Can't access via domain:**
```bash
nslookup api.marinahealth.eu   # check DNS
ufw status                      # check firewall
docker-compose ps               # check containers
```

**PDF generation failing:**
The `pdftk` binary is installed inside the Docker image. If the PDF template is missing:
```bash
docker-compose exec app ls public/templates/
```

**Out of disk space:**
```bash
docker system prune -a --volumes
df -h
```

**SSL certificate issues:**
```bash
certbot certificates
certbot renew --dry-run
```

---

## Server Recommendations

| Plan | RAM | Use case |
|------|-----|----------|
| Basic | 2GB | Testing |
| Recommended | 4GB | Production (AI endpoints are memory-intensive) |

SSL is free via Let's Encrypt (auto-renews every 90 days).
