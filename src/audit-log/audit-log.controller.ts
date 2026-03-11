import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger/dist/decorators/api-bearer.decorator';
import { ApiTags } from '@nestjs/swagger/dist/decorators/api-use-tags.decorator';
import { ApiOperation } from '@nestjs/swagger/dist/decorators/api-operation.decorator';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { Permissions } from 'src/permission/constants/permissions.constants';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

@ApiTags('Audit Logs')
@ApiBearerAuth('access-token')
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: 'Audit kayıtlarını listele (filtreli, sayfalı)' })
  @RequirePermission(Permissions.AUDIT_LOG_READ)
  findAll(@Query() query: ListAuditLogsDto) {
    return this.auditLogService.findAll(query);
  }
}
