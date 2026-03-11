import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { Permissions } from 'src/permission/constants/permissions.constants';
import { EInvoiceService } from './e-invoice.service';
import { CreateEInvoiceDto, ListEInvoicesQueryDto } from './dto/e-invoice.dto';

@ApiTags('e-Fatura')
@ApiBearerAuth('access-token')
@Controller('e-invoice')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class EInvoiceController {
  constructor(private readonly service: EInvoiceService) {}

  @Post('from-sale/:saleId')
  @ApiOperation({
    summary: 'Satıştan e-fatura/e-arşiv belgesi oluştur (DRAFT)',
    description: [
      'Belirtilen satışın verilerinden UBL 2.1 XML üretir.',
      'Belge DRAFT statüsünde oluşturulur; GİB\'e göndermek için `/submit` çağrılmalıdır.',
      'Bir satış için yalnızca tek bir e-fatura oluşturulabilir.',
    ].join('\n'),
  })
  @RequirePermission(Permissions.EINVOICE_MANAGE)
  createFromSale(@Param('saleId') saleId: string, @Body() dto: CreateEInvoiceDto) {
    return this.service.createFromSale(saleId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'e-Fatura listesi' })
  @RequirePermission(Permissions.EINVOICE_READ)
  list(@Query() query: ListEInvoicesQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'e-Fatura detayı (XML dahil)' })
  @RequirePermission(Permissions.EINVOICE_READ)
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post(':id/submit')
  @ApiOperation({
    summary: 'e-Faturayı GİB\'e ilet',
    description: [
      'DRAFT durumundaki faturayı XML olarak imzalar ve GİB\'e gönderir.',
      'Başarılı gönderimde durum SUBMITTED\'a geçer.',
      'GİB\'in onayı için `/query-status` çağrılarak takip yapılır.',
    ].join('\n'),
  })
  @RequirePermission(Permissions.EINVOICE_MANAGE)
  submit(@Param('id') id: string) {
    return this.service.submit(id);
  }

  @Post(':id/query-status')
  @ApiOperation({
    summary: 'GİB\'den fatura durumunu sorgula',
    description: 'SUBMITTED faturanın GİB onay durumunu günceller (ACCEPTED / REJECTED).',
  })
  @RequirePermission(Permissions.EINVOICE_READ)
  queryStatus(@Param('id') id: string) {
    return this.service.queryStatus(id);
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'e-Faturayı iptal et',
    description: [
      'DRAFT: doğrudan iptal (GİB\'e gönderilmez).',
      'SUBMITTED / ACCEPTED: GİB\'e iptal talebi gönderilir.',
    ].join('\n'),
  })
  @ApiQuery({ name: 'reason', required: false, description: 'İptal gerekçesi' })
  @RequirePermission(Permissions.EINVOICE_MANAGE)
  cancel(@Param('id') id: string, @Query('reason') reason = 'İptal') {
    return this.service.cancel(id, reason);
  }
}
