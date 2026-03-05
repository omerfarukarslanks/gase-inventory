import { SetMetadata } from '@nestjs/common';
import { PermissionName } from 'src/permission/constants/permissions.constants';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';

/**
 * Endpoint'e erişim için gereken yetki adını belirtir.
 * PermissionGuard bu değeri okuyarak DB'den (cache üzerinden) kontrol eder.
 *
 * Örnek:
 *   @RequirePermission(Permissions.STOCK_ADJUST)
 *   @Post('adjust')
 *   adjustStock(...) { ... }
 */
export const RequirePermission = (permission: PermissionName) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permission);
