import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { SellStockDto } from './dto/sell-stock.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
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
  getTenantStockSummary() {
    return this.inventoryService.getTenantStockSummary();
  }

  // GET /inventory/variant/:variantId/by-store
  @Get('variant/:variantId/by-store')
  async getVariantStockByStore(@Param('variantId') variantId: string) {
    return this.inventoryService.getVariantStockByStore(variantId);
  }

}
