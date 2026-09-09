import { query } from './db.js';
import { resolvePolicy, type Policy } from './policy.js';

/**
 * The policy in force for one signed-in account.
 *
 * One query, LEFT JOIN because most accounts have no org: a user with no fleet
 * is not an error, it is the common case outside Esvagt and DFDS.
 *
 * Throws if the user row is missing. Callers treat that as "deny", because a
 * request authenticated as a user who no longer exists should not reach a
 * feature check at all.
 */
export async function policyForUser(userId: string): Promise<Policy> {
  const result = await query<{ user_policy: unknown; org_policy: unknown }>(
    `SELECT u.policy AS user_policy, p.policy AS org_policy
       FROM users u
       LEFT JOIN partners p ON p.id = u.org_id
      WHERE u.id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`no such user: ${userId}`);
  return resolvePolicy(row.org_policy, row.user_policy);
}
