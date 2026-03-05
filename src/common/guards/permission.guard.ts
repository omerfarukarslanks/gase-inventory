import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  REQUIRE_PERMISSION_KEY,
} from '../decorators/require-permission.decorator';
import { PermissionService } from 'src/permission/permission.service';
import { UserRole } from 'src/user/user.entity';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // @Public() → tüm kontrolleri atla
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false; // JwtAuthGuard zaten 401 atacak

    // ── @RequirePermission() kontrolü ──────────────────────────────────────
    const requiredPermission = this.reflector.getAllAndOverride<string>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) return true; // Yetki kısıtı yok

    const tenantId = user.tenant?.id as string | undefined;
    if (!tenantId) return false;

    const hasPermission = await this.permissionService.hasPermission(
      tenantId,
      user.role as UserRole,
      requiredPermission,
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Bu işlem için '${requiredPermission}' yetkisi gereklidir.`,
      );
    }

    return true;
  }
}
