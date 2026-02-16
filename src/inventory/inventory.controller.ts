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
import { SellStockDto } from './dto/sell-stock.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { ListMovementsQueryDto } from './dto/list-movements.dto';
import { BulkReceiveStockDto } from './dto/bulk-receive-stock.dto';
import { LowStockQueryDto } from './dto/low-stock-query.dto';
import { BulkAdjustStockDto } from './dto/bulk-adjust-stock.dto';
import { OptionalPaginationQueryDto } from './dto/optional-pagination.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Inventory')
@ApiBearerAuth('access-token') // DocumentBuilder içindeki key
@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) { }

  // Stok girişi (tedarik, iade vs.)
  @Post('receive')
  @ApiOperation({ summary: 'Mağazaya stok girişi (tedarik / iade)' })
  receiveStock(@Body() dto: ReceiveStockDto) {
    return this.inventoryService.receiveStock(dto);
  }

  // Toplu stok girişi
  @Post('receive/bulk')
  @ApiOperation({ summary: 'Toplu stok girişi (birden fazla satır)' })
  bulkReceiveStock(@Body() dto: BulkReceiveStockDto) {
    return this.inventoryService.bulkReceiveStock(dto);
  }

  // Mağazalar arası transfer
  @Post('transfer')
  @ApiOperation({ summary: 'Mağazalar arası stok transferi' })
  transferStock(@Body() dto: TransferStockDto) {
    return this.inventoryService.transferStock(dto);
  }

  // Stok çıkışı (satış, iade vs.)
  @Post('sell')
  @ApiOperation({ summary: 'Mağazadan stok çıkışı (satış / iade)' })
  sell(@Body() dto: SellStockDto) {
    return this.inventoryService.sellFromStore(dto);
  }

  // Stok düzeltme
  @Post('adjust')
  @ApiOperation({ summary: 'Stok düzeltme' })
  adjust(@Body() dto: AdjustStockDto) {
    return this.inventoryService.adjustStock(dto);
  }

  @Post('adjust/bulk')
  @ApiOperation({ summary: 'Toplu stok düzeltme' })
  bulkAdjust(@Body() dto: BulkAdjustStockDto) {
    return this.inventoryService.bulkAdjustStock(dto);
  }

  // Hareket geçmişi
  @Get('movements')
  @ApiOperation({ summary: 'Stok hareket geçmişi (filtreli, paginated)' })
  getMovementHistory(@Query() query: ListMovementsQueryDto) {
    return this.inventoryService.getMovementHistory(query);
  }

  // Düşük stok uyarıları
  @Get('alerts/low-stock')
  @ApiOperation({ summary: 'Düşük stok uyarıları' })
  getLowStockAlerts(@Query() query: LowStockQueryDto) {
    return this.inventoryService.getLowStockAlerts(query);
  }

  // Belirli store + variant için stok
  @Get('store/:storeId/variant/:variantId/stock')
  @ApiOperation({ summary: 'Belirli store + varyant için stok miktarı' })
  getStockForVariantInStore(
    @Param('storeId') storeId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.inventoryService.getStockForVariantInStore(storeId, variantId);
  }

  // Belirli store için variant bazlı stok özeti
  @Get('store/:storeId/stock')
  @ApiOperation({ summary: 'Store bazlı stok özeti (varyant bazında)' })
  getStoreStockSummary(@Param('storeId') storeId: string) {
    return this.inventoryService.getStoreStockSummary(storeId);
  }

  // Tenant bazlı stok özeti
  @Get('tenant/stock')
  @ApiOperation({ summary: 'Tenant bazlı stok özeti (varyant bazında)' })
  getTenantStockSummary(@Query() query: OptionalPaginationQueryDto) {
    return this.inventoryService.getTenantStockSummary(query);
  }

  // GET /inventory/variant/:variantId/by-store
  @Get('variant/:variantId/by-store')
  async getVariantStockByStore(
    @Param('variantId') variantId: string,
    @Query() query: OptionalPaginationQueryDto,
  ) {
    return this.inventoryService.getVariantStockByStore(variantId, query);
  }

}
