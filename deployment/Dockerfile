# Multi-stage build for marina-api production deployment
FROM node:20-slim AS base

# Install dependencies only
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Build: install all deps and compile TypeScript
FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

# Install pdftk for PDF form filling (generate-pdf / email-pdf endpoints)
RUN apt-get update -qq \
  && apt-get install -y --no-install-recommends pdftk \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 apiuser

# Compiled JS
COPY --from=builder /app/dist ./dist

# Production node_modules
COPY --from=deps /app/node_modules ./node_modules

# PDF template (required by /ai/generate-pdf and /ai/email-pdf)
COPY --from=builder /app/public ./public

COPY --from=builder /app/package.json ./package.json

RUN chown -R apiuser:nodejs /app

USER apiuser

EXPOSE 4000

ENV PORT=4000

CMD ["node", "dist/index.js"]
