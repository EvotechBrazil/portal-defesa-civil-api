import { registerAs } from '@nestjs/config';

export const jwtConfig = registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
  accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  accessTtlSeconds: Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900),
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
  refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  refreshTtlSeconds: Number(process.env.JWT_REFRESH_TTL_SECONDS ?? 60 * 60 * 24 * 7),
}));
