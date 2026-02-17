import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from 'src/user/user.service';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: string;
  storeId?: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
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
    const user = await this.usersService.findById(payload.sub);

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    if (!user.tenant || user.tenant.id !== payload.tenantId) {
      throw new UnauthorizedException();
    }

    const resolvedStoreId =
      payload.storeId ??
      (await this.usersService.getDefaultStoreIdForUser(
        user.id,
        user.tenant.id,
      ));

    return {
      ...user,
      storeId: resolvedStoreId,
    }; // request.user
  }
}
