import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { AppContextService } from 'src/common/context/app-context.service';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { UserRole } from 'src/user/user.entity';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ListQueryDto } from './dto/list-query.dto';
import { Permissions } from './constants/permissions.constants';
import { PermissionService } from './permission.service';

@ApiTags('Permissions')
@ApiBearerAuth('access-token')
@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission(Permissions.PERMISSION_MANAGE)
export class PermissionController {
  constructor(
    private readonly permissionService: PermissionService,
    private readonly appContext: AppContextService,
  ) {}

  // ─── Permission Endpoints ─────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Yeni yetki tanımı oluştur' })
  createPermission(@Body() dto: CreatePermissionDto) {
    return this.permissionService.createPermission(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Yetki tanımını güncelle (açıklama / grup)' })
  updatePermission(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.permissionService.updatePermission(id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Yetkileri listele — ?all=true tümünü, yoksa sayfalı döner',
  })
  listPermissions(@Query() query: ListQueryDto) {
    return this.permissionService.listPermissions(query);
  }

  // ─── Role Endpoints ───────────────────────────────────────────────────────

  @Get('roles')
  @ApiOperation({
    summary: 'Tüm rolleri ve bağlı yetkilerini listele — ?all=true tümünü, yoksa sayfalı döner',
  })
  listRoles(@Query() query: ListQueryDto) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    return this.permissionService.listRoles(tenantId, query);
  }

  @Get('roles/:role')
  @ApiOperation({ summary: 'Belirli bir rolün yetkilerini getir' })
  getRole(@Param('role', new ParseEnumPipe(UserRole)) role: UserRole) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    return this.permissionService.getForRole(tenantId, role);
  }

  @Post('roles')
  @ApiOperation({
    summary: 'Role yetki ekle (mevcut yetkiler korunur, yeni olanlar eklenir)',
  })
  createRole(@Body() dto: CreateRoleDto) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    return this.permissionService.createRole(tenantId, dto);
  }

  @Put('roles/:role')
  @ApiOperation({
    summary: 'Rolün tüm yetkilerini değiştir (mevcut yetkiler silinip liste uygulanır)',
  })
  updateRole(
    @Param('role', new ParseEnumPipe(UserRole)) role: UserRole,
    @Body() dto: UpdateRoleDto,
  ) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    return this.permissionService.updateRole(tenantId, role, dto);
  }
}
