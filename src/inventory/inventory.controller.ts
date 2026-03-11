import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { ListMovementsQueryDto } from './dto/list-movements.dto';
import { LowStockQueryDto } from './dto/low-stock-query.dto';
import { OptionalPaginationQueryDto } from './dto/optional-pagination.dto';
import { StockSummaryDto } from './dto/stock-summary.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { Permissions } from 'src/permission/constants/permissions.constants';

@ApiTags('Inventory')
@ApiBearerAuth('access-token')
@Controller('inventory')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) { }

  @Post('receive')
  @ApiOperation({ summary: 'Mağazaya stok girişi (tedarik / iade)' })
  @RequirePermission(Permissions.STOCK_RECEIVE)
  receiveStock(@Body() dto: ReceiveStockDto) {
    return this.inventoryService.receiveStock(dto);
  }

  @Post('transfer')
  @ApiOperation({ summary: 'Mağazalar arası stok transferi' })
  @RequirePermission(Permissions.STOCK_TRANSFER)
  transferStock(@Body() dto: TransferStockDto) {
    return this.inventoryService.transferStock(dto);
  }

  @Post('adjust')
  @ApiOperation({ summary: 'Stok düzeltme (tekil veya items ile toplu)' })
  @RequirePermission(Permissions.STOCK_ADJUST)
  adjust(@Body() dto: AdjustStockDto) {
    return this.inventoryService.adjustStock(dto);
  }

  @Get('movements')
  @ApiOperation({ summary: 'Stok hareket geçmişi (filtreli, paginated)' })
  @RequirePermission(Permissions.STOCK_MOVEMENTS_READ)
  getMovementHistory(@Query() query: ListMovementsQueryDto) {
    return this.inventoryService.getMovementHistory(query);
  }

  @Get('alerts/low-stock')
  @ApiOperation({ summary: 'Düşük stok uyarıları' })
  @RequirePermission(Permissions.STOCK_LOW_ALERTS_READ)
  getLowStockAlerts(@Query() query: LowStockQueryDto) {
    return this.inventoryService.getLowStockAlerts(query);
  }

  @Get('store/:storeId/variant/:variantId/stock')
  @ApiOperation({ summary: 'Belirli store + varyant için stok miktarı' })
  @RequirePermission(Permissions.STOCK_LIST_READ)
  getStockForVariantInStore(
    @Param('storeId') storeId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.inventoryService.getStockForVariantInStore(storeId, variantId);
  }

  @Post('stock/summary')
  @ApiOperation({ summary: 'Stok ozeti (context storeId > body.storeIds > tenant tum storelar)' })
  @RequirePermission(Permissions.STOCK_SUMMARY_READ)
  getStockSummary(@Body() body: StockSummaryDto) {
    return this.inventoryService.getStockSummary(body);
  }

  @Get('variant/:variantId/by-store')
  @RequirePermission(Permissions.STOCK_LIST_READ)
  async getVariantStockByStore(
    @Param('variantId') variantId: string,
    @Query() query: OptionalPaginationQueryDto,
  ) {
    return this.inventoryService.getVariantStockByStore(variantId, query);
  }

  @Get('stock-balances')
  @ApiOperation({ summary: 'Lot/lokasyon bazlı granüler stok bakiyeleri' })
  @RequirePermission(Permissions.STOCK_LIST_READ)
  getStockBalances(
    @Query('storeId') storeId?: string,
    @Query('productVariantId') productVariantId?: string,
    @Query('lotNumber') lotNumber?: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.inventoryService.getStockBalances({
      storeId,
      productVariantId,
      lotNumber,
      locationId,
    });
  }
}
