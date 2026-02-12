import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/user/user.service';
import { MailService } from 'src/mail/mail.service';
import { PasswordResetToken } from './password-reset-token';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    @InjectRepository(PasswordResetToken)
    private readonly tokenRepo: Repository<PasswordResetToken>,
  ) { }

  validateUser(email: string, password: string) {
    return this.usersService.validateUser(email, password);
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);

    if (!user) {
      throw new UnauthorizedException('Geçersiz email veya şifre');
    }

    const payload = {
      sub: user.id,
      tenantId: user.tenant.id,
      role: user.role,
    };

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        surname: user.surname,
        tenantId: user.tenant.id,
        role: user.role,
      },
    };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  async requestReset(email: string) {
    // Güvenlik: email yoksa bile 200 dön, user enumeration olmasın
    const user = await this.usersService.findByEmail(email);
    if (!user) return;

    const token = randomBytes(32).toString('hex'); // linkte gidecek
    const tokenHash = this.hashToken(token);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 dk

    await this.tokenRepo.insert({
      userId: user.id,
      tenantId: (user as any).tenantId, // varsa
      tokenHash,
      expiresAt,
    });

    const resetUrl = `${process.env.APP_WEB_URL}/reset-password?token=${encodeURIComponent(token)}`;

    await this.mailService.sendPasswordResetEmail(user.email, resetUrl);
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = this.hashToken(token);

    const record = await this.tokenRepo.findOne({
      where: { tokenHash },
    });

    if (!record) {
      throw new Error('Invalid token'); // bunu BadRequestException yap
    }
    if (record.usedAt) {
      throw new Error('Token already used');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new Error('Token expired');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // user password update
    await this.usersService.updatePassword(record.userId, passwordHash);

    // token invalidate
    record.usedAt = new Date();
    await this.tokenRepo.save(record);
  }
}
