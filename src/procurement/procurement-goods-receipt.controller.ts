import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger/dist/decorators/api-bearer.decorator';
import { ApiOperation } from '@nestjs/swagger/dist/decorators/api-operation.decorator';
import { ApiTags } from '@nestjs/swagger/dist/decorators/api-use-tags.decorator';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { Permissions } from 'src/permission/constants/permissions.constants';
import { ListGoodsReceiptsDto } from './dto/list-goods-receipts.dto';
import { ProcurementService } from './procurement.service';

@ApiTags('Procurement Goods Receipts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('procurement/goods-receipts')
export class ProcurementGoodsReceiptController {
  constructor(private readonly procurementService: ProcurementService) {}

  @Get()
  @ApiOperation({ summary: 'Merkezi mal kabul kayitlarini listele' })
  @RequirePermission(Permissions.PO_READ)
  listGoodsReceipts(@Query() query: ListGoodsReceiptsDto) {
    return this.procurementService.listAllGoodsReceipts(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Merkezi mal kabul detayini getir' })
  @RequirePermission(Permissions.PO_READ)
  getGoodsReceipt(@Param('id', ParseUUIDPipe) id: string) {
    return this.procurementService.getGoodsReceipt(id);
  }
}
