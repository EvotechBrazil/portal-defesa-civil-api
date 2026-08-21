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
  // Em produção o default é pular a prova de e-mail: o domínio no Resend
  // ainda não entrega, e o acesso já é fechado pela lista de WhatsApp.
  // AUTO_VERIFY_EMAIL=false religa a verificação quando o SMTP estiver ok.
  autoVerifyEmail: resolveAutoVerifyEmail(),
}));

function resolveAutoVerifyEmail(): boolean {
  const raw = process.env.AUTO_VERIFY_EMAIL;
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  return process.env.NODE_ENV === 'production';
}
