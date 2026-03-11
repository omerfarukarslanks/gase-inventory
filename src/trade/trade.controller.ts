import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { Permissions } from 'src/permission/constants/permissions.constants';
import { TradeService } from './trade.service';
import {
  CreateCustomerGroupDto,
  CreatePaymentTermDto,
  UpdateCustomerGroupDto,
  UpdatePaymentTermDto,
  UpsertCreditLimitDto,
  UpsertPriceListEntryDto,
} from './dto/trade.dto';

@ApiTags('Trade')
@ApiBearerAuth('access-token')
@Controller('trade')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TradeController {
  constructor(private readonly tradeService: TradeService) {}

  // ── Customer Groups ──────────────────────────────────────────────────────

  @Post('customer-groups')
  @ApiOperation({ summary: 'Müşteri grubu oluştur' })
  @RequirePermission(Permissions.TRADE_MANAGE)
  createGroup(@Body() dto: CreateCustomerGroupDto) {
    return this.tradeService.createGroup(dto);
  }

  @Get('customer-groups')
  @ApiOperation({ summary: 'Müşteri gruplarını listele' })
  @RequirePermission(Permissions.TRADE_READ)
  listGroups() {
    return this.tradeService.listGroups();
  }

  @Get('customer-groups/:id')
  @ApiOperation({ summary: 'Müşteri grubu detayı' })
  @RequirePermission(Permissions.TRADE_READ)
  getGroup(@Param('id') id: string) {
    return this.tradeService.getGroup(id);
  }

  @Patch('customer-groups/:id')
  @ApiOperation({ summary: 'Müşteri grubu güncelle' })
  @RequirePermission(Permissions.TRADE_MANAGE)
  updateGroup(@Param('id') id: string, @Body() dto: UpdateCustomerGroupDto) {
    return this.tradeService.updateGroup(id, dto);
  }

  @Delete('customer-groups/:id')
  @ApiOperation({ summary: 'Müşteri grubu sil' })
  @RequirePermission(Permissions.TRADE_MANAGE)
  deleteGroup(@Param('id') id: string) {
    return this.tradeService.deleteGroup(id);
  }

  // ── Customer Group Price List ────────────────────────────────────────────

  @Post('customer-groups/:groupId/price-list')
  @ApiOperation({ summary: 'Gruba toptan fiyat ekle / güncelle (upsert)' })
  @RequirePermission(Permissions.TRADE_MANAGE)
  upsertPriceListEntry(
    @Param('groupId') groupId: string,
    @Body() dto: UpsertPriceListEntryDto,
  ) {
    return this.tradeService.upsertPriceListEntry(groupId, dto);
  }

  @Get('customer-groups/:groupId/price-list')
  @ApiOperation({ summary: 'Grup fiyat listesini görüntüle' })
  @RequirePermission(Permissions.TRADE_READ)
  listPriceListEntries(@Param('groupId') groupId: string) {
    return this.tradeService.listPriceListEntries(groupId);
  }

  @Delete('customer-groups/:groupId/price-list/:productVariantId')
  @ApiOperation({ summary: 'Grup fiyat listesinden varyant kaldır' })
  @RequirePermission(Permissions.TRADE_MANAGE)
  deletePriceListEntry(
    @Param('groupId') groupId: string,
    @Param('productVariantId') productVariantId: string,
  ) {
    return this.tradeService.deletePriceListEntry(groupId, productVariantId);
  }

  @Get('resolve-price')
  @ApiOperation({ summary: 'Müşteri grubu + varyant için aktif fiyatı sorgula' })
  @RequirePermission(Permissions.TRADE_READ)
  resolveGroupPrice(
    @Query('customerGroupId') customerGroupId: string,
    @Query('productVariantId') productVariantId: string,
  ) {
    return this.tradeService.resolveGroupPrice(customerGroupId, productVariantId);
  }

  // ── Credit Limits ────────────────────────────────────────────────────────

  @Post('customers/:customerId/credit-limit')
  @ApiOperation({ summary: 'Müşteri kredi limiti tanımla / güncelle' })
  @RequirePermission(Permissions.TRADE_MANAGE)
  upsertCreditLimit(
    @Param('customerId') customerId: string,
    @Body() dto: UpsertCreditLimitDto,
  ) {
    return this.tradeService.upsertCreditLimit(customerId, dto);
  }

  @Get('customers/:customerId/credit-limit')
  @ApiOperation({ summary: 'Müşteri kredi limitini görüntüle' })
  @RequirePermission(Permissions.TRADE_READ)
  getCreditLimit(@Param('customerId') customerId: string) {
    return this.tradeService.getCreditLimit(customerId);
  }

  @Delete('customers/:customerId/credit-limit')
  @ApiOperation({ summary: 'Müşteri kredi limitini sil' })
  @RequirePermission(Permissions.TRADE_MANAGE)
  deleteCreditLimit(@Param('customerId') customerId: string) {
    return this.tradeService.deleteCreditLimit(customerId);
  }

  // ── Payment Terms ────────────────────────────────────────────────────────

  @Post('payment-terms')
  @ApiOperation({ summary: 'Ödeme vadesi tanımla' })
  @RequirePermission(Permissions.TRADE_MANAGE)
  createPaymentTerm(@Body() dto: CreatePaymentTermDto) {
    return this.tradeService.createPaymentTerm(dto);
  }

  @Get('payment-terms')
  @ApiOperation({ summary: 'Ödeme vadesi listesi' })
  @RequirePermission(Permissions.TRADE_READ)
  listPaymentTerms() {
    return this.tradeService.listPaymentTerms();
  }

  @Get('payment-terms/:id')
  @ApiOperation({ summary: 'Ödeme vadesi detayı' })
  @RequirePermission(Permissions.TRADE_READ)
  getPaymentTerm(@Param('id') id: string) {
    return this.tradeService.getPaymentTerm(id);
  }

  @Patch('payment-terms/:id')
  @ApiOperation({ summary: 'Ödeme vadesi güncelle' })
  @RequirePermission(Permissions.TRADE_MANAGE)
  updatePaymentTerm(@Param('id') id: string, @Body() dto: UpdatePaymentTermDto) {
    return this.tradeService.updatePaymentTerm(id, dto);
  }

  @Delete('payment-terms/:id')
  @ApiOperation({ summary: 'Ödeme vadesi sil' })
  @RequirePermission(Permissions.TRADE_MANAGE)
  deletePaymentTerm(@Param('id') id: string) {
    return this.tradeService.deletePaymentTerm(id);
  }

  @Get('resolve-payment-term')
  @ApiOperation({ summary: 'Müşteri için geçerli ödeme vadesini çöz' })
  @RequirePermission(Permissions.TRADE_READ)
  resolvePaymentTerm(
    @Query('customerId') customerId: string,
    @Query('customerGroupId') customerGroupId?: string,
  ) {
    return this.tradeService.resolvePaymentTerm(customerId, customerGroupId);
  }
}
