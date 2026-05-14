import argon2 from 'argon2';
import bcrypt from 'bcrypt';

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536,   // 64 MB
  timeCost: 3,
  parallelism: 4,
};

// Canonical dummy hash — used when user not found to prevent timing attacks
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$dGVzdHNhbHQxMjM0NTY3$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

// Matches bcrypt's $2a$/$2b$/$2y$ prefixes; legacy users imported from the
// old Next.js app carry bcrypt hashes and rely on this branch. The login
// flow in routes/auth.ts then transparently re-hashes them to argon2id.
const BCRYPT_PREFIX = /^\$2[aby]\$/;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  hash: string,
  password: string
): Promise<boolean> {
  try {
    if (BCRYPT_PREFIX.test(hash)) {
      return await bcrypt.compare(password, hash);
    }
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Always run verify even when user not found to prevent timing-based enumeration.
 */
export async function verifyPasswordConstantTime(
  hash: string | null,
  password: string
): Promise<boolean> {
  const hashToVerify = hash ?? DUMMY_HASH;
  const result = await verifyPassword(hashToVerify, password);
  return hash !== null && result;
}
