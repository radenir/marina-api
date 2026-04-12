import nodemailer from 'nodemailer';
import type { Attachment } from 'nodemailer/lib/mailer';
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
    minVersion: 'TLSv1.2',
  },
});

interface SendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Attachment[];
}

export async function sendEmail(opts: SendOptions): Promise<void> {
  await transporter.sendMail({
    from: `"Marina Health" <${config.smtp.from}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text ?? opts.html.replace(/<[^>]*>/g, ''),
    ...(opts.attachments ? { attachments: opts.attachments } : {}),
  });
}

// ---------------------------------------------------------------------------
// Shared layout
// ---------------------------------------------------------------------------

const LOGO_URL = 'https://eu.marinahealth.eu/marina-logo.svg';
const SITE_URL = 'https://eu.marinahealth.eu';

function layout(bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body style="margin:0;padding:0;background-color:#f0f6fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f0f6fc;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="background-color:#0a4b78;border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
              <img src="${LOGO_URL}" width="40" height="40" alt="" style="display:inline-block;vertical-align:middle;margin-right:10px;">
              <span style="color:#ffffff;font-size:19px;font-weight:700;vertical-align:middle;letter-spacing:-0.3px;">Marina Health</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:40px 40px 32px;">
              ${bodyContent}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="background-color:#ffffff;padding:0 40px;">
              <div style="height:1px;background-color:#e8edf2;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#ffffff;border-radius:0 0 12px 12px;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#aab0ba;">
                Marina Health &middot;
                <a href="${SITE_URL}" style="color:#aab0ba;text-decoration:none;">${SITE_URL.replace('https://', '')}</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function primaryButton(label: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 28px;">
    <tr>
      <td style="background-color:#0a4b78;border-radius:50px;padding:14px 32px;">
        <a href="${url}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;display:inline-block;white-space:nowrap;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0a4b78;letter-spacing:-0.3px;">${text}</h1>`;
}

function body(text: string): string {
  return `<p style="margin:0 0 28px;font-size:15px;line-height:1.65;color:#444444;">${text}</p>`;
}

function note(text: string): string {
  return `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#9aa3ae;">${text}</p>`;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function buildVerificationEmail(verifyUrl: string): { subject: string; html: string } {
  return {
    subject: 'Verify your Marina Health account',
    html: layout(`
      ${heading('Verify your email address')}
      ${body('Welcome to Marina Health. Please verify your email address to activate your account and get started.')}
      ${primaryButton('Verify Email', verifyUrl)}
      ${note('This link expires in 24 hours.')}
      ${note('If you did not create an account, you can safely ignore this email.')}
    `),
  };
}

export function buildPasswordResetEmail(resetUrl: string): { subject: string; html: string } {
  return {
    subject: 'Reset your Marina Health password',
    html: layout(`
      ${heading('Reset your password')}
      ${body('We received a request to reset the password for your Marina Health account. Click the button below to choose a new password.')}
      ${primaryButton('Reset Password', resetUrl)}
      ${note('This link expires in 1 hour.')}
      ${note('If you did not request a password reset, you can safely ignore this email — your account remains secure.')}
    `),
  };
}

export function buildPdfReportEmail(dateStr: string): { subject: string; html: string } {
  return {
    subject: 'Your RMD Maritime Medical Report',
    html: layout(`
      ${heading('Your medical report is attached')}
      ${body('Please find your RMD Maritime Medical Report attached to this email. The report was generated by Marina Health on ' + dateStr + '.')}
      <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 28px;background-color:#f0f6fc;border-radius:8px;padding:16px 20px;width:100%;">
        <tr>
          <td>
            <p style="margin:0;font-size:14px;color:#0a4b78;font-weight:600;">rmd-maritime-medical-report.pdf</p>
            <p style="margin:4px 0 0;font-size:13px;color:#7a8694;">RMD Maritime Medical Form</p>
          </td>
        </tr>
      </table>
      ${note('This report is intended for medical and maritime personnel only. Please store it securely.')}
      ${note('If you did not request this report, please contact your administrator.')}
    `),
  };
}
