import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import express, { Express } from 'express';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

let cachedServer: Express | undefined;

async function getServer(): Promise<Express> {
  if (cachedServer) {
    return cachedServer;
  }

  const server = express();
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(server),
    { logger: ['error', 'warn', 'log'] },
  );
  configureApp(app);
  await app.init();
  cachedServer = server;
  return server;
}

export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const server = await getServer();
  server(req, res);
}
