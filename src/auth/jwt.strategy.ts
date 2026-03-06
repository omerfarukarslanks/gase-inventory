import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from 'src/user/user.service';
import { AuthService } from './auth.service';
import { StoreType } from 'src/common/constants/store-type.constants';

export interface JwtPayload {
  jti?: string;
  sub: string;
  tenantId: string;
  role: string;
  storeId?: string | null;
  storeType?: StoreType | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not set in configuration');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.jti && (await this.authService.isAccessTokenRevoked(payload.jti))) {
      throw new UnauthorizedException('Token iptal edilmiş');
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    if (!user.tenant || user.tenant.id !== payload.tenantId) {
      throw new UnauthorizedException();
    }

    let resolvedStoreId = payload.storeId;
    let resolvedStoreType = payload.storeType;

    if (resolvedStoreId === undefined || resolvedStoreType === undefined) {
      const defaultStore = await this.usersService.getDefaultStoreForUser(
        user.id,
        user.tenant.id,
      );
      if (resolvedStoreId === undefined) {
        resolvedStoreId = defaultStore.storeId;
      }
      if (resolvedStoreType === undefined) {
        resolvedStoreType = defaultStore.storeType;
      }
    }

    return {
      ...user,
      storeId: resolvedStoreId,
      storeType: resolvedStoreType,
    }; // request.user
  }
}
