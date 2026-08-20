import { registerAs } from '@nestjs/config';

export const mailConfig = registerAs('mail', () => ({
  host: process.env.MAIL_HOST ?? 'localhost',
  port: Number(process.env.MAIL_PORT ?? 1025),
  from:
    process.env.MAIL_FROM ??
    'Programa de evolução contínua LGND SQUAD <noreply@localhost>',
  // Mailpit local nao pede credencial; provedor real (Resend, SES, Brevo) pede.
  // Quando MAIL_USER vier vazio, o transporte sobe sem auth, como em dev.
  user: process.env.MAIL_USER,
  pass: process.env.MAIL_PASSWORD,
  secure: process.env.MAIL_SECURE === 'true',
  webBaseUrl: process.env.WEB_BASE_URL ?? 'http://localhost:3000',
  autoVerifyEmail: process.env.AUTO_VERIFY_EMAIL === 'true',
}));
