import { randomUUID } from 'crypto';
import { config } from '../config.js';

// ---------------------------------------------------------------------------
// Token cache
// ---------------------------------------------------------------------------

let cachedToken: { token: string; expiresAt: number } | null = null;
let inflightTokenFetch: Promise<string> | null = null;

function authBaseUrl(): string {
  return `https://auth.${config.corti.environment}.corti.app`;
}

function apiBaseUrl(): string {
  return `https://api.${config.corti.environment}.corti.app/v2`;
}

async function fetchToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.corti.clientId,
    client_secret: config.corti.clientSecret,
    grant_type: 'client_credentials',
    scope: 'openid',
  });

  const url = `${authBaseUrl()}/realms/${config.corti.tenant}/protocol/openid-connect/token`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Corti auth ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error('Corti auth returned no access_token');

  const ttlMs = (json.expires_in ?? 300) * 1000;
  // Refresh 30 seconds before actual expiry to avoid using a token mid-request that just died.
  cachedToken = { token: json.access_token, expiresAt: Date.now() + ttlMs - 30_000 };
  return json.access_token;
}

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  if (inflightTokenFetch) return inflightTokenFetch;
  inflightTokenFetch = fetchToken().finally(() => { inflightTokenFetch = null; });
  return inflightTokenFetch;
}

function authHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Tenant-Name': config.corti.tenant,
  };
}

// ---------------------------------------------------------------------------
// API steps
// ---------------------------------------------------------------------------

async function createInteraction(token: string): Promise<string> {
  const now = new Date().toISOString();
  const body = {
    encounter: {
      identifier: randomUUID(),
      status: 'planned',
      type: 'first_consultation',
      period: { startedAt: now },
    },
  };

  const res = await fetch(`${apiBaseUrl()}/interactions/`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Corti create interaction ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { interactionId?: string; id?: string };
  const id = json.interactionId ?? json.id;
  if (!id) throw new Error('Corti create interaction returned no id');
  return id;
}

async function uploadRecording(
  token: string,
  interactionId: string,
  buffer: Buffer,
  _filename: string,
  mimetype: string,
): Promise<string> {
  const res = await fetch(`${apiBaseUrl()}/interactions/${interactionId}/recordings/`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      'Content-Type': mimetype || 'application/octet-stream',
    },
    body: buffer,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Corti upload recording ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { recordingId?: string; id?: string };
  console.log('[corti] upload response:', JSON.stringify(json));
  const id = json.recordingId ?? json.id;
  if (!id) throw new Error('Corti upload recording returned no id');
  return id;
}

async function createTranscript(
  token: string,
  interactionId: string,
  recordingId: string,
  language: string,
): Promise<{ transcriptId: string; immediate: any | null }> {
  const res = await fetch(`${apiBaseUrl()}/interactions/${interactionId}/transcripts/`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordingId, primaryLanguage: language }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Corti create transcript ${res.status}: ${text}`);
  }

  const json = (await res.json()) as Record<string, any>;
  const id = json.transcriptId ?? json.id;
  if (!id) throw new Error('Corti create transcript returned no id');

  // Corti may return the completed transcript inline if it finishes within ~25s.
  return { transcriptId: id, immediate: json };
}

async function getTranscript(
  token: string,
  interactionId: string,
  transcriptId: string,
): Promise<Record<string, any>> {
  const res = await fetch(`${apiBaseUrl()}/interactions/${interactionId}/transcripts/${transcriptId}`, {
    method: 'GET',
    headers: authHeaders(token),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Corti get transcript ${res.status}: ${text}`);
  }

  return (await res.json()) as Record<string, any>;
}

// ---------------------------------------------------------------------------
// Response shape helpers — Corti's exact field path isn't fully documented,
// so we accept several plausible shapes and surface a clear error if none match.
// ---------------------------------------------------------------------------

function getStatus(payload: Record<string, any> | null | undefined): string | null {
  if (!payload) return null;
  if (typeof payload.status === 'string') return payload.status;
  if (typeof payload.transcript?.status === 'string') return payload.transcript.status;
  return null;
}

function extractText(payload: Record<string, any>): string | null {
  if (typeof payload.text === 'string' && payload.text.trim()) return payload.text;
  if (typeof payload.transcript === 'string' && payload.transcript.trim()) return payload.transcript;
  if (typeof payload.transcript?.text === 'string' && payload.transcript.text.trim()) {
    return payload.transcript.text;
  }

  const candidateArrays = [
    payload.transcripts,
    payload.entries,
    payload.transcript?.entries,
    payload.segments,
    payload.transcript?.segments,
    Array.isArray(payload.transcript) ? payload.transcript : null,
  ].filter((arr): arr is any[] => Array.isArray(arr));

  for (const arr of candidateArrays) {
    const joined = arr
      .map((e) => e?.text ?? e?.transcript ?? e?.content ?? '')
      .filter((s) => typeof s === 'string' && s.length > 0)
      .join(' ')
      .trim();
    if (joined) return joined;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isCortiConfigured(): boolean {
  return Boolean(config.corti.clientId && config.corti.clientSecret);
}

export async function cortiTranscribe(
  buffer: Buffer,
  filename: string,
  mimetype: string,
  language: string,
): Promise<string> {
  const token = await getToken();
  const interactionId = await createInteraction(token);
  const recordingId = await uploadRecording(token, interactionId, buffer, filename, mimetype);
  const { transcriptId, immediate } = await createTranscript(token, interactionId, recordingId, language);

  // Fast path: transcript completed inline.
  const inlineText = extractText(immediate);
  if (inlineText && getStatus(immediate) !== 'pending' && getStatus(immediate) !== 'processing') {
    return inlineText;
  }

  // Poll. Corti's sync window is documented at 25s; allow 60s end-to-end here.
  const deadline = Date.now() + 60_000;
  let lastPayload: Record<string, any> | null = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const payload = await getTranscript(token, interactionId, transcriptId);
    lastPayload = payload;
    const status = getStatus(payload);
    if (status === 'completed' || status === 'done' || status === 'success') {
      const text = extractText(payload);
      if (text) return text;
      throw new Error(`Corti transcript completed but no text field recognized: ${JSON.stringify(payload).slice(0, 500)}`);
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`Corti transcript failed: ${JSON.stringify(payload).slice(0, 500)}`);
    }
  }

  throw new Error(`Corti transcript polling timed out after 60s. Last status: ${getStatus(lastPayload) ?? 'unknown'}`);
}
