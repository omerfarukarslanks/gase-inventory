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
import { RevenueTrendQueryDto } from './dto/revenue-trend-query.dto';
import { DeadStockQueryDto } from './dto/dead-stock-query.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { VatSummaryQueryDto } from './dto/vat-summary-query.dto';
import { TurnoverQueryDto } from './dto/turnover-query.dto';
import { ReorderQueryDto } from './dto/reorder-query.dto';
import { WeekComparisonQueryDto } from './dto/week-comparison-query.dto';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { Permissions } from 'src/permission/constants/permissions.constants';

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // ─── Stok Raporları ────────────────────────────────────────────────────────

  @Get('stock/total-quantity')
  @ApiOperation({ summary: 'Toplam stok miktari raporu' })
  @RequirePermission(Permissions.REPORT_STOCK_READ)
  getTotalStockQuantity(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getTotalStockQuantityReport(query);
  }

  @Get('stock/summary')
  @ApiOperation({ summary: 'Stok ozeti' })
  @RequirePermission(Permissions.REPORT_STOCK_READ)
  getStockSummary(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getStockSummaryReport(query);
  }

  @Get('stock/low')
  @ApiOperation({ summary: 'Dusuk stok raporu' })
  @RequirePermission(Permissions.REPORT_STOCK_READ)
  getLowStock(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getLowStockReport(query);
  }

  @Get('inventory/movements/summary')
  @ApiOperation({ summary: 'Stok hareket ozeti (IN/OUT/TRANSFER/ADJUSTMENT)' })
  @RequirePermission(Permissions.REPORT_STOCK_READ)
  getInventoryMovementsSummary(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getInventoryMovementsSummaryReport(query);
  }

  // ─── Satış Raporları ───────────────────────────────────────────────────────

  @Get('orders/confirmed/total')
  @ApiOperation({ summary: 'Toplam confirmed siparis raporu' })
  @RequirePermission(Permissions.REPORT_SALES_READ)
  getTotalConfirmedOrders(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getTotalConfirmedOrdersReport(query);
  }

  @Get('orders/returns/total')
  @ApiOperation({ summary: 'Toplam iade/cancelled siparis raporu' })
  @RequirePermission(Permissions.REPORT_SALES_READ)
  getTotalReturnedOrders(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getTotalReturnedOrdersReport(query);
  }

  @Get('sales/summary')
  @ApiOperation({ summary: 'Satis ozeti' })
  @RequirePermission(Permissions.REPORT_SALES_READ)
  getSalesSummary(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getSalesSummaryReport(query);
  }

  @Get('sales/by-product')
  @ApiOperation({ summary: 'Urun/varyant bazli satis performansi' })
  @RequirePermission(Permissions.REPORT_SALES_READ)
  getSalesByProduct(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getSalesByProductReport(query);
  }

  @Get('sales/cancellations')
  @ApiOperation({ summary: 'Iptal edilen satis fisleri raporu' })
  @RequirePermission(Permissions.REPORT_SALES_READ)
  getSalesCancellations(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getSalesCancellationsReport(query);
  }

  @Get('suppliers/sales-performance')
  @ApiOperation({ summary: 'Tedarikci bazli satis performansi' })
  @RequirePermission(Permissions.REPORT_SALES_READ)
  getSupplierSalesPerformance(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getSupplierSalesPerformanceReport(query);
  }

  @Get('stores/performance')
  @ApiOperation({ summary: 'Magaza performans karsilastirmasi' })
  @RequirePermission(Permissions.REPORT_SALES_READ)
  getStorePerformance(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getStorePerformanceReport(query);
  }

  // ─── Finansal Raporlar ─────────────────────────────────────────────────────

  @Get('financial/profit-margin')
  @ApiOperation({ summary: 'Kar marji analizi' })
  @RequirePermission(Permissions.REPORT_FINANCIAL_READ)
  getProfitMargin(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getProfitMarginReport(query);
  }

  @Get('financial/revenue-trend')
  @ApiOperation({ summary: 'Gelir trendi: day/week/month gruplama' })
  @RequirePermission(Permissions.REPORT_FINANCIAL_READ)
  getRevenueTrend(@Query() query: RevenueTrendQueryDto) {
    return this.reportsService.getRevenueTrendReport(query);
  }

  @Get('financial/tax-summary')
  @ApiOperation({ summary: 'KDV / vergi ozeti' })
  @RequirePermission(Permissions.REPORT_FINANCIAL_READ)
  getTaxSummary(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getTaxSummaryReport(query);
  }

  @Get('financial/cogs-movement')
  @ApiOperation({ summary: 'Maliyet hareketi analizi (COGS)' })
  @RequirePermission(Permissions.REPORT_FINANCIAL_READ)
  getCOGSMovement(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getCOGSMovementReport(query);
  }

  @Get('compliance/vat-summary')
  @ApiOperation({ summary: 'Aylik KDV beyanname ozeti' })
  @RequirePermission(Permissions.REPORT_FINANCIAL_READ)
  getVatSummary(@Query() query: VatSummaryQueryDto) {
    return this.reportsService.getVatSummaryReport(query);
  }

  @Get('compliance/audit-trail')
  @ApiOperation({ summary: 'Satis denetim kaydi' })
  @RequirePermission(Permissions.REPORT_FINANCIAL_READ)
  getAuditTrail(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getAuditTrailReport(query);
  }

  @Get('compliance/discount-summary')
  @ApiOperation({ summary: 'Indirim ve iskonto ozeti' })
  @RequirePermission(Permissions.REPORT_FINANCIAL_READ)
  getDiscountSummary(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getDiscountSummaryReport(query);
  }

  // ─── Çalışan Raporları ─────────────────────────────────────────────────────

  @Get('employees/sales-performance')
  @ApiOperation({ summary: 'Calisan bazli satis performansi' })
  @RequirePermission(Permissions.REPORT_EMPLOYEE_READ)
  getEmployeeSalesPerformance(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getEmployeeSalesPerformanceReport(query);
  }

  @Get('employees/hourly-performance')
  @ApiOperation({ summary: 'Calisan saatlik performans' })
  @RequirePermission(Permissions.REPORT_EMPLOYEE_READ)
  getEmployeeHourlyPerformance(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getEmployeeHourlyPerformanceReport(query);
  }

  // ─── Zaman Raporları ───────────────────────────────────────────────────────

  @Get('time/hourly-sales')
  @ApiOperation({ summary: 'Saatlik satis analizi' })
  @RequirePermission(Permissions.REPORT_SALES_READ)
  getHourlySales(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getHourlySalesReport(query);
  }

  @Get('time/seasonality')
  @ApiOperation({ summary: 'Mevsimsel analiz' })
  @RequirePermission(Permissions.REPORT_SALES_READ)
  getSeasonality(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getSeasonalityReport(query);
  }

  @Get('time/week-comparison')
  @ApiOperation({ summary: 'Haftalik performans karsilastirmasi' })
  @RequirePermission(Permissions.REPORT_SALES_READ)
  getWeekComparison(@Query() query: WeekComparisonQueryDto) {
    return this.reportsService.getWeekComparisonReport(query);
  }

  // ─── Ürün Raporları ────────────────────────────────────────────────────────

  @Get('products/performance-ranking')
  @ApiOperation({ summary: 'Urun performans siralamasi' })
  @RequirePermission(Permissions.REPORT_SALES_READ)
  getProductPerformanceRanking(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getProductPerformanceRankingReport(query);
  }

  @Get('products/dead-stock')
  @ApiOperation({ summary: 'Hareketsiz / olu stok' })
  @RequirePermission(Permissions.REPORT_INVENTORY_READ)
  getDeadStock(@Query() query: DeadStockQueryDto) {
    return this.reportsService.getDeadStockReport(query);
  }

  @Get('products/abc-analysis')
  @ApiOperation({ summary: 'ABC (Pareto) analizi' })
  @RequirePermission(Permissions.REPORT_SALES_READ)
  getABCAnalysis(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getABCAnalysisReport(query);
  }

  @Get('products/:productId/variant-comparison')
  @ApiOperation({ summary: 'Varyant karsilastirmasi' })
  @RequirePermission(Permissions.REPORT_SALES_READ)
  getVariantComparison(
    @Param('productId') productId: string,
    @Query() query: ReportScopeQueryDto,
  ) {
    return this.reportsService.getVariantComparisonReport(productId, query);
  }

  // ─── Müşteri Raporları ─────────────────────────────────────────────────────

  @Get('customers/top')
  @ApiOperation({ summary: 'En iyi musteriler' })
  @RequirePermission(Permissions.REPORT_CUSTOMER_READ)
  getTopCustomers(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getTopCustomersReport(query);
  }

  @Get('customers/purchase-history')
  @ApiOperation({ summary: 'Musteri satin alma gecmisi' })
  @RequirePermission(Permissions.REPORT_CUSTOMER_READ)
  getCustomerPurchaseHistory(@Query() query: CustomerQueryDto) {
    return this.reportsService.getCustomerPurchaseHistoryReport(query);
  }

  @Get('customers/frequency')
  @ApiOperation({ summary: 'Musteri sikligi ve RFM segmentasyonu' })
  @RequirePermission(Permissions.REPORT_CUSTOMER_READ)
  getCustomerFrequency(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getCustomerFrequencyReport(query);
  }

  // ─── Fiyat Raporları ───────────────────────────────────────────────────────

  @Get('pricing/discount-effectiveness')
  @ApiOperation({ summary: 'Kampanya / indirim etkinligi' })
  @RequirePermission(Permissions.REPORT_FINANCIAL_READ)
  getDiscountEffectiveness(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getDiscountEffectivenessReport(query);
  }

  @Get('pricing/store-price-comparison')
  @ApiOperation({ summary: 'Magaza fiyat karsilastirmasi' })
  @RequirePermission(Permissions.REPORT_FINANCIAL_READ)
  getStorePriceComparison(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getStorePriceComparisonReport(query);
  }

  @Get('pricing/sales-by-discount-band')
  @ApiOperation({ summary: 'Indirim bandi analizi' })
  @RequirePermission(Permissions.REPORT_FINANCIAL_READ)
  getSalesByDiscountBand(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getSalesByDiscountBandReport(query);
  }

  // ─── Envanter Analizi ──────────────────────────────────────────────────────

  @Get('inventory/turnover')
  @ApiOperation({ summary: 'Stok devir hizi' })
  @RequirePermission(Permissions.REPORT_INVENTORY_READ)
  getStockTurnover(@Query() query: TurnoverQueryDto) {
    return this.reportsService.getStockTurnoverReport(query);
  }

  @Get('inventory/aging')
  @ApiOperation({ summary: 'Stok yaslanma raporu' })
  @RequirePermission(Permissions.REPORT_INVENTORY_READ)
  getStockAging(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getStockAgingReport(query);
  }

  @Get('inventory/reorder-analysis')
  @ApiOperation({ summary: 'Yeniden siparis noktasi analizi' })
  @RequirePermission(Permissions.REPORT_INVENTORY_READ)
  getReorderAnalysis(@Query() query: ReorderQueryDto) {
    return this.reportsService.getReorderAnalysisReport(query);
  }
}
