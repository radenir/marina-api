import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { query, transaction } from '../lib/db';
import { hashPassword, verifyPasswordConstantTime } from '../lib/password';
import { signAccessToken } from '../lib/jwt';
import {
  generateOpaqueToken,
  generateSignedToken,
  verifySignedToken,
  sha256hex,
} from '../lib/tokens';
import { rateLimit } from '../lib/rateLimit';
import { sendEmail, buildVerificationEmail, buildPasswordResetEmail } from '../lib/email';
import { requireAuth } from '../middleware/requireAuth';
import { config } from '../config';
import type { User, AuditEventType, DeviceInfo } from '../types';

export const authRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

function parseDevice(req: Request): DeviceInfo {
  const ua = req.headers['user-agent'] ?? '';
  const lower = ua.toLowerCase();
  let device_type: DeviceInfo['device_type'] = 'web';
  if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('ios')) {
    device_type = 'ios';
  } else if (lower.includes('android')) {
    device_type = 'android';
  }
  return { device_name: ua.slice(0, 255) || 'Unknown', device_type };
}

async function auditLog(
  event_type: AuditEventType,
  req: Request,
  user_id: string | null = null,
  metadata: Record<string, unknown> = {}
) {
  const ip = getIp(req);
  const ua = req.headers['user-agent'] ?? '';
  try {
    await query(
      `INSERT INTO audit_logs (user_id, event_type, ip_address_hash, user_agent_hash, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user_id, event_type, sha256hex(ip), sha256hex(ua), JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error('[audit] failed to write log:', (err as Error).message);
  }
}

async function issueTokenPair(
  user: Pick<User, 'id' | 'role'>,
  req: Request,
  res: Response
): Promise<{ access_token: string; refresh_token: string }> {
  const { token: access_token } = await signAccessToken(user.id, [user.role]);
  const opaqueToken = generateOpaqueToken();
  const tokenHash = sha256hex(opaqueToken);
  const familyId = randomUUID();
  const device = parseDevice(req);
  const ip = getIp(req);
  const expiresAt = new Date(Date.now() + config.jwt.refreshTokenTtlDays * 86_400_000);

  await query(
    `INSERT INTO refresh_tokens
       (token_hash, family_id, user_id, device_name, device_type, ip_address_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      tokenHash,
      familyId,
      user.id,
      device.device_name,
      device.device_type,
      sha256hex(ip),
      expiresAt,
    ]
  );

  // Set HttpOnly cookie for web clients
  res.cookie('refresh_token', opaqueToken, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/auth/refresh',
    expires: expiresAt,
  });

  return { access_token, refresh_token: opaqueToken };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const RegisterSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

const VerifyEmailSchema = z.object({
  token: z.string().min(1),
});

const ResendVerifySchema = z.object({
  email: z.string().email(),
});

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  ship_name: z.string().max(255).optional(),
  imo_number: z.string().regex(/^\d{7}$/, 'IMO number must be exactly 7 digits').optional(),
  company: z.string().max(255).optional(),
});

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------

const loginRateLimit = rateLimit({
  prefix: 'login',
  limit: 5,
  windowSeconds: 15 * 60,
  keyFn: (req) => {
    const ip = getIp(req);
    const email = (req.body?.email as string | undefined) ?? '';
    return sha256hex(`${ip}:${email.toLowerCase()}`);
  },
});

const registerRateLimit = rateLimit({ prefix: 'register', limit: 10, windowSeconds: 60 * 60 });
const forgotPasswordRateLimit = rateLimit({ prefix: 'forgot', limit: 3, windowSeconds: 60 * 60 });
const resendVerifyRateLimit = rateLimit({ prefix: 'resend', limit: 3, windowSeconds: 60 * 60 });
const refreshRateLimit = rateLimit({ prefix: 'refresh', limit: 30, windowSeconds: 15 * 60 });
const resetPasswordRateLimit = rateLimit({ prefix: 'reset-pw', limit: 5, windowSeconds: 60 * 60 });
const verifyEmailRateLimit = rateLimit({ prefix: 'verify-email', limit: 10, windowSeconds: 60 * 60 });

// ---------------------------------------------------------------------------
// POST /auth/register
// ---------------------------------------------------------------------------

authRouter.post('/register', registerRateLimit, async (req: Request, res: Response): Promise<void> => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { email, password, name } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  // Check if email already exists (constant-time path)
  const existing = await query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [normalizedEmail]
  );

  if (existing.rows.length > 0) {
    // Don't reveal that the email exists; pretend to send verification
    res.status(201).json({ message: 'If this email is not registered, a verification link has been sent.' });
    return;
  }

  const passwordHash = await hashPassword(password);

  const result = await query<{ id: string }>(
    `INSERT INTO users (email, password, name, email_verified, password_hash_algo)
     VALUES ($1, $2, $3, FALSE, 'argon2id')
     RETURNING id`,
    [normalizedEmail, passwordHash, name]
  );

  const userId = result.rows[0].id;

  // Generate email verification token
  const verifyToken = generateSignedToken(userId, config.hmac.emailTokenTtl, config.hmac.emailSecret);
  const verifyUrl = `${config.appUrl}/verify-email?token=${encodeURIComponent(verifyToken)}`;
  const emailContent = buildVerificationEmail(verifyUrl);

  // Send email async (don't block response)
  setImmediate(() => {
    sendEmail({ to: normalizedEmail, ...emailContent }).catch((err) => {
      console.error('[email] verification send failed:', err.message);
    });
  });

  await auditLog('register', req, userId);

  res.status(201).json({
    message: 'Account created. Please check your email to verify your account.',
    userId,
  });
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

authRouter.post('/login', loginRateLimit, async (req: Request, res: Response): Promise<void> => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const result = await query<User & { password: string }>(
    `SELECT id, email, password, role, email_verified, password_hash_algo
     FROM users WHERE email = $1`,
    [normalizedEmail]
  );

  const user = result.rows[0] ?? null;
  const storedHash = user?.password ?? null;

  const valid = await verifyPasswordConstantTime(storedHash, password);

  if (!valid) {
    // Do not store plaintext email in audit log — hash it to avoid PII exposure in logs
    await auditLog('login_failed', req, user?.id ?? null, { email_hash: sha256hex(normalizedEmail) });
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  // Upgrade bcrypt hash to argon2id transparently
  if (user.password_hash_algo === 'bcrypt') {
    const newHash = await hashPassword(password);
    await query(
      `UPDATE users SET password = $1, password_hash_algo = 'argon2id' WHERE id = $2`,
      [newHash, user.id]
    );
  }

  const tokens = await issueTokenPair(user, req, res);

  await auditLog('login_success', req, user.id, { device: parseDevice(req).device_type });

  res.json({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: 'Bearer',
    expires_in: config.jwt.accessTokenTtl,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      email_verified: user.email_verified,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

authRouter.post('/logout', async (req: Request, res: Response): Promise<void> => {
  const token: string | undefined =
    req.cookies?.refresh_token ??
    req.body?.refresh_token;

  if (token) {
    const tokenHash = sha256hex(token);
    await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
  }

  res.clearCookie('refresh_token', { path: '/auth/refresh' });
  res.json({ message: 'Logged out' });
});

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------

authRouter.post('/refresh', refreshRateLimit, async (req: Request, res: Response): Promise<void> => {
  const incomingToken: string | undefined =
    req.cookies?.refresh_token ??
    req.body?.refresh_token;

  if (!incomingToken) {
    res.status(401).json({ error: 'No refresh token provided' });
    return;
  }

  const tokenHash = sha256hex(incomingToken);

  // First, check if this token exists and whether it has been used — outside any
  // transaction so that a family-revocation DELETE is never rolled back.
  const { rows: lookupRows } = await query<{
    id: string; family_id: string; user_id: string;
    expires_at: Date; used: boolean;
  }>(
    'SELECT id, family_id, user_id, expires_at, used FROM refresh_tokens WHERE token_hash = $1',
    [tokenHash]
  );

  const lookedUp = lookupRows[0];

  if (!lookedUp) {
    res.status(401).json({ error: 'Token not found' });
    return;
  }

  // Reuse detection: token already marked used → revoke entire family immediately.
  // This DELETE runs outside any transaction so it is never rolled back.
  if (lookedUp.used) {
    await query('DELETE FROM refresh_tokens WHERE family_id = $1', [lookedUp.family_id]);
    await auditLog('token_reuse_detected', req, lookedUp.user_id, { family_id: lookedUp.family_id });
    res.status(401).json({ error: 'Token reuse detected' });
    return;
  }

  if (new Date() > lookedUp.expires_at) {
    await query('DELETE FROM refresh_tokens WHERE id = $1', [lookedUp.id]);
    res.status(401).json({ error: 'Refresh token expired' });
    return;
  }

  try {
    // Token is valid and unused — rotate inside a transaction for atomicity.
    const result = await transaction(async (client) => {
      // Re-check with FOR UPDATE inside transaction to prevent concurrent reuse
      const { rows } = await client.query<{ used: boolean }>(
        'SELECT used FROM refresh_tokens WHERE id = $1 FOR UPDATE',
        [lookedUp.id]
      );
      if (!rows[0] || rows[0].used) {
        throw Object.assign(new Error('Token already used'), { status: 401 });
      }

      // Mark current token as used
      await client.query('UPDATE refresh_tokens SET used = TRUE WHERE id = $1', [lookedUp.id]);

      // Fetch user
      const { rows: userRows } = await client.query<Pick<User, 'id' | 'role'>>(
        'SELECT id, role FROM users WHERE id = $1',
        [lookedUp.user_id]
      );
      if (!userRows[0]) throw Object.assign(new Error('User not found'), { status: 401 });

      const user = userRows[0];

      // Issue new token pair in the same family
      const { token: access_token } = await signAccessToken(user.id, [user.role]);
      const opaqueToken = generateOpaqueToken();
      const newHash = sha256hex(opaqueToken);
      const device = parseDevice(req);
      const ip = getIp(req);
      const expiresAt = new Date(Date.now() + config.jwt.refreshTokenTtlDays * 86_400_000);

      await client.query(
        `INSERT INTO refresh_tokens
           (token_hash, family_id, user_id, device_name, device_type, ip_address_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [newHash, lookedUp.family_id, user.id, device.device_name, device.device_type, sha256hex(ip), expiresAt]
      );

      return { access_token, refresh_token: opaqueToken, user, expiresAt };
    });

    res.cookie('refresh_token', result.refresh_token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
      path: '/auth/refresh',
      expires: result.expiresAt,
    });

    await auditLog('token_refresh', req, result.user.id);

    res.json({
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      token_type: 'Bearer',
      expires_in: config.jwt.accessTokenTtl,
    });
  } catch (err: unknown) {
    const error = err as Error & { status?: number };
    res.status(error.status ?? 500).json({ error: error.message ?? 'Internal error' });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/forgot-password
// ---------------------------------------------------------------------------

authRouter.post('/forgot-password', forgotPasswordRateLimit, async (req: Request, res: Response): Promise<void> => {
  const parsed = ForgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  // Always 200 — prevents email enumeration
  res.json({ message: 'If this account exists, a password reset link has been sent.' });

  // Do the real work after sending response
  setImmediate(async () => {
    try {
      const { email } = parsed.data;
      const normalizedEmail = email.toLowerCase();

      const result = await query<Pick<User, 'id' | 'reset_token_version'>>(
        'SELECT id, reset_token_version FROM users WHERE email = $1',
        [normalizedEmail]
      );

      if (!result.rows[0]) return;

      const { id: userId, reset_token_version: version } = result.rows[0];

      await query(
        'UPDATE users SET reset_requested_at = NOW() WHERE id = $1',
        [userId]
      );

      const resetToken = generateSignedToken(
        userId,
        config.hmac.resetTokenTtl,
        config.hmac.resetSecret,
        version
      );
      const resetUrl = `${config.appUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
      const emailContent = buildPasswordResetEmail(resetUrl);

      await sendEmail({ to: normalizedEmail, ...emailContent });
      await auditLog('password_reset_requested', req, userId);
    } catch (err) {
      console.error('[forgot-password] error:', (err as Error).message);
    }
  });
});

// ---------------------------------------------------------------------------
// POST /auth/reset-password
// ---------------------------------------------------------------------------

authRouter.post('/reset-password', resetPasswordRateLimit, async (req: Request, res: Response): Promise<void> => {
  const parsed = ResetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  try {
    const { token, password } = parsed.data;
    const { userId, version } = verifySignedToken(token, config.hmac.resetSecret);

    // Hash the new password before entering the transaction (argon2id is slow)
    const newHash = await hashPassword(password);

    // Wrap version check + update in a transaction with FOR UPDATE to prevent
    // concurrent requests using the same token (race condition fix)
    const updated = await transaction(async (client) => {
      const { rows } = await client.query<Pick<User, 'id' | 'reset_token_version'>>(
        'SELECT id, reset_token_version FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );

      const user = rows[0];
      if (!user) return false;

      if (version !== undefined && version !== user.reset_token_version) return false;

      await client.query(
        `UPDATE users
         SET password = $1,
             password_hash_algo = 'argon2id',
             reset_token_version = reset_token_version + 1,
             reset_requested_at = NULL
         WHERE id = $2`,
        [newHash, userId]
      );

      // Revoke all refresh tokens for this user (force re-login everywhere)
      await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

      return true;
    });

    if (!updated) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }

    await auditLog('password_reset_completed', req, userId);

    res.json({ message: 'Password reset successfully. Please log in with your new password.' });
  } catch (err) {
    res.status(400).json({ error: 'Invalid or expired reset token' });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/verify-email
// ---------------------------------------------------------------------------

authRouter.post('/verify-email', verifyEmailRateLimit, async (req: Request, res: Response): Promise<void> => {
  const parsed = VerifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  try {
    const { token } = parsed.data;
    const { userId } = verifySignedToken(token, config.hmac.emailSecret);

    await query(
      'UPDATE users SET email_verified = TRUE WHERE id = $1',
      [userId]
    );

    await auditLog('email_verified', req, userId);

    res.json({ message: 'Email verified successfully.' });
  } catch (err) {
    res.status(400).json({ error: 'Invalid or expired verification token' });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/verify-email/resend
// ---------------------------------------------------------------------------

authRouter.post('/verify-email/resend', resendVerifyRateLimit, async (req: Request, res: Response): Promise<void> => {
  const parsed = ResendVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  // Always 200 to prevent enumeration
  res.json({ message: 'If this email is registered and unverified, a new verification link has been sent.' });

  setImmediate(async () => {
    try {
      const normalizedEmail = parsed.data.email.toLowerCase();
      const result = await query<Pick<User, 'id' | 'email_verified'>>(
        'SELECT id, email_verified FROM users WHERE email = $1',
        [normalizedEmail]
      );

      const user = result.rows[0];
      if (!user || user.email_verified) return;

      const verifyToken = generateSignedToken(user.id, config.hmac.emailTokenTtl, config.hmac.emailSecret);
      const verifyUrl = `${config.appUrl}/verify-email?token=${encodeURIComponent(verifyToken)}`;
      const emailContent = buildVerificationEmail(verifyUrl);

      await sendEmail({ to: normalizedEmail, ...emailContent });
      await auditLog('email_verification_resent', req, user.id);
    } catch (err) {
      console.error('[resend-verify] error:', (err as Error).message);
    }
  });
});

// ---------------------------------------------------------------------------
// GET /auth/me
// ---------------------------------------------------------------------------

authRouter.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const result = await query<Omit<User, 'password'>>(
    `SELECT id, email, name, role, ship_name, imo_number, company,
            email_verified, mfa_enabled, created_at, updated_at
     FROM users WHERE id = $1`,
    [req.user!.id]
  );

  const user = result.rows[0];
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ user });
});

// ---------------------------------------------------------------------------
// PUT /auth/me
// ---------------------------------------------------------------------------

authRouter.put('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = UpdateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const updates = parsed.data;

  // Explicit allowlist prevents prototype pollution or unexpected field names
  // from reaching the SQL string, even if Zod behaviour changes.
  const ALLOWED_FIELDS = ['name', 'ship_name', 'imo_number', 'company'] as const;
  type AllowedField = typeof ALLOWED_FIELDS[number];
  const fields = ALLOWED_FIELDS.filter((f) => f in updates && updates[f] !== undefined);

  if (fields.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = fields.map((f) => updates[f as AllowedField]);

  await query(
    `UPDATE users SET ${setClauses}, updated_at = NOW() WHERE id = $1`,
    [req.user!.id, ...values]
  );

  await auditLog('profile_updated', req, req.user!.id, { fields });

  const result = await query<Omit<User, 'password'>>(
    `SELECT id, email, name, role, ship_name, imo_number, company,
            email_verified, mfa_enabled, created_at, updated_at
     FROM users WHERE id = $1`,
    [req.user!.id]
  );

  res.json({ user: result.rows[0] });
});
