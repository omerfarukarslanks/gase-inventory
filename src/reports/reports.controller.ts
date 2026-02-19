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
import { ReportScopeQueryDto } from './dto/report-scope-query.dto';

@ApiTags('Reports')
@ApiBearerAuth('access-token') // DocumentBuilder içindeki key
@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('stock/total-quantity')
  @ApiOperation({
    summary:
      'Toplam stok miktari raporu (default gunluk, tarih araligi + search + compareDate yuzde degisim)',
  })
  getTotalStockQuantity(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getTotalStockQuantityReport(query);
  }

  @Get('orders/confirmed/total')
  @ApiOperation({
    summary:
      'Toplam confirmed siparis raporu (default gunluk, filtreler + compareDate yuzde degisim)',
  })
  getTotalConfirmedOrders(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getTotalConfirmedOrdersReport(query);
  }

  @Get('orders/returns/total')
  @ApiOperation({
    summary:
      'Toplam iade/cancelled siparis raporu (default gunluk, filtreler + compareDate yuzde degisim)',
  })
  getTotalReturnedOrders(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getTotalReturnedOrdersReport(query);
  }

  @Get('sales/summary')
  @ApiOperation({
    summary:
      'Satis ozeti (context storeId > storeIds > tenant tum storelar)',
  })
  getSalesSummary(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getSalesSummaryReport(query);
  }

  @Get('sales/by-product')
  @ApiOperation({
    summary:
      'Urun/varyant bazli satis performansi (opsiyonel pagination)',
  })
  getSalesByProduct(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getSalesByProductReport(query);
  }

  @Get('stores/performance')
  @ApiOperation({
    summary:
      'Magaza performans karsilastirmasi (context storeId varsa tek store)',
  })
  getStorePerformance(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getStorePerformanceReport(query);
  }

  @Get('stock/summary')
  @ApiOperation({
    summary:
      'Stok ozeti (context storeId > storeIds > tenant tum storelar, opsiyonel pagination)',
  })
  getStockSummary(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getStockSummaryReport(query);
  }

  @Get('stock/low')
  @ApiOperation({
    summary:
      'Dusuk stok raporu (threshold + scope kurallari + opsiyonel pagination)',
  })
  getLowStock(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getLowStockReport(query);
  }

  @Get('inventory/movements/summary')
  @ApiOperation({
    summary:
      'Stok hareket ozeti (IN/OUT/TRANSFER/ADJUSTMENT) + opsiyonel detay liste',
  })
  getInventoryMovementsSummary(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getInventoryMovementsSummaryReport(query);
  }

  @Get('sales/cancellations')
  @ApiOperation({
    summary:
      'Iptal edilen satis fisleri raporu (scope + filtre + opsiyonel pagination)',
  })
  getSalesCancellations(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getSalesCancellationsReport(query);
  }
}
