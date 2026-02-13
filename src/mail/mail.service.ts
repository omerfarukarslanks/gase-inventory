import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendPasswordResetEmail(to: string, resetUrl: string) {
    await this.transporter.sendMail({
      from: this.config.get<string>('MAIL_FROM', 'Gase Inventory <no-reply@gase.com>'),
      to,
      subject: 'Şifre Sıfırlama',
      html: `
        <p>Şifreni sıfırlamak için aşağıdaki linke tıkla:</p>
        <p><a href="${resetUrl}">Şifreyi Sıfırla</a></p>
        <p>Bu link 15 dakika geçerlidir.</p>
      `,
    });
  }
}
