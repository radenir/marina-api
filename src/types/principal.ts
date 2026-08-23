/**
 * Principal — the authenticated identity behind a request. Either a Marina
 * user (JWT) or a partner organization (API key).
 *
 * Set by the `authenticate` middleware. Handlers and downstream middleware
 * (rate limit, scope check, attribution) read from this rather than the
 * legacy req.user to support both auth types.
 */

export type UserPrincipal = {
  type: 'user';
  userId: string;
  role: string;
};

export type PartnerPrincipal = {
  type: 'partner';
  partnerId: string;
  apiClientId: string;
  scopes: string[];
  /** Opaque caller-supplied ID for the partner's internal end-user. */
  partnerUserRef?: string;
};

/**
 * Anonymous principal — a signed-out client using the free, no-login Note Taker
 * (record → transcribe → extract → voice edits, nothing persisted). Set by the
 * `allowAnonymous` middleware and accepted ONLY on the `/free/ai/*` routes.
 * `deviceId` is a client-supplied per-install id used purely for rate limiting;
 * it is not an identity and is never trusted for authorization.
 */
export type AnonymousPrincipal = {
  type: 'anonymous';
  deviceId: string;
};

export type Principal = UserPrincipal | PartnerPrincipal | AnonymousPrincipal;
