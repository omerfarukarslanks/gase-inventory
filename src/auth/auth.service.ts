import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/user/user.service';
import { MailService } from 'src/mail/mail.service';
import { PasswordResetToken } from './password-reset-token';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';

export interface OAuthUserPayload {
  email: string;
  name: string;
  surname: string;
  avatar?: string;
  authProvider: string;
  authProviderId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    @InjectRepository(PasswordResetToken)
    private readonly tokenRepo: Repository<PasswordResetToken>,
    private readonly dataSource: DataSource,
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

  async oauthLogin(oauthUser: OAuthUserPayload) {
    let user = await this.usersService.findByEmail(oauthUser.email);

    if (!user) {
      // İlk kez giriş yapıyor → yeni tenant + user oluştur
      user = await this.usersService.createTenantWithOwnerOAuth(oauthUser);
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Hesap aktif değil');
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

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 dk

    await this.dataSource.transaction(async (manager) => {
      const tokenRepo = manager.getRepository(PasswordResetToken);
      await tokenRepo.insert({
        userId: user.id,
        tenantId: (user as any).tenantId, // varsa
        tokenHash,
        expiresAt,
      });

      
    // Mail gönderimi transaction dışında: başarısız olsa bile token kaybolmaz
    const resetUrl = `${process.env.APP_WEB_URL}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mailService.sendPasswordResetEmail(user.email, resetUrl);
    });

  }

  async resetPassword(token: string, newPassword: string) {

    const tokenHash = this.hashToken(token);

    const record = await this.tokenRepo.findOne({
      where: { tokenHash },
    });

    if (!record) {
      throw new BadRequestException('Geçersiz token');
    }
    if (record.usedAt) {
      throw new BadRequestException('Token zaten kullanılmış');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Token süresi dolmuş');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // user password update
    await this.usersService.updatePassword(record.userId, passwordHash);

    // token invalidate
    record.usedAt = new Date();
    await this.tokenRepo.save(record);
  }
}
