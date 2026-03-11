import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { Permissions } from 'src/permission/constants/permissions.constants';
import { OutboxService } from './outbox.service';
import { AppContextService } from 'src/common/context/app-context.service';

@ApiTags('Outbox (Admin)')
@ApiBearerAuth('access-token')
@Controller('outbox')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class OutboxController {
  constructor(
    private readonly outboxService: OutboxService,
    private readonly appContext: AppContextService,
  ) {}

  @Get('dead-letters')
  @ApiOperation({ summary: 'Dead-letter kuyruğundaki event\'leri listele' })
  @RequirePermission(Permissions.INTEGRATION_MANAGE)
  listDeadLetters(@Query('limit') limit?: string) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    return this.outboxService.fetchDeadLetters(tenantId, limit ? Number(limit) : 50);
  }

  @Post('dead-letters/:id/requeue')
  @ApiOperation({ summary: 'Dead-letter event\'i yeniden kuyruğa al' })
  @RequirePermission(Permissions.INTEGRATION_MANAGE)
  requeueDeadLetter(@Param('id') id: string) {
    return this.outboxService.requeueDeadLetter(id);
  }
}
