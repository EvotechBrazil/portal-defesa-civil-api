import { registerAs } from '@nestjs/config';

export const mailConfig = registerAs('mail', () => ({
  host: process.env.MAIL_HOST ?? 'localhost',
  port: Number(process.env.MAIL_PORT ?? 1025),
  from: process.env.MAIL_FROM ?? 'Portal Defesa Civil <noreply@localhost>',
  webBaseUrl: process.env.WEB_BASE_URL ?? 'http://localhost:3000',
}));
