import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';

export const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

/**
 * Hash descartável usado quando o e-mail não existe. Sem ele o bcrypt só roda
 * para usuários reais e a diferença de latência vira oráculo de enumeração.
 */
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  'timing-oracle-placeholder',
  BCRYPT_ROUNDS,
);

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
