import { SignJWT, jwtVerify, importPKCS8, importSPKI } from 'jose';
import { randomUUID } from 'crypto';
import { config } from '../config';
import type { JWTPayload } from '../types';

let _privateKey: Awaited<ReturnType<typeof importPKCS8>> | null = null;
let _publicKey: Awaited<ReturnType<typeof importSPKI>> | null = null;

async function getPrivateKey() {
  if (!_privateKey) {
    _privateKey = await importPKCS8(config.jwt.privateKey, 'RS256');
  }
  return _privateKey;
}

async function getPublicKey() {
  if (!_publicKey) {
    _publicKey = await importSPKI(config.jwt.publicKey, 'RS256');
  }
  return _publicKey;
}

export async function signAccessToken(
  userId: string,
  roles: string[] = []
): Promise<{ token: string; jti: string }> {
  const jti = randomUUID();
  const privateKey = await getPrivateKey();

  const token = await new SignJWT({ roles })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(userId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${config.jwt.accessTokenTtl}s`)
    .sign(privateKey);

  return { token, jti };
}

export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  const publicKey = await getPublicKey();
  const { payload } = await jwtVerify(token, publicKey, { algorithms: ['RS256'] });

  return {
    sub: payload.sub as string,
    jti: payload.jti as string,
    iat: payload.iat as number,
    exp: payload.exp as number,
    roles: (payload['roles'] as string[]) ?? [],
  };
}
