import { registerAs } from '@nestjs/config';

const DEV_ACCESS_SECRET = 'dev-access-secret-change-me';
const DEV_REFRESH_SECRET = 'dev-refresh-secret-change-me';

/**
 * Segredo obrigatório fora de desenvolvimento. O fallback existe só para o
 * ambiente local e para os e2e; em produção um segredo ausente derruba o boot
 * em vez de assinar JWT com uma string versionada no repositório.
 */
function requireSecret(value: string | undefined, name: string, dev: string) {
  if (value) {
    return value;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is required in production`);
  }
  return dev;
}

export const jwtConfig = registerAs('jwt', () => ({
  accessSecret: requireSecret(
    process.env.JWT_ACCESS_SECRET,
    'JWT_ACCESS_SECRET',
    DEV_ACCESS_SECRET,
  ),
  accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  accessTtlSeconds: Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900),
  refreshSecret: requireSecret(
    process.env.JWT_REFRESH_SECRET,
    'JWT_REFRESH_SECRET',
    DEV_REFRESH_SECRET,
  ),
  refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  refreshTtlSeconds: Number(
    process.env.JWT_REFRESH_TTL_SECONDS ?? 60 * 60 * 24 * 7,
  ),
}));
