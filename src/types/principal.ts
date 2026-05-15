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

export type Principal = UserPrincipal | PartnerPrincipal;
