import nodemailer from 'nodemailer';
import { config } from '../config';

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: false,   // STARTTLS on port 587
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
  tls: {
    ciphers: 'SSLv3',
  },
});

interface SendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(opts: SendOptions): Promise<void> {
  await transporter.sendMail({
    from: `"Marina Health" <${config.smtp.from}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text ?? opts.html.replace(/<[^>]*>/g, ''),
  });
}

export function buildVerificationEmail(verifyUrl: string): { subject: string; html: string } {
  return {
    subject: 'Verify your Marina Health account',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Marina Health</h2>
        <p>Please verify your email address to activate your account.</p>
        <p>
          <a href="${verifyUrl}"
             style="display: inline-block; padding: 12px 24px; background: #0066cc;
                    color: white; text-decoration: none; border-radius: 4px;">
            Verify Email
          </a>
        </p>
        <p>This link expires in 24 hours.</p>
        <p>If you did not create an account, you can safely ignore this email.</p>
      </div>
    `,
  };
}

export function buildPasswordResetEmail(resetUrl: string): { subject: string; html: string } {
  return {
    subject: 'Reset your Marina Health password',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>We received a request to reset your password.</p>
        <p>
          <a href="${resetUrl}"
             style="display: inline-block; padding: 12px 24px; background: #cc3300;
                    color: white; text-decoration: none; border-radius: 4px;">
            Reset Password
          </a>
        </p>
        <p>This link expires in 1 hour.</p>
        <p>If you did not request a password reset, you can safely ignore this email.</p>
      </div>
    `,
  };
}
