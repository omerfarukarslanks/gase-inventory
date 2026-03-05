import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from './permission.entity';
import { RolePermission } from './role-permission.entity';
import { Role } from './role.entity';
import { PermissionService } from './permission.service';
import { PermissionController } from './permission.controller';
import { Tenant } from 'src/tenant/tenant.entity';
import { AppContextModule } from 'src/common/context/app-context.module';

/**
 * @Global() → PermissionService her yerden inject edilebilir.
 * PermissionGuard (APP_GUARD) bunu kullanır.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Permission, RolePermission, Role, Tenant]),
    AppContextModule,
  ],
  providers: [PermissionService],
  controllers: [PermissionController],
  exports: [PermissionService],
})
export class PermissionModule {}
