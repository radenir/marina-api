/**
 * What a fleet is allowed to switch off.
 *
 * This module owns the defaults and the resolution order. Nothing else may
 * define a policy key, and the SQL deliberately does not restate the defaults —
 * a second copy of a definition is what put a wrong M-EWS on the fleet
 * dashboard, and this one would be worse, because a policy that disagreed with
 * itself between SQL and TypeScript would fail open.
 *
 * RESOLUTION: DEFAULTS <- partners.policy <- users.policy. Most specific wins,
 * key by key, so a fleet can disable download while leaving one account able to
 * do it, and an account override of one key does not silently reset the others.
 *
 * This file is deliberately free of imports, so the definition can be tested
 * and read without standing up a database or an environment. The lookup lives
 * in policyStore.ts.
 *
 * FAIL CLOSED IS WRONG HERE. An unknown key resolves to its default, and a user
 * whose row we cannot read is denied by the middleware rather than granted —
 * but a fleet with no policy row gets the defaults, which is everything
 * enabled. That is deliberate: 124 existing accounts have no policy, and a bug
 * in this file must not lock a medical officer out of their own report at three
 * in the morning.
 */

/** Every flag, with the value that applies when nobody has said otherwise. */
export const POLICY_DEFAULTS = {
  /** May the officer download the finished report as a PDF to this device? */
  pdf_download: true,
  /** May the officer have the report emailed to their registered address? */
  pdf_email: true,
} as const;

export type PolicyKey = keyof typeof POLICY_DEFAULTS;
export type Policy = Record<PolicyKey, boolean>;

const KEYS = Object.keys(POLICY_DEFAULTS) as PolicyKey[];

/**
 * Merge stored layers over the defaults.
 *
 * Only known keys are read. A key a customer has never heard of cannot be
 * introduced by writing it into the column, and a stale key left behind by a
 * removed feature is ignored rather than throwing.
 */
export function resolvePolicy(...layers: (unknown)[]): Policy {
  const out = { ...POLICY_DEFAULTS } as Policy;
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') continue;
    const rec = layer as Record<string, unknown>;
    for (const key of KEYS) {
      if (typeof rec[key] === 'boolean') out[key] = rec[key] as boolean;
    }
  }
  return out;
}
