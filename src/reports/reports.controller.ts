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

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // ─── Mevcut 10 rapor ───

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
    summary: 'Satis ozeti (context storeId > storeIds > tenant tum storelar)',
  })
  getSalesSummary(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getSalesSummaryReport(query);
  }

  @Get('sales/by-product')
  @ApiOperation({
    summary: 'Urun/varyant bazli satis performansi (opsiyonel pagination)',
  })
  getSalesByProduct(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getSalesByProductReport(query);
  }

  @Get('stores/performance')
  @ApiOperation({
    summary: 'Magaza performans karsilastirmasi (context storeId varsa tek store)',
  })
  getStorePerformance(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getStorePerformanceReport(query);
  }

  @Get('stock/summary')
  @ApiOperation({
    summary: 'Stok ozeti (context storeId > storeIds > tenant tum storelar, opsiyonel pagination)',
  })
  getStockSummary(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getStockSummaryReport(query);
  }

  @Get('stock/low')
  @ApiOperation({
    summary: 'Dusuk stok raporu (threshold + scope kurallari + opsiyonel pagination)',
  })
  getLowStock(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getLowStockReport(query);
  }

  @Get('inventory/movements/summary')
  @ApiOperation({
    summary: 'Stok hareket ozeti (IN/OUT/TRANSFER/ADJUSTMENT) + opsiyonel detay liste',
  })
  getInventoryMovementsSummary(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getInventoryMovementsSummaryReport(query);
  }

  @Get('sales/cancellations')
  @ApiOperation({
    summary: 'Iptal edilen satis fisleri raporu (scope + filtre + opsiyonel pagination)',
  })
  getSalesCancellations(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getSalesCancellationsReport(query);
  }

  // ─── F-1: Kâr Marjı Analizi ───

  @Get('financial/profit-margin')
  @ApiOperation({
    summary: 'Kar marji analizi: varyant bazinda gelir, maliyet, brut kar, kar marji %',
  })
  getProfitMargin(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getProfitMarginReport(query);
  }

  // ─── F-2: Gelir Trendi ───

  @Get('financial/revenue-trend')
  @ApiOperation({
    summary: 'Gelir trendi: day/week/month gruplama, donem karsilastirma',
  })
  getRevenueTrend(@Query() query: RevenueTrendQueryDto) {
    return this.reportsService.getRevenueTrendReport(query);
  }

  // ─── F-3: KDV / Vergi Özeti ───

  @Get('financial/tax-summary')
  @ApiOperation({
    summary: 'KDV / vergi ozeti: vergi orani dilimine gore net satis, vergi, brut toplam',
  })
  getTaxSummary(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getTaxSummaryReport(query);
  }

  // ─── F-4: Maliyet Hareketi (COGS) ───

  @Get('financial/cogs-movement')
  @ApiOperation({
    summary: 'Maliyet hareketi analizi: IN hareketleri bazinda alis fiyat takibi',
  })
  getCOGSMovement(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getCOGSMovementReport(query);
  }

  // ─── TAX-1: Aylık KDV Beyanname Özeti ───

  @Get('compliance/vat-summary')
  @ApiOperation({
    summary: 'Aylik KDV beyanname ozeti: ay bazinda vergi orani dilimleri, iptal dusulmus net hesaplama',
  })
  getVatSummary(@Query() query: VatSummaryQueryDto) {
    return this.reportsService.getVatSummaryReport(query);
  }

  // ─── TAX-2: Satış Denetim Kaydı ───

  @Get('compliance/audit-trail')
  @ApiOperation({
    summary: 'Satis denetim kaydi: kronolojik tam satis kaydi, calisan bilgisi',
  })
  getAuditTrail(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getAuditTrailReport(query);
  }

  // ─── TAX-3: İndirim Özeti ───

  @Get('compliance/discount-summary')
  @ApiOperation({
    summary: 'Indirim ve iskonto ozeti: kampanya, calisan, magaza bazinda indirim toplamlari',
  })
  getDiscountSummary(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getDiscountSummaryReport(query);
  }

  // ─── E-1: Çalışan Satış Performansı ───

  @Get('employees/sales-performance')
  @ApiOperation({
    summary: 'Calisan bazli satis performansi: satis sayisi, gelir, iptal orani, siralama',
  })
  getEmployeeSalesPerformance(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getEmployeeSalesPerformanceReport(query);
  }

  // ─── E-2: Çalışan Saatlik Performans ───

  @Get('employees/hourly-performance')
  @ApiOperation({
    summary: 'Calisan saatlik performans: saat x gun isi haritasi',
  })
  getEmployeeHourlyPerformance(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getEmployeeHourlyPerformanceReport(query);
  }

  // ─── T-1: Saatlik Satış Analizi ───

  @Get('time/hourly-sales')
  @ApiOperation({
    summary: 'Saatlik satis analizi: 0-23 saat bazinda, isi haritasi, peak saatler',
  })
  getHourlySales(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getHourlySalesReport(query);
  }

  // ─── T-2: Mevsimsel Analiz ───

  @Get('time/seasonality')
  @ApiOperation({
    summary: 'Mevsimsel analiz: yil x ay bazinda satis ve gelir, aylik ortalama',
  })
  getSeasonality(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getSeasonalityReport(query);
  }

  // ─── T-3: Haftalık Karşılaştırma ───

  @Get('time/week-comparison')
  @ApiOperation({
    summary: 'Haftalik performans karsilastirmasi: son N hafta, degisim %',
  })
  getWeekComparison(@Query() query: WeekComparisonQueryDto) {
    return this.reportsService.getWeekComparisonReport(query);
  }

  // ─── P-1: Best/Worst Sellers ───

  @Get('products/performance-ranking')
  @ApiOperation({
    summary: 'Urun performans siralamasi: en cok/az satan, stok durumu capraz referans',
  })
  getProductPerformanceRanking(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getProductPerformanceRankingReport(query);
  }

  // ─── P-2: Ölü Stok ───

  @Get('products/dead-stock')
  @ApiOperation({
    summary: 'Hareketsiz / olu stok: belirli sure satilmamis urunler, tahmini stok degeri',
  })
  getDeadStock(@Query() query: DeadStockQueryDto) {
    return this.reportsService.getDeadStockReport(query);
  }

  // ─── P-3: ABC Analizi ───

  @Get('products/abc-analysis')
  @ApiOperation({
    summary: 'ABC (Pareto) analizi: gelir bazinda A/B/C siniflandirma',
  })
  getABCAnalysis(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getABCAnalysisReport(query);
  }

  // ─── P-4: Varyant Karşılaştırması ───

  @Get('products/:productId/variant-comparison')
  @ApiOperation({
    summary: 'Varyant karsilastirmasi: bir urunun tum varyantlari yan yana satis ve stok',
  })
  getVariantComparison(
    @Param('productId') productId: string,
    @Query() query: ReportScopeQueryDto,
  ) {
    return this.reportsService.getVariantComparisonReport(productId, query);
  }

  // ─── C-1: En İyi Müşteriler ───

  @Get('customers/top')
  @ApiOperation({
    summary: 'En iyi musteriler: telefon bazinda gruplama, toplam harcama, siparis sayisi',
  })
  getTopCustomers(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getTopCustomersReport(query);
  }

  // ─── C-2: Müşteri Satın Alma Geçmişi ───

  @Get('customers/purchase-history')
  @ApiOperation({
    summary: 'Musteri satin alma gecmisi: telefon/email ile belirli musteri satislari',
  })
  getCustomerPurchaseHistory(@Query() query: CustomerQueryDto) {
    return this.reportsService.getCustomerPurchaseHistoryReport(query);
  }

  // ─── C-3: Müşteri Sıklık / RFM ───

  @Get('customers/frequency')
  @ApiOperation({
    summary: 'Musteri sikligi ve RFM segmentasyonu: Champion, Loyal, AtRisk, Lost',
  })
  getCustomerFrequency(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getCustomerFrequencyReport(query);
  }

  // ─── PR-1: Kampanya Etkinliği ───

  @Get('pricing/discount-effectiveness')
  @ApiOperation({
    summary: 'Kampanya / indirim etkinligi: campaignCode bazinda satis, gelir, indirim analizi',
  })
  getDiscountEffectiveness(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getDiscountEffectivenessReport(query);
  }

  // ─── PR-2: Mağaza Fiyat Karşılaştırması ───

  @Get('pricing/store-price-comparison')
  @ApiOperation({
    summary: 'Magaza fiyat karsilastirmasi: varyant bazinda tum magazalardaki fiyatlar',
  })
  getStorePriceComparison(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getStorePriceComparisonReport(query);
  }

  // ─── PR-3: İndirim Bandı Analizi ───

  @Get('pricing/sales-by-discount-band')
  @ApiOperation({
    summary: 'Indirim bandi analizi: 0%, 1-10%, 11-20%, 21-30%, 31-50%, 50%+ bantlari',
  })
  getSalesByDiscountBand(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getSalesByDiscountBandReport(query);
  }

  // ─── I-1: Stok Devir Hızı ───

  @Get('inventory/turnover')
  @ApiOperation({
    summary: 'Stok devir hizi: varyant bazinda devir hizi, tedarik gunu, FAST/NORMAL/SLOW sinifi',
  })
  getStockTurnover(@Query() query: TurnoverQueryDto) {
    return this.reportsService.getStockTurnoverReport(query);
  }

  // ─── I-2: Stok Yaşlanma ───

  @Get('inventory/aging')
  @ApiOperation({
    summary: 'Stok yaslanma raporu: 0-30, 31-60, 61-90, 91-180, 180+ gun dilimleri',
  })
  getStockAging(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getStockAgingReport(query);
  }

  // ─── I-3: Yeniden Sipariş Noktası ───

  @Get('inventory/reorder-analysis')
  @ApiOperation({
    summary: 'Yeniden siparis noktasi analizi: hiz bazli siparis noktasi, CRITICAL/WARNING/NORMAL',
  })
  getReorderAnalysis(@Query() query: ReorderQueryDto) {
    return this.reportsService.getReorderAnalysisReport(query);
  }

  // ─── TR-1: Transfer Analizi ───

  @Get('transfers/analysis')
  @ApiOperation({
    summary: 'Magazalar arasi transfer analizi: transfer detaylari, magaza akis ozeti',
  })
  getTransferAnalysis(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getTransferAnalysisReport(query);
  }

  // ─── TR-2: Stok Denge Önerisi ───

  @Get('transfers/balance-recommendation')
  @ApiOperation({
    summary: 'Stok dengesi optimizasyonu: dengesizlik tespiti ve transfer onerisi',
  })
  getTransferBalanceRecommendation(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.getTransferBalanceRecommendationReport(query);
  }
}
