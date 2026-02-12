import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  async sendPasswordResetEmail(to: string, resetUrl: string) {
    await this.transporter.sendMail({
      from: process.env.MAIL_FROM ?? 'no-reply@yourapp.com',
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
