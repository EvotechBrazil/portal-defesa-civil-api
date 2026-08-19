import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

function withServerlessParams(url: string): string {
  if (!url || !process.env.VERCEL) {
    return url;
  }
  const extra: string[] = [];
  if (!/[?&]connection_limit=/.test(url)) {
    extra.push('connection_limit=1');
  }
  if (!/[?&]connect_timeout=/.test(url)) {
    extra.push('connect_timeout=15');
  }
  if (!/[?&]pool_timeout=/.test(url)) {
    extra.push('pool_timeout=20');
  }
  if (url.includes('-pooler.') && !/[?&]pgbouncer=/.test(url)) {
    extra.push('pgbouncer=true');
  }
  if (extra.length === 0) {
    return url;
  }
  return url.includes('?')
    ? `${url}&${extra.join('&')}`
    : `${url}?${extra.join('&')}`;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const url = withServerlessParams(
      process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL || '',
    );
    super(url ? { datasources: { db: { url } } } : undefined);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
