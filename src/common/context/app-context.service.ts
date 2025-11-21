// src/common/context/app-context.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from './cls-store.type';
import { ContextErrors } from '../errors/context.errors';

@Injectable()
export class AppContextService {
  constructor(
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  // ---- Tenant ----
  getTenantIdOrThrow(): string {
    const tenantId = this.cls.get('tenantId');
    if (!tenantId) {
      throw new UnauthorizedException(ContextErrors.TENANT_NOT_FOUND);
    }
    return tenantId;
  }

  getTenantId(): string | undefined {
    return this.cls.get('tenantId');
  }

  // ---- User ----
  getUserIdOrThrow(): string {
    const userId = this.cls.get('userId');
    if (!userId) {
      throw new UnauthorizedException(ContextErrors.USER_NOT_FOUND);
    }
    return userId;
  }

  // Signup gibi durumlarda kullanacağız
  getUserIdOrNull(): string | undefined {
    return this.cls.get('userId') ?? undefined;
  }

  // ---- Correlation / meta ----
  getCorrelationId(): string | undefined {
    return this.cls.get('correlationId');
  }

  getIp(): string | undefined {
    return this.cls.get('ip');
  }

  getUserAgent(): string | undefined {
    return this.cls.get('userAgent');
  }
}
