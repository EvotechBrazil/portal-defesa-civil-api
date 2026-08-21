import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import helmet from 'helmet';

/**
 * Foto no cadastro: até 2 MB binário vira ~2,7 MB em data URL. O default do
 * Express é 100 KB — qualquer foto de celular estourava e virava 500.
 */
export const JSON_BODY_LIMIT = '6mb';

export function resolveCorsOrigin(
  raw: string | undefined,
): boolean | string | string[] {
  const value = raw?.trim() || 'http://localhost:3000';
  if (value === '*') {
    return true;
  }
  const list = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (list.length === 1) {
    return list[0];
  }
  return list;
}

export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService);
  app.use(json({ limit: JSON_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));
  app.use(helmet());
  app.enableCors({
    origin: resolveCorsOrigin(configService.get<string>('app.corsOrigin')),
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (configService.get<string>('app.nodeEnv') !== 'production') {
    const swagger = new DocumentBuilder()
      .setTitle('Programa de evolução contínua LGND SQUAD API')
      .setDescription('API do portal de ensino')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      'docs',
      app,
      SwaggerModule.createDocument(app, swagger),
    );
  }
}
