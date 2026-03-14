/**
 * Typed environment variable loader.
 * Throws on startup if any required variable is missing.
 */

function require_env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional_env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: parseInt(optional_env('PORT', '4000'), 10),
  nodeEnv: optional_env('NODE_ENV', 'development'),
  allowedOrigins: optional_env('ALLOWED_ORIGINS', 'http://localhost:3000').split(','),

  db: {
    host: require_env('DATABASE_HOST'),
    port: parseInt(require_env('DATABASE_PORT'), 10),
    user: require_env('DATABASE_USER'),
    password: require_env('DATABASE_PASSWORD'),
    database: require_env('DATABASE_NAME'),
  },

  redis: {
    url: optional_env('REDIS_URL', 'redis://localhost:6379'),
  },

  jwt: {
    // Newlines stored as \n literals in env — unescape them
    privateKey: require_env('JWT_PRIVATE_KEY').replace(/\\n/g, '\n'),
    publicKey: require_env('JWT_PUBLIC_KEY').replace(/\\n/g, '\n'),
    accessTokenTtl: 15 * 60,       // 15 minutes in seconds
    refreshTokenTtlDays: 30,
  },

  hmac: {
    emailSecret: require_env('EMAIL_SECRET'),
    resetSecret: require_env('RESET_SECRET'),
    emailTokenTtl: 24 * 60 * 60,   // 24 hours in seconds
    resetTokenTtl: 60 * 60,         // 1 hour in seconds
  },

  smtp: {
    host: optional_env('SMTP_HOST', 'smtp.office365.com'),
    port: parseInt(optional_env('SMTP_PORT', '587'), 10),
    user: require_env('SMTP_USER'),
    pass: require_env('SMTP_PASS'),
    from: optional_env('EMAIL_FROM', require_env('SMTP_USER')),
  },

  appUrl: optional_env('APP_URL', 'http://localhost:3000'),
  apiUrl: optional_env('API_URL', 'http://localhost:4000'),
} as const;
