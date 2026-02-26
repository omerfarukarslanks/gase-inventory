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

@ApiTags('Sales')
@ApiBearerAuth('access-token')
@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni satış fişi oluştur ve stok düş' })
  createSale(@Body() dto: CreateSaleDto) {
    return this.salesService.createSale(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Satış fişini detaylarıyla getir' })
  getSale(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Satış fişini düzenle' })
  updateSale(@Param('id') id: string, @Body() dto: UpdateSaleDto) {
    return this.salesService.updateSale(id, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'Satis fislerini getir (context storeId varsa o store; yoksa storeIds filtresi; o da yoksa tenant geneli)',
  })
  getSalesForStore(@Query() query: ListSalesForStoreQueryDto) {
    return this.salesService.findAllForStore(query);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Satış fişini iptal et ve stok iadesi yap' })
  cancelSale(@Param('id') id: string, @Body() dto: CancelSaleDto) {
    return this.salesService.cancelSale(id, dto);
  }

  // ---- Ödeme işlemleri ----

  @Get(':id/payments')
  @ApiOperation({ summary: 'Satış fişinin ödeme kayıtlarını listele' })
  listPayments(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesService.listPayments(id);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Satış fişine ödeme kaydı ekle' })
  addPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddPaymentDto,
  ) {
    return this.salesService.addPayment(id, dto);
  }

  @Patch(':id/payments/:paymentId')
  @ApiOperation({ summary: 'Ödeme kaydını güncelle (eski kayıt iptal → yeni kayıt açılır)' })
  updatePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: UpdatePaymentDto,
  ) {
    return this.salesService.updatePayment(id, paymentId, dto);
  }

  @Delete(':id/payments/:paymentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Ödeme kaydını iptal et (soft-cancel) ve kalan tutarı güncelle' })
  deletePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.salesService.deletePayment(id, paymentId);
  }

  // ---- Satır düzenleme (cerrahi) ----

  @Post(':id/lines')
  @ApiOperation({ summary: 'Mevcut satış fişine yeni satır ekle ve stok düş' })
  addSaleLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSaleLineDto,
  ) {
    return this.salesService.addSaleLine(id, dto);
  }

  @Patch(':id/lines/:lineId')
  @ApiOperation({
    summary:
      'Satış satırını cerrahi güncelle — quantity değişirse stok farkı otomatik ayarlanır; ürün kimliği değiştirilemez',
  })
  updateSaleLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: PatchSaleLineDto,
  ) {
    return this.salesService.updateSaleLine(id, lineId, dto);
  }

  @Delete(':id/lines/:lineId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Satış satırını sil — stok iade edilir, satış toplamları güncellenir (son satır ve iade olan satır silinemez)',
  })
  removeSaleLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.salesService.removeSaleLine(id, lineId);
  }

  // ---- Kısmi İade ----

  @Post(':id/returns')
  @ApiOperation({
    summary: 'Satıştan kısmi iade oluştur — seçili satırları belirtilen miktarda iade eder, stoklar geri yüklenir',
  })
  createReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSaleReturnDto,
  ) {
    return this.salesService.createSaleReturn(id, dto);
  }

  @Get(':id/returns')
  @ApiOperation({ summary: 'Satışa ait tüm iade kayıtlarını listele' })
  listReturns(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesService.listSaleReturns(id);
  }

  // ---- PDF Fiş ----

  @Get(':id/receipt')
  @ApiOperation({ summary: 'Satış fişini PDF olarak indir (80mm termal yazıcı formatı)' })
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
