import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

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
}
