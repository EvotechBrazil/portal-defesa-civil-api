import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import { PaginationMeta } from '../../src/common/dtos/pagination.dto';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';

export interface Envelope<T> {
  data: T;
  meta?: PaginationMeta;
}

export async function createTestingApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication({ bodyParser: false });
  configureApp(app);
  await app.init();
  return app;
}

export function httpServer(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

export function readEnvelope<T>(body: unknown): Envelope<T> {
  if (!body || typeof body !== 'object' || !('data' in body)) {
    throw new Error('Response is not an envelope');
  }
  return body as Envelope<T>;
}
