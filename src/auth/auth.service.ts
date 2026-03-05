import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from 'src/user/user.service';
import { MailService } from 'src/mail/mail.service';
import { PasswordResetToken } from './password-reset-token';
import { RefreshToken } from './refresh-token.entity';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PermissionService } from 'src/permission/permission.service';
import { UserRole } from 'src/user/user.entity';

export interface OAuthUserPayload {
  email: string;
  name: string;
  surname: string;
  avatar?: string;
  authProvider: string;
  authProviderId: string;
}

// Saniye cinsinden parse: '30d' → 2592000, '1h' → 3600
function parseDurationToMs(value: string): number {
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) return 30 * 24 * 60 * 60 * 1000; // 30 gün default
  const n = parseInt(match[1], 10);
  const unit: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * unit[match[2]];
}

@Injectable()
export class AuthService {
  private readonly refreshTokenTtlMs: number;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly permissionService: PermissionService,
    @InjectRepository(PasswordResetToken)
    private readonly tokenRepo: Repository<PasswordResetToken>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly dataSource: DataSource,
  ) {
    this.refreshTokenTtlMs = parseDurationToMs(
      this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN') ?? '30d',
    );
  }

  validateUser(email: string, password: string) {
    return this.usersService.validateUser(email, password);
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async issueRefreshToken(userId: string, tenantId?: string): Promise<string> {
    const raw = randomBytes(40).toString('hex');
    const tokenHash = this.hashToken(raw);
    const expiresAt = new Date(Date.now() + this.refreshTokenTtlMs);
    await this.refreshTokenRepo.insert({ userId, tenantId, tokenHash, expiresAt });
    return raw;
  }

  private buildLoginPayload(user: any, storeId: string | null, storeType: string | null) {
    return {
      sub: user.id,
      tenantId: user.tenant.id,
      role: user.role,
      storeId,
      storeType,
    };
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);

    if (!user) {
      throw new UnauthorizedException('Geçersiz email veya şifre');
    }

    const { storeId, storeType } = await this.usersService.getDefaultStoreForUser(
      user.id,
      user.tenant.id,
    );
    const payload = this.buildLoginPayload(user, storeId, storeType);
    const [access_token, refresh_token, permissionSet] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.issueRefreshToken(user.id, user.tenant.id),
      this.permissionService.getRolePermissions(user.tenant.id, user.role as UserRole),
    ]);

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        surname: user.surname,
        tenantId: user.tenant.id,
        storeId,
        storeType,
        role: user.role,
        permissions: [...permissionSet],
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

    const { storeId, storeType } = await this.usersService.getDefaultStoreForUser(
      user.id,
      user.tenant.id,
    );
    const payload = this.buildLoginPayload(user, storeId, storeType);
    const [access_token, refresh_token, permissionSet] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.issueRefreshToken(user.id, user.tenant.id),
      this.permissionService.getRolePermissions(user.tenant.id, user.role as UserRole),
    ]);

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        surname: user.surname,
        tenantId: user.tenant.id,
        storeId,
        storeType,
        role: user.role,
        permissions: [...permissionSet],
      },
    };
  }

  async refresh(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    const record = await this.refreshTokenRepo.findOne({ where: { tokenHash } });

    if (!record) {
      throw new UnauthorizedException('Geçersiz refresh token');
    }
    if (record.revokedAt) {
      throw new UnauthorizedException('Refresh token iptal edilmiş');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token süresi dolmuş');
    }

    const user = await this.usersService.findById(record.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Kullanıcı bulunamadı veya aktif değil');
    }

    const { storeId, storeType } = await this.usersService.getDefaultStoreForUser(
      user.id,
      user.tenant.id,
    );

    // Token rotation: eski token'ı revoke et, yenisini oluştur
    record.revokedAt = new Date();
    await this.refreshTokenRepo.save(record);

    const payload = this.buildLoginPayload(user, storeId, storeType);
    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.issueRefreshToken(user.id, record.tenantId),
    ]);

    return { access_token, refresh_token };
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const record = await this.refreshTokenRepo.findOne({ where: { tokenHash } });
    if (record && !record.revokedAt) {
      record.revokedAt = new Date();
      await this.refreshTokenRepo.save(record);
    }
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
