import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { ApiBearerAuth } from '@nestjs/swagger/dist/decorators/api-bearer.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Reports')
@ApiBearerAuth('access-token') // DocumentBuilder içindeki key
@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // 1) Mağaza stok özeti
  @Get('store/:storeId/stock')
  @ApiOperation({
    summary: 'Mağaza stok özeti',
    description: 'Belirli mağaza için ürün varyant bazlı stok miktarlarını döner.',
  })
  getStoreStock(@Param('storeId') storeId: string) {
    return this.reportsService.getStoreStockSummary(storeId);
  }

  // 2) Mağaza satış özeti (tarih aralığı)
  @Get('store/:storeId/sales')
  @ApiOperation({
    summary: 'Mağaza satış özeti (tarih aralığı)',
    description:
      'Belirtilen tarih aralığında mağaza için toplam ciro ve ürün bazlı satış özetini döner.',
  })
  getStoreSales(
    @Param('storeId') storeId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reportsService.getStoreSalesSummary({
      storeId,
      startDate,
      endDate,
    });
  }
}
