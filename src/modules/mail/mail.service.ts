import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export type AccessRequestMailPayload = {
  name: string;
  whatsapp: string;
  email: string;
  lgndNumber: string;
  manada: string;
  city?: string | null;
  state?: string | null;
  justification: string;
};

@Injectable()
export class MailService {
  private readonly transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    const user = this.configService.get<string>('mail.user');
    const pass = this.configService.get<string>('mail.pass');
    this.transporter = createTransport({
      host: this.configService.getOrThrow<string>('mail.host'),
      port: this.configService.getOrThrow<number>('mail.port'),
      secure: this.configService.get<boolean>('mail.secure') ?? false,
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const from = this.configService.getOrThrow<string>('mail.from');
    const webBaseUrl = this.configService.getOrThrow<string>('mail.webBaseUrl');
    const verifyUrl = `${webBaseUrl}/verificar-email?token=${encodeURIComponent(token)}`;

    await this.transporter.sendMail({
      from,
      to,
      subject: 'Verifique seu e-mail — LGND SQUAD',
      text: [
        'Olá,',
        '',
        'Confirme seu cadastro no Programa de evolução contínua LGND SQUAD acessando o link abaixo:',
        verifyUrl,
        '',
        'O link expira em 24 horas. Se você não criou esta conta, ignore este e-mail.',
      ].join('\n'),
      html: [
        '<p>Olá,</p>',
        '<p>Confirme seu cadastro no Programa de evolução contínua LGND SQUAD clicando no link abaixo:</p>',
        `<p><a href="${verifyUrl}">Verificar e-mail</a></p>`,
        '<p>O link expira em 24 horas. Se você não criou esta conta, ignore este e-mail.</p>',
      ].join(''),
    });
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const from = this.configService.getOrThrow<string>('mail.from');
    const webBaseUrl = this.configService.getOrThrow<string>('mail.webBaseUrl');
    const resetUrl = `${webBaseUrl}/redefinir-senha?token=${encodeURIComponent(token)}`;

    await this.transporter.sendMail({
      from,
      to,
      subject: 'Redefina sua senha — LGND SQUAD',
      text: [
        'Olá,',
        '',
        'Recebemos um pedido para redefinir a senha da sua conta no Programa de evolução contínua LGND SQUAD. Acesse o link abaixo:',
        resetUrl,
        '',
        'O link expira em 60 minutos. Se você não pediu isso, ignore este e-mail.',
      ].join('\n'),
      html: [
        '<p>Olá,</p>',
        '<p>Recebemos um pedido para redefinir a senha da sua conta no Programa de evolução contínua LGND SQUAD. Clique no link abaixo:</p>',
        `<p><a href="${resetUrl}">Redefinir senha</a></p>`,
        '<p>O link expira em 60 minutos. Se você não pediu isso, ignore este e-mail.</p>',
      ].join(''),
    });
  }

  async sendAccessRequestNotification(
    to: string,
    payload: AccessRequestMailPayload,
  ): Promise<void> {
    const from = this.configService.getOrThrow<string>('mail.from');
    const webBaseUrl = this.configService.getOrThrow<string>('mail.webBaseUrl');
    const inboxUrl = `${webBaseUrl}/admin/acessos`;
    const place = [payload.city, payload.state].filter(Boolean).join('/');
    const location = [payload.manada, place].filter(Boolean).join(' · ');

    await this.transporter.sendMail({
      from,
      to,
      subject: `Nova solicitação de acesso — ${payload.name}`,
      text: [
        'Nova solicitação de acesso ao Programa de evolução contínua LGND SQUAD.',
        '',
        `Nome: ${payload.name}`,
        `WhatsApp: ${payload.whatsapp}`,
        `E-mail: ${payload.email}`,
        `Número Lgnd: ${payload.lgndNumber}`,
        `Manada: ${location || '—'}`,
        '',
        'Justificativa:',
        payload.justification,
        '',
        `Analisar em: ${inboxUrl}`,
      ].join('\n'),
      html: [
        '<p>Nova solicitação de acesso ao Programa de evolução contínua LGND SQUAD.</p>',
        '<ul>',
        `<li><strong>Nome:</strong> ${escapeHtml(payload.name)}</li>`,
        `<li><strong>WhatsApp:</strong> ${escapeHtml(payload.whatsapp)}</li>`,
        `<li><strong>E-mail:</strong> ${escapeHtml(payload.email)}</li>`,
        `<li><strong>Número Lgnd:</strong> ${escapeHtml(payload.lgndNumber)}</li>`,
        `<li><strong>Manada:</strong> ${escapeHtml(location || '—')}</li>`,
        '</ul>',
        '<p><strong>Justificativa</strong></p>',
        `<p>${escapeHtml(payload.justification)}</p>`,
        `<p><a href="${inboxUrl}">Abrir solicitações</a></p>`,
      ].join(''),
    });
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
