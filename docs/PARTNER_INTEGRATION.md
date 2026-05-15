# Partner API Integration

This document is for **B2B integration partners** (e.g. MMG) whose backend
service needs to call Marina API endpoints on behalf of their own users.
For end-user (clinician) authentication see the JWT flow in `README.md`.

---

## Authentication

A Marina-issued **API key** authenticates the partner. The key is a single
high-entropy secret of the form `mk_live_<64 hex chars>`. It must be stored
on the partner's **backend** only — never embedded in mobile apps, web
bundles, or any client the end-user can inspect.

Send the key on every request:

```
Authorization: Bearer mk_live_<your-key>
```

Optionally include the partner's internal end-user identifier so per-user
audit and rate-limiting work cleanly:

```
X-Partner-User-Ref: <opaque-id, ≤ 200 chars>
```

The value is opaque to Marina — use whatever stable ID identifies one of
your clinicians on your side.

---

## Security guarantees and partner responsibilities

| | Marina's responsibility | Partner's responsibility |
|---|---|---|
| **Storage** | Only the SHA-256 hash of the key is persisted server-side. The plaintext is shown once at provisioning time. | Keep the plaintext key in a secrets manager / encrypted env var. Never log it. Never commit it to version control. |
| **Transport** | All requests must use TLS. Plaintext HTTP is rejected. | — |
| **IP allowlist** | Each key is locked to a CIDR list of allowed source IPs. Requests from other IPs are rejected with `401`. | Provide the egress IP(s) of your backend at provisioning time. Notify us before they change. |
| **Scopes** | Each key only authorizes a specific set of endpoints (see below). | — |
| **Rotation** | We can issue a new key alongside an existing one, with an automatic overlap window. | Cut over to the new key within the overlap window. |
| **Revocation** | Revocation is instant — the next request after revocation fails with `401`. | If the key is suspected to be leaked, contact Marina immediately. |
| **Rate limits** | Per-`(api_client, end-user)` if you send `X-Partner-User-Ref`, otherwise per-`api_client`. Limits documented per endpoint below. | — |
| **Audit** | Every partner-attributable call is logged with `partner_id`, `api_client_id`, source IP hash, and (if provided) `X-Partner-User-Ref`. | — |

---

## Available endpoints

The partner API key only authorizes the endpoints listed here. Calls to any
other Marina endpoint will return `403 Missing required scope: …`.

### POST `/ai/transcribe`

Required scope: `transcribe:write`. Rate limit: **500 / hour** per
`(api_client, end-user-ref)`.

`multipart/form-data` request:

| Field | Type | Required | Notes |
|---|---|---|---|
| `audio` | file | yes | One of `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`, `audio/wav`, `audio/m4a`. Max 25 MB. |
| `language` | string | no | ISO 639-1 code (e.g. `en`, `de`). Auto-detect if omitted. |

Response `200`:
```json
{ "transcription": "..." }
```

Errors: `400` (no audio / bad MIME / file too large), `401` (auth),
`403` (scope), `429` (rate), `502` (upstream STT failure), `503`
(transcription provider not configured).

### POST `/ai/extract`

Required scope: `extract:write`. Rate limit: **50 / hour** per
`(api_client, end-user-ref)`.

`application/json` request:

| Field | Type | Required | Notes |
|---|---|---|---|
| `conversation` | array | yes | 1–500 messages, each `{ role: 'user' \| 'assistant', content: string (1..10000) }`. |
| `userProfile` | object | no | Optional patient context — see `ExtractSchema` in `src/routes/ai.ts`. |
| `mewsScore` | number\|null | no | MEWS score if available. |
| `patientLanguage` | string | no | ≤ 20 chars. Defaults to `en`. |
| `medicalOfficerLanguage` | string | no | ≤ 20 chars. Defaults to `en`. |
| `conversationId` | string | no | **Not supported for partner keys.** Sending it returns `400`. |

Response `200`:
```json
{
  "summary": { ... structured medical summary ... },
  "conversationId": "<uuid of newly persisted note-taker conversation>"
}
```

The conversation is persisted on Marina's side, attributed to the partner
(and end-user-ref if provided). The returned `conversationId` can be
retained for audit correlation but is not currently used for any read API
on the partner side.

Errors: `400` (validation), `401` (auth), `403` (scope), `429` (rate),
`502` (extraction service failure).

---

## Error response shape

All errors return JSON with an `error` field:

```json
{ "error": "Invalid API key" }
```

Auth failures (`401`) deliberately use a generic message regardless of
whether the key is missing, malformed, expired, revoked, or coming from a
disallowed IP — this prevents enumeration.

---

## Sandbox vs. production

We issue separate `mk_live_` keys per environment. Use the sandbox key
against the staging API URL during integration; switch to the production
key only after testing is complete. Sandbox keys can be revoked freely;
treat the production key with the same care as a database password.

---

## Implementation reference (TypeScript)

```ts
const headers = {
  'Authorization': `Bearer ${process.env.MARINA_API_KEY}`,
  'X-Partner-User-Ref': clinicianId,
};

const form = new FormData();
form.append('audio', audioBlob, 'recording.webm');
form.append('language', 'en');

const transcription = await fetch('https://api.marinahealth.eu/ai/transcribe', {
  method: 'POST',
  headers,
  body: form,
}).then(r => r.json());

const extracted = await fetch('https://api.marinahealth.eu/ai/extract', {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    conversation: [
      { role: 'assistant', content: 'What seems to be the issue?' },
      { role: 'user', content: transcription.transcription },
    ],
    patientLanguage: 'en',
    medicalOfficerLanguage: 'en',
  }),
}).then(r => r.json());
```
