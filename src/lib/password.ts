import argon2 from 'argon2';

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536,   // 64 MB
  timeCost: 3,
  parallelism: 4,
};

// Canonical dummy hash — used when user not found to prevent timing attacks
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$dGVzdHNhbHQxMjM0NTY3$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  hash: string,
  password: string
): Promise<boolean> {
  try {
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
