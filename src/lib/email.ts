import { config } from '../config';
import { MARINA_LOGO_PNG_BASE64, MARINA_LOGO_CID } from './emailLogo.js';

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType: string;
}

interface SendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}

export async function sendEmail(opts: SendOptions): Promise<void> {
  const credentials = Buffer.from(
    `${config.mailjet.apiKey}:${config.mailjet.secretKey}`
  ).toString('base64');

  const message: Record<string, unknown> = {
    From: { Email: config.mailjet.from, Name: 'Marina Health' },
    To: [{ Email: opts.to }],
    Subject: opts.subject,
    HTMLPart: opts.html,
    TextPart: opts.text ?? opts.html.replace(/<[^>]*>/g, ''),
  };

  if (opts.attachments?.length) {
    message.Attachments = opts.attachments.map((att) => ({
      ContentType: att.contentType,
      Filename: att.filename,
      Base64Content: Buffer.isBuffer(att.content)
        ? att.content.toString('base64')
        : Buffer.from(att.content).toString('base64'),
    }));
  }

  // Logo is rendered via <img src="cid:marina-logo"> in every template's
  // shared layout. Always inline it so the image survives Gmail (which
  // strips data: URIs) and clients that block remote images by default.
  message.InlinedAttachments = [
    {
      ContentType: 'image/png',
      Filename: 'marina-logo.png',
      ContentID: MARINA_LOGO_CID,
      Base64Content: MARINA_LOGO_PNG_BASE64,
    },
  ];

  const response = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${credentials}`,
    },
    body: JSON.stringify({ Messages: [message] }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mailjet API error ${response.status}: ${error}`);
  }

  const result = await response.json() as {
    Messages: Array<{ Status: string; Errors?: unknown[] }>;
  };

  const msg = result.Messages?.[0];
  if (msg?.Status !== 'success') {
    throw new Error(`Mailjet send failed: ${JSON.stringify(msg?.Errors)}`);
  }
}

// ---------------------------------------------------------------------------
// Shared layout
// ---------------------------------------------------------------------------

const LOGO_URL = `cid:${MARINA_LOGO_CID}`;

function layout(headerContent: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f4f6f8;padding:48px 16px;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
          style="max-width:448px;background-color:#ffffff;border-radius:16px;border:1px solid #e5e7eb;">

          <!-- Card header: logo + title -->
          <tr>
            <td style="padding:32px 40px 24px;text-align:center;">
              <img src="${LOGO_URL}" width="56" height="56" alt="Marina Health"
                style="display:block;margin:0 auto 20px;">
              ${headerContent}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <div style="height:1px;background-color:#f0f0f0;"></div>
            </td>
          </tr>

          <!-- Card body -->
          <tr>
            <td style="padding:28px 40px 32px;">
              ${bodyContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:0 40px 24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                Marina Health &middot; Maritime Medical Incident Reporting
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

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function buildVerificationEmail(verifyUrl: string): { subject: string; html: string } {
  const header = `
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0a4b78;">Check your email</h1>
    <p style="margin:0;font-size:14px;color:#6b7280;">We sent a verification link to your email address</p>
  `;

  const body = `
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 20px;">
      <tr>
        <td style="background-color:#e8f0f7;border-radius:50%;width:56px;height:56px;text-align:center;vertical-align:middle;">
          <span style="font-size:24px;line-height:56px;">&#9993;</span>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#374151;text-align:justify;">
      Click the link below to verify your account and access the Marina Health dashboard.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 20px;">
      <tr>
        <td style="background-color:#0a4b78;border-radius:10px;text-align:center;padding:12px 24px;">
          <a href="${verifyUrl}"
            style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;display:block;">
            Verify Email Address
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;text-align:justify;">This link expires in 24 hours.</p>
    <p style="margin:0;font-size:13px;color:#9ca3af;text-align:justify;">If you didn't create an account, you can safely ignore this email.</p>
  `;

  return { subject: 'Verify your Marina Health account', html: layout(header, body) };
}

export function buildPasswordResetEmail(resetUrl: string): { subject: string; html: string } {
  const header = `
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0a4b78;">Reset your password</h1>
    <p style="margin:0;font-size:14px;color:#6b7280;">Enter your new password via the link below</p>
  `;

  const body = `
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#374151;text-align:justify;">
      We received a request to reset the password for your Marina Health account.
      Click the button below to choose a new password.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 20px;">
      <tr>
        <td style="background-color:#0a4b78;border-radius:10px;text-align:center;padding:12px 24px;">
          <a href="${resetUrl}"
            style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;display:block;">
            Reset Password
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;text-align:justify;">This link expires in 1 hour.</p>
    <p style="margin:0;font-size:13px;color:#9ca3af;text-align:justify;">If you didn't request a password reset, your account remains secure — ignore this email.</p>
  `;

  return { subject: 'Reset your Marina Health password', html: layout(header, body) };
}

export function buildPdfReportEmail(dateStr: string): { subject: string; html: string } {
  const header = `
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0a4b78;">Your medical report</h1>
    <p style="margin:0;font-size:14px;color:#6b7280;">RMD Maritime Medical Report attached</p>
  `;

  const body = `
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#374151;text-align:justify;">
      Your RMD Maritime Medical Report is attached to this email,
      generated on <strong>${dateStr}</strong>.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;background-color:#f4f6f8;border-radius:10px;border:1px solid #e5e7eb;">
      <tr>
        <td style="padding:14px 18px;">
          <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#0a4b78;">rmd-maritime-medical-report.pdf</p>
          <p style="margin:0;font-size:12px;color:#6b7280;">RMD Maritime Medical Form</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;text-align:justify;">This report is intended for medical and maritime personnel only. Please store it securely.</p>
    <p style="margin:0;font-size:13px;color:#9ca3af;text-align:justify;">If you did not request this report, please contact your administrator.</p>
  `;

  return { subject: 'Your RMD Maritime Medical Report', html: layout(header, body) };
}
