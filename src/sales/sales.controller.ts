import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { ApiBearerAuth } from '@nestjs/swagger/dist/decorators/api-bearer.decorator';
import { ApiTags } from '@nestjs/swagger/dist/decorators/api-use-tags.decorator';
import { ApiOperation } from '@nestjs/swagger/dist/decorators/api-operation.decorator';
import { ListSalesForStoreQueryDto } from './dto/list-sales.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { CancelSaleDto } from './dto/cancel-sale.dto';
import { AddPaymentDto } from './dto/add-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { PatchSaleLineDto } from './dto/patch-sale-line.dto';
import { CreateSaleLineDto } from './dto/create-sale-line.dto';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { Permissions } from 'src/permission/constants/permissions.constants';

@ApiTags('Sales')
@ApiBearerAuth('access-token')
@Controller('sales')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni satış fişi oluştur ve stok düş' })
  @RequirePermission(Permissions.SALE_CREATE)
  createSale(@Body() dto: CreateSaleDto) {
    return this.salesService.createSale(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Satış fişini detaylarıyla getir' })
  @RequirePermission(Permissions.SALE_READ)
  getSale(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Satış fişini düzenle' })
  @RequirePermission(Permissions.SALE_UPDATE)
  updateSale(@Param('id') id: string, @Body() dto: UpdateSaleDto) {
    return this.salesService.updateSale(id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Satış fişlerini getir (context storeId > storeIds > tenant geneli)' })
  @RequirePermission(Permissions.SALE_READ)
  getSalesForStore(@Query() query: ListSalesForStoreQueryDto) {
    return this.salesService.findAllForStore(query);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Satış fişini iptal et ve stok iadesi yap' })
  @RequirePermission(Permissions.SALE_CANCEL)
  cancelSale(@Param('id') id: string, @Body() dto: CancelSaleDto) {
    return this.salesService.cancelSale(id, dto);
  }

  // ---- Ödeme işlemleri ----

  @Get(':id/payments')
  @ApiOperation({ summary: 'Satış fişinin ödeme kayıtlarını listele' })
  @RequirePermission(Permissions.SALE_PAYMENT_READ)
  listPayments(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesService.listPayments(id);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Satış fişine ödeme kaydı ekle' })
  @RequirePermission(Permissions.SALE_PAYMENT_CREATE)
  addPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddPaymentDto,
  ) {
    return this.salesService.addPayment(id, dto);
  }

  @Patch(':id/payments/:paymentId')
  @ApiOperation({ summary: 'Ödeme kaydını güncelle' })
  @RequirePermission(Permissions.SALE_PAYMENT_UPDATE)
  updatePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: UpdatePaymentDto,
  ) {
    return this.salesService.updatePayment(id, paymentId, dto);
  }

  @Delete(':id/payments/:paymentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Ödeme kaydını iptal et (soft-cancel)' })
  @RequirePermission(Permissions.SALE_PAYMENT_UPDATE)
  deletePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.salesService.deletePayment(id, paymentId);
  }

  // ---- Satır düzenleme ----

  @Post(':id/lines')
  @ApiOperation({ summary: 'Mevcut satış fişine yeni satır ekle ve stok düş' })
  @RequirePermission(Permissions.SALE_LINE_CREATE)
  addSaleLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSaleLineDto,
  ) {
    return this.salesService.addSaleLine(id, dto);
  }

  @Patch(':id/lines/:lineId')
  @ApiOperation({ summary: 'Satış satırını güncelle — quantity değişirse stok farkı ayarlanır' })
  @RequirePermission(Permissions.SALE_LINE_UPDATE)
  updateSaleLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: PatchSaleLineDto,
  ) {
    return this.salesService.updateSaleLine(id, lineId, dto);
  }

  @Delete(':id/lines/:lineId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Satış satırını sil — stok iade edilir' })
  @RequirePermission(Permissions.SALE_LINE_UPDATE)
  removeSaleLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.salesService.removeSaleLine(id, lineId);
  }

  // ---- Kısmi İade ----

  @Post(':id/returns')
  @ApiOperation({ summary: 'Satıştan kısmi iade oluştur — seçili satırları iade eder, stoklar geri yüklenir' })
  @RequirePermission(Permissions.SALE_RETURN_CREATE)
  createReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSaleReturnDto,
  ) {
    return this.salesService.createSaleReturn(id, dto);
  }

  @Get(':id/returns')
  @ApiOperation({ summary: 'Satışa ait tüm iade kayıtlarını listele' })
  @RequirePermission(Permissions.SALE_RETURN_READ)
  listReturns(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesService.listSaleReturns(id);
  }

  // ---- PDF Fiş ----

  @Get(':id/receipt')
  @ApiOperation({ summary: 'Satış fişini PDF olarak indir (80mm termal yazıcı formatı)' })
  @RequirePermission(Permissions.SALE_RECEIPT_READ)
  async downloadReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { buffer, receiptNo } = await this.salesService.generateReceipt(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${receiptNo}.pdf"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
}
