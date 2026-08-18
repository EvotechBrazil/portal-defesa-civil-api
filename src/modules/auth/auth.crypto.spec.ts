import { createHash } from 'node:crypto';
import {
  BCRYPT_ROUNDS,
  generateOpaqueToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from './auth.crypto';

describe('auth.crypto', () => {
  it('hashes passwords with bcrypt 12 rounds and never stores plaintext', async () => {
    const password = 's3cret-pass!';
    const hash = await hashPassword(password);

    expect(hash).toMatch(new RegExp(`^\\$2[aby]\\$${BCRYPT_ROUNDS}\\$`));
    expect(hash).not.toContain(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('hashes opaque tokens with sha256 hex', () => {
    const token = 'refresh-or-verify-token';
    expect(hashToken(token)).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(hashToken(token)).not.toBe(token);
  });

  it('generates unique opaque tokens', () => {
    const first = generateOpaqueToken();
    const second = generateOpaqueToken();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
