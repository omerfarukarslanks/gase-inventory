import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger/dist/decorators/api-bearer.decorator';
import { ApiTags } from '@nestjs/swagger/dist/decorators/api-use-tags.decorator';
import { ApiOperation } from '@nestjs/swagger/dist/decorators/api-operation.decorator';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { Permissions } from 'src/permission/constants/permissions.constants';
import { ProcurementService } from './procurement.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { ListPurchaseOrdersDto } from './dto/list-purchase-orders.dto';

@ApiTags('Procurement')
@ApiBearerAuth('access-token')
@Controller('procurement/purchase-orders')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ProcurementController {
  constructor(private readonly procurementService: ProcurementService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni satın alma siparişi oluştur (DRAFT)' })
  @RequirePermission(Permissions.PO_CREATE)
  createPurchaseOrder(@Body() dto: CreatePurchaseOrderDto) {
    return this.procurementService.createPurchaseOrder(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Satın alma siparişlerini listele' })
  @RequirePermission(Permissions.PO_READ)
  listPurchaseOrders(@Query() query: ListPurchaseOrdersDto) {
    return this.procurementService.listPurchaseOrders(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Satın alma siparişini detaylarıyla getir' })
  @RequirePermission(Permissions.PO_READ)
  getPurchaseOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.procurementService.getPurchaseOrder(id);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Siparişi onayla (DRAFT → APPROVED)' })
  @RequirePermission(Permissions.PO_APPROVE)
  approvePurchaseOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.procurementService.approvePurchaseOrder(id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Siparişi iptal et (DRAFT/APPROVED → CANCELLED)' })
  @RequirePermission(Permissions.PO_CANCEL)
  cancelPurchaseOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.procurementService.cancelPurchaseOrder(id);
  }

  @Post(':id/receipts')
  @ApiOperation({ summary: 'Mal teslim al ve stok güncelle' })
  @RequirePermission(Permissions.PO_RECEIPT_CREATE)
  createGoodsReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateGoodsReceiptDto,
  ) {
    return this.procurementService.createGoodsReceipt(id, dto);
  }

  @Get(':id/receipts')
  @ApiOperation({ summary: 'Siparişe ait teslim kayıtlarını listele' })
  @RequirePermission(Permissions.PO_READ)
  listGoodsReceipts(@Param('id', ParseUUIDPipe) id: string) {
    return this.procurementService.listGoodsReceipts(id);
  }
}
