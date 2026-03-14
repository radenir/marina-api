/**
 * Generates an RS256 RSA-4096 key pair and prints them as environment variable values.
 * Usage: npm run generate-keys
 *
 * Paste the output into your .env file:
 *   JWT_PRIVATE_KEY=...
 *   JWT_PUBLIC_KEY=...
 */

import { generateKeyPairSync } from 'crypto';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 4096,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Collapse to single line with \n so it fits in .env
const toEnvLine = (pem: string) => pem.replace(/\n/g, '\\n');

console.log('\n# Paste the following into your .env file:\n');
console.log(`JWT_PRIVATE_KEY="${toEnvLine(privateKey)}"`);
console.log(`JWT_PUBLIC_KEY="${toEnvLine(publicKey)}"`);
console.log('\n# Also generate HMAC secrets:\n');
console.log('# Run: openssl rand -hex 32   (twice — once for EMAIL_SECRET, once for RESET_SECRET)');
