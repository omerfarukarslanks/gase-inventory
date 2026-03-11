import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { Permissions } from 'src/permission/constants/permissions.constants';
import { IntegrationService } from './integration.service';
import { CreateIntegrationConnectionDto, UpdateIntegrationConnectionDto } from './dto/integration.dto';

@ApiTags('Integration')
@ApiBearerAuth('access-token')
@Controller('integration')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class IntegrationController {
  constructor(private readonly integrationService: IntegrationService) {}

  // ── Bağlantı yönetimi ─────────────────────────────────────────────────────

  @Post('connections')
  @ApiOperation({ summary: 'Yeni entegrasyon bağlantısı oluştur' })
  @RequirePermission(Permissions.INTEGRATION_MANAGE)
  create(@Body() dto: CreateIntegrationConnectionDto) {
    return this.integrationService.create(dto);
  }

  @Get('connections')
  @ApiOperation({ summary: 'Entegrasyon bağlantılarını listele' })
  @RequirePermission(Permissions.INTEGRATION_READ)
  list() {
    return this.integrationService.list();
  }

  @Get('connections/:id')
  @ApiOperation({ summary: 'Entegrasyon bağlantısı detayı' })
  @RequirePermission(Permissions.INTEGRATION_READ)
  get(@Param('id') id: string) {
    return this.integrationService.get(id);
  }

  @Patch('connections/:id')
  @ApiOperation({ summary: 'Entegrasyon bağlantısını güncelle' })
  @RequirePermission(Permissions.INTEGRATION_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateIntegrationConnectionDto) {
    return this.integrationService.update(id, dto);
  }

  @Delete('connections/:id')
  @ApiOperation({ summary: 'Entegrasyon bağlantısını sil' })
  @RequirePermission(Permissions.INTEGRATION_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string) {
    return this.integrationService.delete(id);
  }

  // ── Test / Sync ───────────────────────────────────────────────────────────

  @Post('connections/:id/test')
  @ApiOperation({ summary: 'Bağlantıyı test et' })
  @RequirePermission(Permissions.INTEGRATION_MANAGE)
  test(@Param('id') id: string) {
    return this.integrationService.testConnection(id);
  }

  @Post('connections/:id/sync')
  @ApiOperation({ summary: 'Manuel senkronizasyon tetikle' })
  @RequirePermission(Permissions.INTEGRATION_MANAGE)
  sync(@Param('id') id: string) {
    return this.integrationService.triggerSync(id);
  }
}
