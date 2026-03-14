# Security Design Decisions

These are known security gaps that require deliberate product or infrastructure decisions before they can be resolved. They are not bugs — each one has a clear fix, but the fix carries a trade-off or dependency that the team must consciously choose.

---

## 1. Database SSL — `rejectUnauthorized: false`

**Current state:** The PostgreSQL connection accepts any server certificate, including self-signed ones. A network-level attacker between the API and the OVH database could intercept queries in plaintext.

**Why not fixed yet:** OVH's shared database control panel does not expose a downloadable CA certificate.

**Decision needed:** Obtain the OVH PostgreSQL CA certificate (contact OVH support or check the advanced database settings panel), then replace the current config:
```ts
// src/lib/db.ts
ssl: { ca: fs.readFileSync('/path/to/ovh-ca.pem') }
```
Until the cert is available, the risk is partially mitigated by the fact that the API and DB communicate over OVH's private network rather than the public internet.

---

## 2. IP Address Hashing — Plain SHA256 (No HMAC Key)

**Current state:** Client IP addresses are hashed with `SHA256(ip)` before being stored in audit logs. For IPv4, the entire address space is only ~4 billion addresses — a precomputed rainbow table (~50 GB) can reverse any stored IP hash.

**Why not fixed yet:** Switching to `HMAC-SHA256(secret, ip)` requires adding a new secret to the environment and re-hashing existing rows.

**Decision needed:** Add an `IP_HMAC_SECRET` environment variable and update `sha256hex(ip)` calls in `auditLog()` and `issueTokenPair()` to use `createHmac('sha256', secret).update(ip).digest('hex')`. Existing audit rows will become un-reversible after the change (acceptable — they were already meant to be one-way).

---

## 3. Access Tokens Remain Valid After Password Reset

**Current state:** When a user resets their password, all refresh tokens are revoked (forcing re-login on all devices). However, any access token (JWT) issued before the reset remains valid for up to 15 minutes. An attacker who obtained an access token retains API access for the remainder of that window.

**Why not fixed yet:** Invalidating JWTs before expiry requires a blocklist (Redis `SET jti → 1 EX 900`), which adds a Redis lookup to every authenticated request.

**Decision needed:** Either:
- Accept the 15-minute residual window as tolerable (simplest, appropriate for most threat models), or
- Implement a JWT blocklist: on password reset, write the user's current `jti` to Redis with a 15-minute TTL, and check it in `requireAuth`.

---

## 4. Account Disabling (`is_active` Flag)

**Current state:** There is no way to disable a user account. The `users` table may not have an `is_active` column, and login does not check for one.

**Why not fixed yet:** Requires a migration to add the column and a product decision on what "disabled" means (can the user still log in to see a message? are their tokens revoked immediately?).

**Decision needed:**
1. Add migration: `ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;`
2. Add an admin endpoint to set `is_active = FALSE`
3. Add `AND is_active = TRUE` to the login query
4. Decide whether existing sessions should be revoked when an account is disabled (if yes, also `DELETE FROM refresh_tokens WHERE user_id = $1`)

---

## 5. Email Verification Not Enforced at Login

**Current state:** Users can log in and use the API without verifying their email address. The `email_verified` field is returned in the login response but never checked.

**Why not fixed yet:** This is a product decision — blocking unverified users at login creates friction (e.g. if the verification email lands in spam). Some products prefer a "soft" enforcement (warn but allow) or feature-gating (restrict certain actions) rather than a hard block.

**Decision needed:** Choose one of:
- **Hard block:** Add `AND email_verified = TRUE` to the login query and return a `403` with a clear message if the user is unverified
- **Soft enforce:** Allow login but return `email_verified: false` in the response, and let the frontend restrict access to sensitive features
- **No enforce:** Accept the current state (suitable if email is only used for communications, not identity verification)

---

## 6. No Account Deletion Endpoint (GDPR Right to Erasure)

**Current state:** There is no way for a user to delete their own account. Under GDPR Article 17, users in the EU have the right to request erasure of their personal data.

**Why not fixed yet:** Deletion has cascading implications — what happens to records that reference the user? Some data may need to be retained for legal/financial reasons (e.g. audit logs).

**Decision needed:**
1. Define retention policy: which data must be kept, which must be deleted, which should be anonymised
2. Implement `DELETE /auth/me` (authenticated): revoke all tokens, delete or anonymise PII, set a `deleted_at` timestamp
3. Consider a soft-delete approach: set `is_active = FALSE`, anonymise `email` and `name`, and keep audit log rows with `user_id` set to `NULL`

---

## 7. No Authenticated Password Change Endpoint

**Current state:** The only way to change a password is through the forgot-password / reset flow, which requires access to the registered email address. A logged-in user cannot change their own password directly.

**Why not fixed yet:** Straightforward to implement but needs a deliberate design (current password required? invalidate other sessions?).

**Decision needed:**
1. Add `POST /auth/change-password` (requires `requireAuth`)
2. Request body: `{ current_password, new_password }`
3. Verify `current_password` against stored hash before updating
4. After update: decide whether to revoke all *other* refresh tokens (recommended) or keep the current session active

---

## 8. MFA Field Exists but Is Never Enforced

**Current state:** The `users` table has an `mfa_enabled` column and it is returned by `GET /auth/me`. No MFA code is ever requested at login and there is no endpoint to enrol or manage MFA.

**Why not fixed yet:** Full MFA support (TOTP, backup codes, enrolment flow) is a significant feature, not a one-line fix.

**Decision needed:** Either:
- Remove the `mfa_enabled` column from the schema and the API response until MFA is actually built (avoids false impression of security), or
- Commit to implementing MFA: add a `mfa_secret` column, implement `POST /auth/mfa/enrol`, `POST /auth/mfa/verify`, and check `mfa_enabled` during login to require a TOTP code before issuing tokens
