import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';

import { AppContextService } from '../common/context/app-context.service';
import { Sale, SaleStatus } from '../sales/sale.entity';
import { SaleLine } from '../sales/sale-line.entity';
import { Store } from 'src/store/store.entity';
import { Product } from 'src/product/product.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { StoreErrors } from 'src/common/errors/store.errors';
import { ReportsErrors } from 'src/common/errors/report.errors';
import { StoreVariantStock } from 'src/inventory/store-variant-stock.entity';
import { StoreProductPrice } from 'src/pricing/store-product-price.entity';
import { ReportScopeQueryDto } from './dto/report-scope-query.dto';
import { RevenueTrendQueryDto } from './dto/revenue-trend-query.dto';
import { DeadStockQueryDto } from './dto/dead-stock-query.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { VatSummaryQueryDto } from './dto/vat-summary-query.dto';
import { TurnoverQueryDto } from './dto/turnover-query.dto';
import { ReorderQueryDto } from './dto/reorder-query.dto';
import { WeekComparisonQueryDto } from './dto/week-comparison-query.dto';
import { InventoryMovement } from 'src/inventory/inventory-movement.entity';
import { User } from 'src/user/user.entity';
import { StockTransfer } from 'src/transfer/stock-transfer.entity';
import { StockTransferLine } from 'src/transfer/stock-transfer-line.entity';

type ResolvedScope = {
  mode: 'context-store' | 'query-stores' | 'tenant';
  storeIds: string[] | null;
};

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(StoreVariantStock)
    private readonly stockSummaryRepo: Repository<StoreVariantStock>,
    @InjectRepository(StoreProductPrice)
    private readonly priceRepo: Repository<StoreProductPrice>,
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(SaleLine)
    private readonly saleLineRepo: Repository<SaleLine>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(InventoryMovement)
    private readonly movementRepo: Repository<InventoryMovement>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(StockTransfer)
    private readonly transferRepo: Repository<StockTransfer>,
    @InjectRepository(StockTransferLine)
    private readonly transferLineRepo: Repository<StockTransferLine>,
    private readonly appContext: AppContextService,
  ) {}

  private getStockSummaryRepo(manager?: EntityManager): Repository<StoreVariantStock> {
    return manager ? manager.getRepository(StoreVariantStock) : this.stockSummaryRepo;
  }

  private getStoreRepo(manager?: EntityManager): Repository<Store> {
    return manager ? manager.getRepository(Store) : this.storeRepo;
  }

  private getSaleRepo(manager?: EntityManager): Repository<Sale> {
    return manager ? manager.getRepository(Sale) : this.saleRepo;
  }

  private getSaleLineRepo(manager?: EntityManager): Repository<SaleLine> {
    return manager ? manager.getRepository(SaleLine) : this.saleLineRepo;
  }

  private getVariantRepo(manager?: EntityManager): Repository<ProductVariant> {
    return manager ? manager.getRepository(ProductVariant) : this.variantRepo;
  }

  private getMovementRepo(manager?: EntityManager): Repository<InventoryMovement> {
    return manager ? manager.getRepository(InventoryMovement) : this.movementRepo;
  }

  private async ensureStoreOfTenant(storeId: string, manager?: EntityManager): Promise<Store> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const store = await this.getStoreRepo(manager).findOne({
      where: { id: storeId, tenant: { id: tenantId } },
    });

    if (!store) {
      throw new NotFoundException(StoreErrors.STORE_NOT_FOUND);
    }

    return store;
  }

  private normalizeStoreIds(storeIds?: string[]): string[] {
    return Array.from(
      new Set(
        (storeIds ?? [])
          .map((storeId) => storeId?.trim())
          .filter((storeId): storeId is string => Boolean(storeId)),
      ),
    );
  }

  private async resolveScopedStoreIds(
    storeIds: string[] | undefined,
    manager?: EntityManager,
  ): Promise<ResolvedScope> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const contextStoreId = this.appContext.getStoreId();

    if (contextStoreId) {
      await this.ensureStoreOfTenant(contextStoreId, manager);
      return { mode: 'context-store', storeIds: [contextStoreId] };
    }

    const normalizedStoreIds = this.normalizeStoreIds(storeIds);
    if (normalizedStoreIds.length === 0) {
      return { mode: 'tenant', storeIds: null };
    }

    const stores = await this.getStoreRepo(manager).find({
      where: {
        id: In(normalizedStoreIds),
        tenant: { id: tenantId },
      },
      select: { id: true },
    });

    if (stores.length !== normalizedStoreIds.length) {
      throw new NotFoundException(StoreErrors.STORE_NOT_IN_TENANT);
    }

    return { mode: 'query-stores', storeIds: normalizedStoreIds };
  }

  private parseIsoDate(dateStr?: string, endOfDay = false): Date | undefined {
    if (!dateStr) {
      return undefined;
    }

    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) {
      throw new BadRequestException(ReportsErrors.INVALID_DATE_RANGE);
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      if (endOfDay) {
        parsed.setUTCHours(23, 59, 59, 999);
      } else {
        parsed.setUTCHours(0, 0, 0, 0);
      }
    }

    return parsed;
  }

  private resolveDateRange(startDate?: string, endDate?: string): { start?: Date; end?: Date } {
    const start = this.parseIsoDate(startDate, false);
    const end = this.parseIsoDate(endDate, true);

    if (start && end && end < start) {
      throw new BadRequestException(ReportsErrors.INVALID_DATE_RANGE);
    }

    return { start, end };
  }

  private applyDateFilter(
    qb: SelectQueryBuilder<any>,
    alias: string,
    field: string,
    start?: Date,
    end?: Date,
  ): void {
    if (start) {
      qb.andWhere(`${alias}."${field}" >= :startDate`, { startDate: start });
    }
    if (end) {
      qb.andWhere(`${alias}."${field}" <= :endDate`, { endDate: end });
    }
  }

  private resolvePagination(page?: number, limit?: number): {
    hasPagination: boolean;
    page: number;
    limit: number;
    skip: number;
  } {
    const hasPagination = page !== undefined || limit !== undefined;
    if (!hasPagination) {
      return { hasPagination, page: 1, limit: 10, skip: 0 };
    }

    const safePage = Math.max(1, Math.trunc(page ?? 1));
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit ?? 10)));
    const skip = (safePage - 1) * safeLimit;

    return { hasPagination, page: safePage, limit: safeLimit, skip };
  }

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) {
      return 0;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private parseMeta(meta: unknown): Record<string, any> | null {
    if (meta == null) {
      return null;
    }

    if (typeof meta === 'object') {
      return meta as Record<string, any>;
    }

    if (typeof meta === 'string') {
      try {
        return JSON.parse(meta) as Record<string, any>;
      } catch {
        return null;
      }
    }

    return null;
  }

  private getStartOfUtcDay(date: Date): Date {
    const value = new Date(date);
    value.setUTCHours(0, 0, 0, 0);
    return value;
  }

  private getEndOfUtcDay(date: Date): Date {
    const value = new Date(date);
    value.setUTCHours(23, 59, 59, 999);
    return value;
  }

  private addUtcDays(date: Date, days: number): Date {
    const value = new Date(date);
    value.setUTCDate(value.getUTCDate() + days);
    return value;
  }

  private formatUtcDay(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private normalizeDayKey(value: unknown): string | null {
    if (value == null) {
      return null;
    }

    if (value instanceof Date) {
      return this.formatUtcDay(this.getStartOfUtcDay(value));
    }

    const raw = String(value).trim();
    if (!raw) {
      return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw;
    }

    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) {
      return this.formatUtcDay(this.getStartOfUtcDay(parsed));
    }

    return raw.slice(0, 10);
  }

  private buildUtcDayList(start: Date, end: Date): string[] {
    const days: string[] = [];
    let cursor = this.getStartOfUtcDay(start);
    const limit = this.getStartOfUtcDay(end);

    while (cursor <= limit) {
      days.push(this.formatUtcDay(cursor));
      cursor = this.addUtcDays(cursor, 1);
    }

    return days;
  }

  private resolveDailyDefaultDateRange(
    startDate?: string,
    endDate?: string,
  ): { start: Date; end: Date; isDefaultDaily: boolean } {
    const now = new Date();
    const todayStart = this.getStartOfUtcDay(now);
    const todayEnd = this.getEndOfUtcDay(now);

    if (!startDate && !endDate) {
      return {
        start: todayStart,
        end: todayEnd,
        isDefaultDaily: true,
      };
    }

    const { start, end } = this.resolveDateRange(startDate, endDate);
    const resolvedStart = start ?? todayStart;
    const resolvedEnd = end ?? todayEnd;

    if (resolvedEnd < resolvedStart) {
      throw new BadRequestException(ReportsErrors.INVALID_DATE_RANGE);
    }

    return {
      start: resolvedStart,
      end: resolvedEnd,
      isDefaultDaily: false,
    };
  }

  private calculateChangePercent(currentValue: number, previousValue: number): number | null {
    if (previousValue === 0) {
      if (currentValue === 0) {
        return 0;
      }
      return null;
    }

    const rawPercent = ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
    return Math.round(rawPercent);
  }

  // ---- Yeni report endpointleri (scope kuralli) ----

  async getTotalStockQuantityReport(
    query: ReportScopeQueryDto,
    manager?: EntityManager,
  ) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const search = query.search?.trim();
    const range = this.resolveDailyDefaultDateRange(query.startDate, query.endDate);
    const todayEnd = this.getEndOfUtcDay(new Date());
    const todayStart = this.getStartOfUtcDay(todayEnd);

    const stockBaseQb = this.getStockSummaryRepo(manager)
      .createQueryBuilder('s')
      .innerJoin('s.productVariant', 'variant')
      .innerJoin('variant.product', 'product')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s."isActiveStore" = true');

    if (scope.storeIds?.length) {
      stockBaseQb.andWhere('s.storeId IN (:...storeIds)', {
        storeIds: scope.storeIds,
      });
    }

    if (search) {
      stockBaseQb.andWhere(
        '(product.name ILIKE :search OR variant.name ILIKE :search OR variant.code ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const totalRow = await stockBaseQb
      .clone()
      .select('COALESCE(SUM(s.quantity), 0)', 'totalQuantity')
      .getRawOne<{ totalQuantity: string }>();

    const todayTotalQuantity = this.toNumber(totalRow?.totalQuantity);

    const movementDailyQb = this.getMovementRepo(manager)
      .createQueryBuilder('m')
      .innerJoin('m.productVariant', 'variant')
      .innerJoin('variant.product', 'product')
      .where('m.tenantId = :tenantId', { tenantId })
      .andWhere('m."createdAt" <= :todayEnd', { todayEnd });

    if (scope.storeIds?.length) {
      movementDailyQb.andWhere('m.storeId IN (:...storeIds)', {
        storeIds: scope.storeIds,
      });
    }

    if (search) {
      movementDailyQb.andWhere(
        '(product.name ILIKE :search OR variant.name ILIKE :search OR variant.code ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const movementDailyRows = await movementDailyQb
      .clone()
      .select('DATE(m."createdAt")', 'day')
      .addSelect('COALESCE(SUM(m.quantity), 0)', 'quantity')
      .groupBy('DATE(m."createdAt")')
      .getRawMany<{ day: string; quantity: string }>();

    const movementByDay = new Map<string, number>();
    for (const row of movementDailyRows) {
      const dayKey = this.normalizeDayKey(row.day);
      if (!dayKey) {
        continue;
      }
      movementByDay.set(dayKey, this.toNumber(row.quantity));
    }

    const effectiveEndForDaily = range.end > todayEnd ? todayEnd : range.end;
    const dailyKeys =
      effectiveEndForDaily >= range.start
        ? this.buildUtcDayList(range.start, effectiveEndForDaily)
        : [];

    const futureMovementAfterDay = new Map<string, number>();
    if (dailyKeys.length > 0) {
      const earliestDayDate = this.getStartOfUtcDay(
        new Date(`${dailyKeys[0]}T00:00:00.000Z`),
      );
      let cursor = this.getStartOfUtcDay(todayStart);
      let runningFuture = 0;

      while (cursor >= earliestDayDate) {
        const dayKey = this.formatUtcDay(cursor);
        futureMovementAfterDay.set(dayKey, runningFuture);
        runningFuture += movementByDay.get(dayKey) ?? 0;
        cursor = this.addUtcDays(cursor, -1);
      }
    }

    const daily = dailyKeys.map((day) => ({
      date: day,
      totalQuantity:
        todayTotalQuantity - (futureMovementAfterDay.get(day) ?? 0),
    }));

    let comparison:
      | {
          baseDate: string;
          baseTotalQuantity: number;
          todayTotalQuantity: number;
          changePercent: number | null;
          trend: 'INCREASE' | 'DECREASE' | 'SAME' | 'N/A';
        }
      | null = null;

    if (query.compareDate) {
      const comparePointRaw = this.parseIsoDate(query.compareDate, true);
      const comparePoint =
        comparePointRaw && comparePointRaw > todayEnd ? todayEnd : comparePointRaw;

      const deltaAfterCompareQb = this.getMovementRepo(manager)
        .createQueryBuilder('m')
        .innerJoin('m.productVariant', 'variant')
        .innerJoin('variant.product', 'product')
        .where('m.tenantId = :tenantId', { tenantId })
        .andWhere('m."createdAt" > :comparePoint', {
          comparePoint: comparePoint ?? todayEnd,
        })
        .andWhere('m."createdAt" <= :todayEnd', { todayEnd });

      if (scope.storeIds?.length) {
        deltaAfterCompareQb.andWhere('m.storeId IN (:...storeIds)', {
          storeIds: scope.storeIds,
        });
      }

      if (search) {
        deltaAfterCompareQb.andWhere(
          '(product.name ILIKE :search OR variant.name ILIKE :search OR variant.code ILIKE :search)',
          { search: `%${search}%` },
        );
      }

      const deltaAfterCompareRow = await deltaAfterCompareQb
        .select('COALESCE(SUM(m.quantity), 0)', 'delta')
        .getRawOne<{ delta: string }>();

      const deltaAfterCompare = this.toNumber(deltaAfterCompareRow?.delta);
      const baseTotalQuantity = todayTotalQuantity - deltaAfterCompare;
      const changePercent = this.calculateChangePercent(
        todayTotalQuantity,
        baseTotalQuantity,
      );
      const trend =
        changePercent === null
          ? 'N/A'
          : changePercent > 0
            ? 'INCREASE'
            : changePercent < 0
              ? 'DECREASE'
              : 'SAME';

      comparison = {
        baseDate: this.formatUtcDay(
          this.getStartOfUtcDay(comparePoint ?? todayStart),
        ),
        baseTotalQuantity,
        todayTotalQuantity,
        changePercent,
        trend,
      };
    }

    return {
      scope: {
        mode: scope.mode,
        storeIds: scope.storeIds,
      },
      period: {
        startDate: this.formatUtcDay(this.getStartOfUtcDay(range.start)),
        endDate: this.formatUtcDay(this.getStartOfUtcDay(range.end)),
        defaultDaily: range.isDefaultDaily,
      },
      filters: {
        search: search ?? null,
        compareDate: query.compareDate ?? null,
      },
      totals: {
        todayTotalQuantity,
      },
      daily,
      comparison,
    };
  }

  private async getTotalOrdersByStatusReport(
    status: SaleStatus.CONFIRMED | SaleStatus.CANCELLED,
    dateField: 'createdAt' | 'cancelledAt',
    query: ReportScopeQueryDto,
    manager?: EntityManager,
  ) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const range = this.resolveDailyDefaultDateRange(query.startDate, query.endDate);
    const todayStart = this.getStartOfUtcDay(new Date());
    const todayEnd = this.getEndOfUtcDay(new Date());

    if (
      query.minLinePrice !== undefined &&
      query.maxLinePrice !== undefined &&
      query.minLinePrice > query.maxLinePrice
    ) {
      throw new BadRequestException(
        'minLinePrice, maxLinePrice degerinden buyuk olamaz.',
      );
    }

    const buildFilteredQb = () => {
      const qb = this.getSaleRepo(manager)
        .createQueryBuilder('sale')
        .where('sale.tenantId = :tenantId', { tenantId })
        .andWhere('sale.status = :status', { status });

      if (status === SaleStatus.CANCELLED) {
        qb.andWhere('sale."cancelledAt" IS NOT NULL');
      }

      if (scope.storeIds?.length) {
        qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
      }

      if (query.name?.trim()) {
        qb.andWhere('sale.name ILIKE :name', { name: `%${query.name.trim()}%` });
      }

      if (query.surname?.trim()) {
        qb.andWhere('sale.surname ILIKE :surname', {
          surname: `%${query.surname.trim()}%`,
        });
      }

      if (query.receiptNo?.trim()) {
        qb.andWhere('sale.receiptNo ILIKE :receiptNo', {
          receiptNo: `%${query.receiptNo.trim()}%`,
        });
      }

      if (query.minLinePrice !== undefined) {
        qb.andWhere('sale."lineTotal" >= :minLinePrice', {
          minLinePrice: query.minLinePrice,
        });
      }

      if (query.maxLinePrice !== undefined) {
        qb.andWhere('sale."lineTotal" <= :maxLinePrice', {
          maxLinePrice: query.maxLinePrice,
        });
      }

      return qb;
    };

    const summaryQb = buildFilteredQb();
    this.applyDateFilter(summaryQb, 'sale', dateField, range.start, range.end);

    const summaryRow = await summaryQb
      .clone()
      .select('COUNT(sale.id)', 'orderCount')
      .addSelect('COALESCE(SUM(sale."unitPrice"), 0)', 'totalUnitPrice')
      .addSelect('COALESCE(SUM(sale."lineTotal"), 0)', 'totalLineTotal')
      .getRawOne<{
        orderCount: string;
        totalUnitPrice: string;
        totalLineTotal: string;
      }>();

    const dailyQb = buildFilteredQb();
    this.applyDateFilter(dailyQb, 'sale', dateField, range.start, range.end);

    const dailyRows = await dailyQb
      .clone()
      .select(`DATE(sale."${dateField}")`, 'day')
      .addSelect('COUNT(sale.id)', 'orderCount')
      .addSelect('COALESCE(SUM(sale."lineTotal"), 0)', 'totalLineTotal')
      .groupBy(`DATE(sale."${dateField}")`)
      .orderBy('day', 'ASC')
      .getRawMany<{
        day: string;
        orderCount: string;
        totalLineTotal: string;
      }>();

    const dailyMap = new Map<string, { orderCount: number; totalLineTotal: number }>();
    for (const row of dailyRows) {
      const dayKey = this.normalizeDayKey(row.day);
      if (!dayKey) {
        continue;
      }
      dailyMap.set(dayKey, {
        orderCount: this.toNumber(row.orderCount),
        totalLineTotal: this.toNumber(row.totalLineTotal),
      });
    }

    const dailyKeys =
      range.end >= range.start ? this.buildUtcDayList(range.start, range.end) : [];
    const daily = dailyKeys.map((day) => ({
      date: day,
      orderCount: dailyMap.get(day)?.orderCount ?? 0,
      totalLineTotal: dailyMap.get(day)?.totalLineTotal ?? 0,
    }));

    let comparison:
      | {
          baseDate: string;
          baseOrderCount: number;
          todayOrderCount: number;
          changePercent: number | null;
          trend: 'INCREASE' | 'DECREASE' | 'SAME' | 'N/A';
        }
      | null = null;

    if (query.compareDate) {
      const compareDate = this.parseIsoDate(query.compareDate, false);
      const compareStart = this.getStartOfUtcDay(compareDate ?? todayStart);
      const compareEnd = this.getEndOfUtcDay(compareDate ?? todayStart);

      const compareQb = buildFilteredQb();
      this.applyDateFilter(compareQb, 'sale', dateField, compareStart, compareEnd);
      const compareRow = await compareQb
        .clone()
        .select('COUNT(sale.id)', 'orderCount')
        .getRawOne<{ orderCount: string }>();

      const todayQb = buildFilteredQb();
      this.applyDateFilter(todayQb, 'sale', dateField, todayStart, todayEnd);
      const todayRow = await todayQb
        .clone()
        .select('COUNT(sale.id)', 'orderCount')
        .getRawOne<{ orderCount: string }>();

      const baseOrderCount = this.toNumber(compareRow?.orderCount);
      const todayOrderCount = this.toNumber(todayRow?.orderCount);
      const changePercent = this.calculateChangePercent(
        todayOrderCount,
        baseOrderCount,
      );
      const trend =
        changePercent === null
          ? 'N/A'
          : changePercent > 0
            ? 'INCREASE'
            : changePercent < 0
              ? 'DECREASE'
              : 'SAME';

      comparison = {
        baseDate: this.formatUtcDay(compareStart),
        baseOrderCount,
        todayOrderCount,
        changePercent,
        trend,
      };
    }

    return {
      scope: {
        mode: scope.mode,
        storeIds: scope.storeIds,
      },
      period: {
        startDate: this.formatUtcDay(this.getStartOfUtcDay(range.start)),
        endDate: this.formatUtcDay(this.getStartOfUtcDay(range.end)),
        defaultDaily: range.isDefaultDaily,
      },
      filters: {
        receiptNo: query.receiptNo ?? null,
        name: query.name ?? null,
        surname: query.surname ?? null,
        minLinePrice: query.minLinePrice ?? null,
        maxLinePrice: query.maxLinePrice ?? null,
        compareDate: query.compareDate ?? null,
      },
      totals: {
        orderCount: this.toNumber(summaryRow?.orderCount),
        totalUnitPrice: this.toNumber(summaryRow?.totalUnitPrice),
        totalLineTotal: this.toNumber(summaryRow?.totalLineTotal),
      },
      daily,
      comparison,
    };
  }

  async getTotalConfirmedOrdersReport(
    query: ReportScopeQueryDto,
    manager?: EntityManager,
  ) {
    return this.getTotalOrdersByStatusReport(
      SaleStatus.CONFIRMED,
      'createdAt',
      query,
      manager,
    );
  }

  async getTotalReturnedOrdersReport(
    query: ReportScopeQueryDto,
    manager?: EntityManager,
  ) {
    return this.getTotalOrdersByStatusReport(
      SaleStatus.CANCELLED,
      'cancelledAt',
      query,
      manager,
    );
  }

  async getSalesSummaryReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);

    const qb = this.getSaleRepo(manager)
      .createQueryBuilder('sale')
      .select('COUNT(sale.id)', 'saleCount')
      .addSelect(
        'COALESCE(SUM(CASE WHEN sale.status = :confirmedStatus THEN 1 ELSE 0 END), 0)',
        'confirmedCount',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN sale.status = :cancelledStatus THEN 1 ELSE 0 END), 0)',
        'cancelledCount',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN sale.status = :confirmedStatus THEN sale."unitPrice" ELSE 0 END), 0)',
        'totalUnitPrice',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN sale.status = :confirmedStatus THEN sale."lineTotal" ELSE 0 END), 0)',
        'totalLineTotal',
      )
      .where('sale.tenantId = :tenantId', { tenantId })
      .setParameters({
        confirmedStatus: SaleStatus.CONFIRMED,
        cancelledStatus: SaleStatus.CANCELLED,
      });

    if (scope.storeIds?.length) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(qb, 'sale', 'createdAt', start, end);

    const row = await qb.getRawOne<{
      saleCount: string;
      confirmedCount: string;
      cancelledCount: string;
      totalUnitPrice: string;
      totalLineTotal: string;
    }>();

    const saleCount = this.toNumber(row?.saleCount);
    const confirmedCount = this.toNumber(row?.confirmedCount);
    const cancelledCount = this.toNumber(row?.cancelledCount);
    const totalUnitPrice = this.toNumber(row?.totalUnitPrice);
    const totalLineTotal = this.toNumber(row?.totalLineTotal);

    return {
      scope: {
        mode: scope.mode,
        storeIds: scope.storeIds,
      },
      period: {
        startDate: query.startDate ?? null,
        endDate: query.endDate ?? null,
      },
      totals: {
        saleCount,
        confirmedCount,
        cancelledCount,
        totalUnitPrice,
        totalLineTotal,
        averageBasket: confirmedCount > 0 ? totalLineTotal / confirmedCount : 0,
        cancelRate: saleCount > 0 ? (cancelledCount / saleCount) * 100 : 0,
      },
    };
  }

  async getSalesByProductReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);
    const pagination = this.resolvePagination(query.page, query.limit);
    const search = query.search?.trim();

    const netExpr = 'COALESCE(line."unitPrice", 0) * COALESCE(line."quantity", 0)';
    const discountExpr = `CASE
      WHEN line."discountAmount" IS NOT NULL THEN line."discountAmount"
      WHEN line."discountPercent" IS NOT NULL THEN ((${netExpr}) * line."discountPercent" / 100)
      ELSE 0
    END`;
    const taxableExpr = `((${netExpr}) - (${discountExpr}))`;
    const taxExpr = `CASE
      WHEN line."taxAmount" IS NOT NULL THEN line."taxAmount"
      WHEN line."taxPercent" IS NOT NULL THEN ((${taxableExpr}) * line."taxPercent" / 100)
      ELSE 0
    END`;
    const lineTotalExpr = `COALESCE(line."lineTotal", ((${taxableExpr}) + (${taxExpr})))`;

    const qb = this.getSaleLineRepo(manager)
      .createQueryBuilder('line')
      .innerJoin('line.sale', 'sale')
      .innerJoin('line.productVariant', 'variant')
      .innerJoin('variant.product', 'product')
      .select('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('variant.id', 'productVariantId')
      .addSelect('variant.name', 'variantName')
      .addSelect('variant.code', 'variantCode')
      .addSelect('COALESCE(SUM(line.quantity), 0)', 'quantity')
      .addSelect(`COALESCE(SUM(${netExpr}), 0)`, 'totalUnitPrice')
      .addSelect(`COALESCE(SUM(${discountExpr}), 0)`, 'totalDiscount')
      .addSelect(`COALESCE(SUM(${taxExpr}), 0)`, 'totalTax')
      .addSelect(`COALESCE(SUM(${lineTotalExpr}), 0)`, 'lineTotal')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :confirmedStatus', { confirmedStatus: SaleStatus.CONFIRMED })
      .groupBy('product.id')
      .addGroupBy('product.name')
      .addGroupBy('variant.id')
      .addGroupBy('variant.name')
      .addGroupBy('variant.code')
      .orderBy('"lineTotal"', 'DESC');

    if (scope.storeIds?.length) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    if (search) {
      qb.andWhere(
        '(product.name ILIKE :search OR variant.name ILIKE :search OR variant.code ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    this.applyDateFilter(qb, 'sale', 'createdAt', start, end);

    const rows = await qb.getRawMany<{
      productId: string;
      productName: string;
      productVariantId: string;
      variantName: string;
      variantCode: string;
      quantity: string;
      totalUnitPrice: string;
      totalDiscount: string;
      totalTax: string;
      lineTotal: string;
    }>();

    const mapped = rows.map((row) => {
      const quantity = this.toNumber(row.quantity);
      const totalUnitPrice = this.toNumber(row.totalUnitPrice);
      const totalDiscount = this.toNumber(row.totalDiscount);
      const totalTax = this.toNumber(row.totalTax);
      const lineTotal = this.toNumber(row.lineTotal);

      return {
        productId: row.productId,
        productName: row.productName,
        productVariantId: row.productVariantId,
        variantName: row.variantName,
        variantCode: row.variantCode,
        quantity,
        totalUnitPrice,
        totalDiscount,
        totalTax,
        lineTotal,
        avgUnitPrice: quantity > 0 ? totalUnitPrice / quantity : 0,
      };
    });

    const totals = {
      totalQuantity: mapped.reduce((sum, item) => sum + item.quantity, 0),
      totalUnitPrice: mapped.reduce((sum, item) => sum + item.totalUnitPrice, 0),
      totalDiscount: mapped.reduce((sum, item) => sum + item.totalDiscount, 0),
      totalTax: mapped.reduce((sum, item) => sum + item.totalTax, 0),
      totalLineTotal: mapped.reduce((sum, item) => sum + item.lineTotal, 0),
    };

    if (!pagination.hasPagination) {
      return {
        scope: {
          mode: scope.mode,
          storeIds: scope.storeIds,
        },
        period: {
          startDate: query.startDate ?? null,
          endDate: query.endDate ?? null,
        },
        data: mapped,
        totals,
      };
    }

    const total = mapped.length;
    const data = mapped.slice(pagination.skip, pagination.skip + pagination.limit);

    return {
      scope: {
        mode: scope.mode,
        storeIds: scope.storeIds,
      },
      period: {
        startDate: query.startDate ?? null,
        endDate: query.endDate ?? null,
      },
      data,
      totals,
      meta: {
        total,
        limit: pagination.limit,
        page: pagination.page,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  async getStorePerformanceReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);
    const pagination = this.resolvePagination(query.page, query.limit);
    const search = query.search?.trim();

    const qb = this.getSaleRepo(manager)
      .createQueryBuilder('sale')
      .innerJoin('sale.store', 'store')
      .select('store.id', 'storeId')
      .addSelect('store.name', 'storeName')
      .addSelect('store.code', 'storeCode')
      .addSelect('COUNT(sale.id)', 'saleCount')
      .addSelect(
        'COALESCE(SUM(CASE WHEN sale.status = :confirmedStatus THEN 1 ELSE 0 END), 0)',
        'confirmedCount',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN sale.status = :cancelledStatus THEN 1 ELSE 0 END), 0)',
        'cancelledCount',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN sale.status = :confirmedStatus THEN sale."unitPrice" ELSE 0 END), 0)',
        'totalUnitPrice',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN sale.status = :confirmedStatus THEN sale."lineTotal" ELSE 0 END), 0)',
        'totalLineTotal',
      )
      .where('sale.tenantId = :tenantId', { tenantId })
      .setParameters({
        confirmedStatus: SaleStatus.CONFIRMED,
        cancelledStatus: SaleStatus.CANCELLED,
      })
      .groupBy('store.id')
      .addGroupBy('store.name')
      .addGroupBy('store.code')
      .orderBy('"totalLineTotal"', 'DESC');

    if (scope.storeIds?.length) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    if (search) {
      qb.andWhere('store.name ILIKE :search', { search: `%${search}%` });
    }

    this.applyDateFilter(qb, 'sale', 'createdAt', start, end);

    const rows = await qb.getRawMany<{
      storeId: string;
      storeName: string;
      storeCode: string | null;
      saleCount: string;
      confirmedCount: string;
      cancelledCount: string;
      totalUnitPrice: string;
      totalLineTotal: string;
    }>();

    const mapped = rows.map((row) => {
      const saleCount = this.toNumber(row.saleCount);
      const confirmedCount = this.toNumber(row.confirmedCount);
      const cancelledCount = this.toNumber(row.cancelledCount);
      const totalUnitPrice = this.toNumber(row.totalUnitPrice);
      const totalLineTotal = this.toNumber(row.totalLineTotal);

      return {
        storeId: row.storeId,
        storeName: row.storeName,
        storeCode: row.storeCode,
        saleCount,
        confirmedCount,
        cancelledCount,
        totalUnitPrice,
        totalLineTotal,
        averageBasket: confirmedCount > 0 ? totalLineTotal / confirmedCount : 0,
        cancelRate: saleCount > 0 ? (cancelledCount / saleCount) * 100 : 0,
      };
    });

    const totals = {
      totalSales: mapped.reduce((sum, item) => sum + item.saleCount, 0),
      totalConfirmed: mapped.reduce((sum, item) => sum + item.confirmedCount, 0),
      totalCancelled: mapped.reduce((sum, item) => sum + item.cancelledCount, 0),
      totalUnitPrice: mapped.reduce((sum, item) => sum + item.totalUnitPrice, 0),
      totalLineTotal: mapped.reduce((sum, item) => sum + item.totalLineTotal, 0),
    };

    if (!pagination.hasPagination) {
      return {
        scope: {
          mode: scope.mode,
          storeIds: scope.storeIds,
        },
        period: {
          startDate: query.startDate ?? null,
          endDate: query.endDate ?? null,
        },
        data: mapped,
        totals,
      };
    }

    const total = mapped.length;
    const data = mapped.slice(pagination.skip, pagination.skip + pagination.limit);

    return {
      scope: {
        mode: scope.mode,
        storeIds: scope.storeIds,
      },
      period: {
        startDate: query.startDate ?? null,
        endDate: query.endDate ?? null,
      },
      data,
      totals,
      meta: {
        total,
        limit: pagination.limit,
        page: pagination.page,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  async getStockSummaryReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const pagination = this.resolvePagination(query.page, query.limit);
    const search = query.search?.trim();

    const qb = this.getStockSummaryRepo(manager)
      .createQueryBuilder('s')
      .innerJoin('s.productVariant', 'variant')
      .innerJoin('variant.product', 'product')
      .innerJoin('s.store', 'store')
      .select('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('variant.id', 'productVariantId')
      .addSelect('variant.name', 'variantName')
      .addSelect('variant.code', 'variantCode')
      .addSelect('store.id', 'storeId')
      .addSelect('store.name', 'storeName')
      .addSelect('s.quantity', 'quantity')
      .addSelect('s."isActive"', 'isActive')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s."isActiveStore" = true')
      .orderBy('product.name', 'ASC')
      .addOrderBy('variant.name', 'ASC')
      .addOrderBy('store.name', 'ASC');

    if (scope.storeIds?.length) {
      qb.andWhere('s.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    if (search) {
      qb.andWhere(
        '(product.name ILIKE :search OR variant.name ILIKE :search OR variant.code ILIKE :search OR store.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getRawMany<{
      productId: string;
      productName: string;
      productVariantId: string;
      variantName: string;
      variantCode: string;
      storeId: string;
      storeName: string;
      quantity: string;
      isActive: boolean | string;
    }>();

    const byProduct = new Map<
      string,
      {
        productId: string;
        productName: string;
        totalQuantity: number;
        variants: Array<{
          productVariantId: string;
          variantName: string;
          variantCode: string;
          totalQuantity: number;
          stores: {
            storeId: string;
            storeName: string;
            quantity: number;
            isActive: boolean;
          }[];
        }>;
      }
    >();

    for (const row of rows) {
      const quantity = this.toNumber(row.quantity);

      if (!byProduct.has(row.productId)) {
        byProduct.set(row.productId, {
          productId: row.productId,
          productName: row.productName,
          totalQuantity: 0,
          variants: [],
        });
      }

      const productItem = byProduct.get(row.productId)!;
      productItem.totalQuantity += quantity;

      let variantItem = productItem.variants.find(
        (variant) => variant.productVariantId === row.productVariantId,
      );

      if (!variantItem) {
        variantItem = {
          productVariantId: row.productVariantId,
          variantName: row.variantName,
          variantCode: row.variantCode,
          totalQuantity: 0,
          stores: [],
        };
        productItem.variants.push(variantItem);
      }

      variantItem.totalQuantity += quantity;
      variantItem.stores.push({
        storeId: row.storeId,
        storeName: row.storeName,
        quantity,
        isActive: row.isActive === true || row.isActive === 'true',
      });
    }

    const allItems = Array.from(byProduct.values());
    const totalQuantity = allItems.reduce((sum, item) => sum + item.totalQuantity, 0);

    if (!pagination.hasPagination) {
      return {
        scope: {
          mode: scope.mode,
          storeIds: scope.storeIds,
        },
        data: allItems,
        totalQuantity,
      };
    }

    const total = allItems.length;
    const data = allItems.slice(pagination.skip, pagination.skip + pagination.limit);

    return {
      scope: {
        mode: scope.mode,
        storeIds: scope.storeIds,
      },
      data,
      totalQuantity,
      meta: {
        total,
        limit: pagination.limit,
        page: pagination.page,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  async getLowStockReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const pagination = this.resolvePagination(query.page, query.limit);
    const threshold = query.threshold ?? 10;
    const search = query.search?.trim();

    if (threshold < 0) {
      throw new BadRequestException('threshold 0 veya daha buyuk olmalidir.');
    }

    const qb = this.getStockSummaryRepo(manager)
      .createQueryBuilder('s')
      .innerJoin('s.store', 'store')
      .innerJoin('s.productVariant', 'variant')
      .innerJoin('variant.product', 'product')
      .select('store.id', 'storeId')
      .addSelect('store.name', 'storeName')
      .addSelect('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('variant.id', 'productVariantId')
      .addSelect('variant.name', 'variantName')
      .addSelect('variant.code', 'variantCode')
      .addSelect('s.quantity', 'quantity')
      .addSelect('s."isActive"', 'isActive')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s."isActiveStore" = true')
      .andWhere('s.quantity <= :threshold', { threshold })
      .orderBy('s.quantity', 'ASC');

    if (scope.storeIds?.length) {
      qb.andWhere('s.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    if (search) {
      qb.andWhere(
        '(product.name ILIKE :search OR variant.name ILIKE :search OR variant.code ILIKE :search OR store.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const total = await qb.getCount();
    if (pagination.hasPagination) {
      qb.offset(pagination.skip).limit(pagination.limit);
    }

    const rows = await qb.getRawMany<{
      storeId: string;
      storeName: string;
      productId: string;
      productName: string;
      productVariantId: string;
      variantName: string;
      variantCode: string;
      quantity: string;
      isActive: boolean | string;
    }>();

    const data = rows.map((row) => ({
      storeId: row.storeId,
      storeName: row.storeName,
      productId: row.productId,
      productName: row.productName,
      productVariantId: row.productVariantId,
      variantName: row.variantName,
      variantCode: row.variantCode,
      quantity: this.toNumber(row.quantity),
      isActive: row.isActive === true || row.isActive === 'true',
    }));

    if (!pagination.hasPagination) {
      return {
        scope: {
          mode: scope.mode,
          storeIds: scope.storeIds,
        },
        threshold,
        data,
      };
    }

    return {
      scope: {
        mode: scope.mode,
        storeIds: scope.storeIds,
      },
      threshold,
      data,
      meta: {
        total,
        limit: pagination.limit,
        page: pagination.page,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  async getInventoryMovementsSummaryReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);
    const pagination = this.resolvePagination(query.page, query.limit);
    const search = query.search?.trim();

    const summaryQb = this.getMovementRepo(manager)
      .createQueryBuilder('m')
      .select('m.type', 'type')
      .addSelect('COUNT(m.id)', 'movementCount')
      .addSelect('COALESCE(SUM(m.quantity), 0)', 'totalQuantity')
      .where('m.tenantId = :tenantId', { tenantId });

    if (scope.storeIds?.length) {
      summaryQb.andWhere('m.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    if (query.productVariantId) {
      summaryQb.andWhere('m.productVariantId = :productVariantId', {
        productVariantId: query.productVariantId,
      });
    }

    if (query.movementType) {
      summaryQb.andWhere('m.type = :movementType', { movementType: query.movementType });
    }

    this.applyDateFilter(summaryQb, 'm', 'createdAt', start, end);

    if (search) {
      summaryQb
        .innerJoin('m.store', 'summaryStore')
        .innerJoin('m.productVariant', 'summaryVariant')
        .innerJoin('summaryVariant.product', 'summaryProduct')
        .andWhere(
          '(summaryStore.name ILIKE :search OR summaryVariant.name ILIKE :search OR summaryVariant.code ILIKE :search OR summaryProduct.name ILIKE :search)',
          { search: `%${search}%` },
        );
    }

    summaryQb.groupBy('m.type');

    const summaryRows = await summaryQb.getRawMany<{
      type: string;
      movementCount: string;
      totalQuantity: string;
    }>();

    const summaryByType = summaryRows.map((row) => ({
      type: row.type,
      movementCount: this.toNumber(row.movementCount),
      totalQuantity: this.toNumber(row.totalQuantity),
    }));

    const detailsQb = this.getMovementRepo(manager)
      .createQueryBuilder('m')
      .leftJoin('m.store', 'store')
      .leftJoin('m.productVariant', 'variant')
      .leftJoin('variant.product', 'product')
      .select('m.id', 'id')
      .addSelect('m.createdAt', 'createdAt')
      .addSelect('m.type', 'type')
      .addSelect('m.quantity', 'quantity')
      .addSelect('m.currency', 'currency')
      .addSelect('m.unitPrice', 'unitPrice')
      .addSelect('m.discountPercent', 'discountPercent')
      .addSelect('m.discountAmount', 'discountAmount')
      .addSelect('m.taxPercent', 'taxPercent')
      .addSelect('m.taxAmount', 'taxAmount')
      .addSelect('m.lineTotal', 'lineTotal')
      .addSelect('m.campaignCode', 'campaignCode')
      .addSelect('m.meta', 'meta')
      .addSelect('store.id', 'storeId')
      .addSelect('store.name', 'storeName')
      .addSelect('variant.id', 'productVariantId')
      .addSelect('variant.name', 'variantName')
      .addSelect('variant.code', 'variantCode')
      .addSelect('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .where('m.tenantId = :tenantId', { tenantId })
      .orderBy('m.createdAt', 'DESC');

    if (scope.storeIds?.length) {
      detailsQb.andWhere('m.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    if (query.productVariantId) {
      detailsQb.andWhere('m.productVariantId = :productVariantId', {
        productVariantId: query.productVariantId,
      });
    }

    if (query.movementType) {
      detailsQb.andWhere('m.type = :movementType', { movementType: query.movementType });
    }

    this.applyDateFilter(detailsQb, 'm', 'createdAt', start, end);

    if (search) {
      detailsQb.andWhere(
        '(store.name ILIKE :search OR variant.name ILIKE :search OR variant.code ILIKE :search OR product.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const total = await detailsQb.getCount();
    if (pagination.hasPagination) {
      detailsQb.offset(pagination.skip).limit(pagination.limit);
    }

    const rows = await detailsQb.getRawMany<{
      id: string;
      createdAt: Date;
      type: string;
      quantity: string;
      currency: string | null;
      unitPrice: string | null;
      discountPercent: string | null;
      discountAmount: string | null;
      taxPercent: string | null;
      taxAmount: string | null;
      lineTotal: string | null;
      campaignCode: string | null;
      meta: unknown;
      storeId: string;
      storeName: string;
      productVariantId: string;
      variantName: string;
      variantCode: string;
      productId: string | null;
      productName: string | null;
    }>();

    const data = rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      type: row.type,
      quantity: this.toNumber(row.quantity),
      currency: row.currency ?? null,
      unitPrice: row.unitPrice !== null ? this.toNumber(row.unitPrice) : null,
      discountPercent: row.discountPercent !== null ? this.toNumber(row.discountPercent) : null,
      discountAmount: row.discountAmount !== null ? this.toNumber(row.discountAmount) : null,
      taxPercent: row.taxPercent !== null ? this.toNumber(row.taxPercent) : null,
      taxAmount: row.taxAmount !== null ? this.toNumber(row.taxAmount) : null,
      lineTotal: row.lineTotal !== null ? this.toNumber(row.lineTotal) : null,
      campaignCode: row.campaignCode ?? null,
      meta: this.parseMeta(row.meta),
      store: {
        id: row.storeId,
        name: row.storeName,
      },
      product: {
        id: row.productId,
        name: row.productName,
      },
      productVariant: {
        id: row.productVariantId,
        name: row.variantName,
        code: row.variantCode,
      },
    }));

    const totals = {
      movementCount: summaryByType.reduce((sum, item) => sum + item.movementCount, 0),
      netQuantity: summaryByType.reduce((sum, item) => sum + item.totalQuantity, 0),
    };

    if (!pagination.hasPagination) {
      return {
        scope: {
          mode: scope.mode,
          storeIds: scope.storeIds,
        },
        period: {
          startDate: query.startDate ?? null,
          endDate: query.endDate ?? null,
        },
        summaryByType,
        totals,
        data,
      };
    }

    return {
      scope: {
        mode: scope.mode,
        storeIds: scope.storeIds,
      },
      period: {
        startDate: query.startDate ?? null,
        endDate: query.endDate ?? null,
      },
      summaryByType,
      totals,
      data,
      meta: {
        total,
        limit: pagination.limit,
        page: pagination.page,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  async getSalesCancellationsReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);
    const pagination = this.resolvePagination(query.page, query.limit);
    const search = query.search?.trim();

    const qb = this.getSaleRepo(manager)
      .createQueryBuilder('sale')
      .leftJoin('sale.store', 'store')
      .select('sale.id', 'id')
      .addSelect('sale.receiptNo', 'receiptNo')
      .addSelect('sale.name', 'name')
      .addSelect('sale.surname', 'surname')
      .addSelect('sale.phoneNumber', 'phoneNumber')
      .addSelect('sale.email', 'email')
      .addSelect('sale.meta', 'meta')
      .addSelect('sale.unitPrice', 'unitPrice')
      .addSelect('sale.lineTotal', 'lineTotal')
      .addSelect('sale.cancelledAt', 'cancelledAt')
      .addSelect('sale.cancelledById', 'cancelledById')
      .addSelect('sale.createdAt', 'createdAt')
      .addSelect('store.id', 'storeId')
      .addSelect('store.name', 'storeName')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :cancelledStatus', { cancelledStatus: SaleStatus.CANCELLED })
      .orderBy('sale.cancelledAt', 'DESC', 'NULLS LAST')
      .addOrderBy('sale.createdAt', 'DESC');

    if (scope.storeIds?.length) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(qb, 'sale', 'cancelledAt', start, end);

    if (query.receiptNo?.trim()) {
      qb.andWhere('sale.receiptNo ILIKE :receiptNo', {
        receiptNo: `%${query.receiptNo.trim()}%`,
      });
    }

    if (query.name?.trim()) {
      qb.andWhere('sale.name ILIKE :name', { name: `%${query.name.trim()}%` });
    }

    if (query.surname?.trim()) {
      qb.andWhere('sale.surname ILIKE :surname', {
        surname: `%${query.surname.trim()}%`,
      });
    }

    if (search) {
      qb.andWhere(
        '(sale.receiptNo ILIKE :search OR sale.name ILIKE :search OR sale.surname ILIKE :search OR store.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const totalsRow = await qb
      .clone()
      .select('COUNT(sale.id)', 'cancelledCount')
      .addSelect('COALESCE(SUM(sale."unitPrice"), 0)', 'totalUnitPrice')
      .addSelect('COALESCE(SUM(sale."lineTotal"), 0)', 'totalLineTotal')
      .orderBy()
      .getRawOne<{
        cancelledCount: string;
        totalUnitPrice: string;
        totalLineTotal: string;
      }>();

    const total = this.toNumber(totalsRow?.cancelledCount);

    if (pagination.hasPagination) {
      qb.offset(pagination.skip).limit(pagination.limit);
    }

    const rows = await qb.getRawMany<{
      id: string;
      receiptNo: string | null;
      name: string | null;
      surname: string | null;
      phoneNumber: string | null;
      email: string | null;
      meta: unknown;
      unitPrice: string;
      lineTotal: string;
      cancelledAt: Date | null;
      cancelledById: string | null;
      createdAt: Date;
      storeId: string;
      storeName: string;
    }>();

    const data = rows.map((row) => {
      const meta = this.parseMeta(row.meta);
      return {
        id: row.id,
        receiptNo: row.receiptNo,
        name: row.name,
        surname: row.surname,
        phoneNumber: row.phoneNumber,
        email: row.email,
        meta,
        cancelMeta: meta?.cancelMeta ?? null,
        unitPrice: this.toNumber(row.unitPrice),
        lineTotal: this.toNumber(row.lineTotal),
        cancelledAt: row.cancelledAt,
        cancelledById: row.cancelledById,
        createdAt: row.createdAt,
        store: {
          id: row.storeId,
          name: row.storeName,
        },
      };
    });

    const totals = {
      cancelledCount: total,
      totalUnitPrice: this.toNumber(totalsRow?.totalUnitPrice),
      totalLineTotal: this.toNumber(totalsRow?.totalLineTotal),
    };

    if (!pagination.hasPagination) {
      return {
        scope: {
          mode: scope.mode,
          storeIds: scope.storeIds,
        },
        period: {
          startDate: query.startDate ?? null,
          endDate: query.endDate ?? null,
        },
        data,
        totals,
      };
    }

    return {
      scope: {
        mode: scope.mode,
        storeIds: scope.storeIds,
      },
      period: {
        startDate: query.startDate ?? null,
        endDate: query.endDate ?? null,
      },
      data,
      totals,
      meta: {
        total,
        limit: pagination.limit,
        page: pagination.page,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  // =========================================================================
  // F-1: Kâr Marjı Analizi (Profit Margin Analysis)
  // =========================================================================
  async getProfitMarginReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);
    const pagination = this.resolvePagination(query.page, query.limit);
    const search = query.search?.trim();

    const qb = this.getSaleLineRepo(manager)
      .createQueryBuilder('line')
      .innerJoin('line.sale', 'sale')
      .innerJoin('line.productVariant', 'variant')
      .innerJoin('variant.product', 'product')
      .select('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('variant.id', 'productVariantId')
      .addSelect('variant.name', 'variantName')
      .addSelect('variant.code', 'variantCode')
      .addSelect('COALESCE(SUM(line.quantity), 0)', 'soldQuantity')
      .addSelect('COALESCE(SUM(COALESCE(line."lineTotal", 0)), 0)', 'totalRevenue')
      .addSelect(
        'COALESCE(SUM(COALESCE(line.quantity, 0) * COALESCE(variant."defaultPurchasePrice", 0)), 0)',
        'totalCost',
      )
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
      .groupBy('product.id')
      .addGroupBy('product.name')
      .addGroupBy('variant.id')
      .addGroupBy('variant.name')
      .addGroupBy('variant.code')
      .orderBy('"totalRevenue"', 'DESC');

    if (scope.storeIds?.length) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(qb, 'sale', 'createdAt', start, end);

    if (search) {
      qb.andWhere(
        '(product.name ILIKE :search OR variant.name ILIKE :search OR variant.code ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getRawMany();

    const mapped = rows.map((row) => {
      const soldQuantity = this.toNumber(row.soldQuantity);
      const totalRevenue = this.toNumber(row.totalRevenue);
      const totalCost = this.toNumber(row.totalCost);
      const grossProfit = totalRevenue - totalCost;
      const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

      return {
        productId: row.productId,
        productName: row.productName,
        productVariantId: row.productVariantId,
        variantName: row.variantName,
        variantCode: row.variantCode,
        soldQuantity,
        totalRevenue,
        totalCost,
        grossProfit,
        profitMargin: Math.round(profitMargin * 100) / 100,
      };
    });

    const grandTotals = {
      totalRevenue: mapped.reduce((s, i) => s + i.totalRevenue, 0),
      totalCost: mapped.reduce((s, i) => s + i.totalCost, 0),
      grossProfit: mapped.reduce((s, i) => s + i.grossProfit, 0),
      profitMargin: 0,
    };
    grandTotals.profitMargin =
      grandTotals.totalRevenue > 0
        ? Math.round(((grandTotals.grossProfit / grandTotals.totalRevenue) * 100) * 100) / 100
        : 0;

    const total = mapped.length;
    const data = pagination.hasPagination
      ? mapped.slice(pagination.skip, pagination.skip + pagination.limit)
      : mapped;

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      period: { startDate: query.startDate ?? null, endDate: query.endDate ?? null },
      data,
      totals: grandTotals,
      ...(pagination.hasPagination
        ? { meta: { total, limit: pagination.limit, page: pagination.page, totalPages: Math.ceil(total / pagination.limit) } }
        : {}),
    };
  }

  // =========================================================================
  // F-2: Gelir Trendi (Revenue Trend by Period)
  // =========================================================================
  async getRevenueTrendReport(query: RevenueTrendQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);
    const groupBy = query.groupBy ?? 'day';

    let dateExpr: string;
    if (groupBy === 'week') {
      dateExpr = `TO_CHAR(DATE_TRUNC('week', sale."createdAt"), 'IYYY-"W"IW')`;
    } else if (groupBy === 'month') {
      dateExpr = `TO_CHAR(sale."createdAt", 'YYYY-MM')`;
    } else {
      dateExpr = `TO_CHAR(sale."createdAt", 'YYYY-MM-DD')`;
    }

    const qb = this.getSaleRepo(manager)
      .createQueryBuilder('sale')
      .select(dateExpr, 'period')
      .addSelect('COUNT(sale.id)', 'saleCount')
      .addSelect('COALESCE(SUM(sale."lineTotal"), 0)', 'totalRevenue')
      .addSelect('COALESCE(SUM(sale."unitPrice"), 0)', 'totalUnitPrice')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
      .groupBy('period')
      .orderBy('period', 'ASC');

    if (scope.storeIds?.length) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(qb, 'sale', 'createdAt', start, end);

    const rows = await qb.getRawMany();

    const data = rows.map((row, idx) => {
      const saleCount = this.toNumber(row.saleCount);
      const totalRevenue = this.toNumber(row.totalRevenue);
      const averageBasket = saleCount > 0 ? totalRevenue / saleCount : 0;

      const prevRevenue = idx > 0 ? this.toNumber(rows[idx - 1].totalRevenue) : null;
      const changePercent = prevRevenue !== null ? this.calculateChangePercent(totalRevenue, prevRevenue) : null;

      return {
        period: row.period,
        saleCount,
        totalRevenue,
        totalUnitPrice: this.toNumber(row.totalUnitPrice),
        averageBasket: Math.round(averageBasket * 100) / 100,
        changePercent,
        trend: changePercent === null ? null : changePercent > 0 ? 'INCREASE' : changePercent < 0 ? 'DECREASE' : 'SAME',
      };
    });

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      period: { startDate: query.startDate ?? null, endDate: query.endDate ?? null },
      groupBy,
      data,
    };
  }

  // =========================================================================
  // F-3: KDV / Vergi Özeti (Tax Summary)
  // =========================================================================
  async getTaxSummaryReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);

    const taxExpr = `COALESCE(line."taxPercent", 0)`;
    const netExpr = `COALESCE(line."unitPrice", 0) * COALESCE(line."quantity", 0)`;
    const taxAmountExpr = `CASE
      WHEN line."taxAmount" IS NOT NULL THEN line."taxAmount"
      WHEN line."taxPercent" IS NOT NULL THEN ((${netExpr}) * line."taxPercent" / 100)
      ELSE 0
    END`;

    const qb = this.getSaleLineRepo(manager)
      .createQueryBuilder('line')
      .innerJoin('line.sale', 'sale')
      .select(`${taxExpr}`, 'taxRate')
      .addSelect('COUNT(DISTINCT sale.id)', 'transactionCount')
      .addSelect(`COALESCE(SUM(${netExpr}), 0)`, 'netSales')
      .addSelect(`COALESCE(SUM(${taxAmountExpr}), 0)`, 'taxAmount')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
      .groupBy(`${taxExpr}`)
      .orderBy(`${taxExpr}`, 'ASC');

    if (scope.storeIds?.length) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(qb, 'sale', 'createdAt', start, end);

    const rows = await qb.getRawMany();

    const data = rows.map((row) => {
      const netSales = this.toNumber(row.netSales);
      const taxAmount = this.toNumber(row.taxAmount);
      return {
        taxRate: this.toNumber(row.taxRate),
        transactionCount: this.toNumber(row.transactionCount),
        netSales,
        taxAmount,
        grossSales: netSales + taxAmount,
      };
    });

    const totals = {
      transactionCount: data.reduce((s, i) => s + i.transactionCount, 0),
      netSales: data.reduce((s, i) => s + i.netSales, 0),
      taxAmount: data.reduce((s, i) => s + i.taxAmount, 0),
      grossSales: data.reduce((s, i) => s + i.grossSales, 0),
    };

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      period: { startDate: query.startDate ?? null, endDate: query.endDate ?? null },
      data,
      totals,
    };
  }

  // =========================================================================
  // TAX-1: Aylık KDV Beyanname Özeti (VAT Summary)
  // =========================================================================
  async getVatSummaryReport(query: VatSummaryQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);

    const monthMatch = query.month?.match(/^(\d{4})-(\d{2})$/);
    if (!monthMatch) {
      throw new BadRequestException('month YYYY-MM formatinda olmalidir.');
    }

    const year = parseInt(monthMatch[1], 10);
    const month = parseInt(monthMatch[2], 10);
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const taxExpr = `COALESCE(line."taxPercent", 0)`;
    const netExpr = `COALESCE(line."unitPrice", 0) * COALESCE(line."quantity", 0)`;
    const taxAmountExpr = `CASE
      WHEN line."taxAmount" IS NOT NULL THEN line."taxAmount"
      WHEN line."taxPercent" IS NOT NULL THEN ((${netExpr}) * line."taxPercent" / 100)
      ELSE 0
    END`;

    // Confirmed satislar
    const confirmedQb = this.getSaleLineRepo(manager)
      .createQueryBuilder('line')
      .innerJoin('line.sale', 'sale')
      .select(`${taxExpr}`, 'taxRate')
      .addSelect('COUNT(DISTINCT sale.id)', 'transactionCount')
      .addSelect(`COALESCE(SUM(${netExpr}), 0)`, 'netSales')
      .addSelect(`COALESCE(SUM(${taxAmountExpr}), 0)`, 'taxAmount')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
      .andWhere('sale."createdAt" >= :monthStart', { monthStart })
      .andWhere('sale."createdAt" <= :monthEnd', { monthEnd })
      .groupBy(`${taxExpr}`)
      .orderBy(`${taxExpr}`, 'ASC');

    if (scope.storeIds?.length) {
      confirmedQb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    const confirmedRows = await confirmedQb.getRawMany();

    // Iptal satislar (dusulecek)
    const cancelledQb = this.getSaleLineRepo(manager)
      .createQueryBuilder('line')
      .innerJoin('line.sale', 'sale')
      .select(`${taxExpr}`, 'taxRate')
      .addSelect('COUNT(DISTINCT sale.id)', 'transactionCount')
      .addSelect(`COALESCE(SUM(${netExpr}), 0)`, 'netSales')
      .addSelect(`COALESCE(SUM(${taxAmountExpr}), 0)`, 'taxAmount')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.CANCELLED })
      .andWhere('sale."cancelledAt" >= :monthStart', { monthStart })
      .andWhere('sale."cancelledAt" <= :monthEnd', { monthEnd })
      .groupBy(`${taxExpr}`)
      .orderBy(`${taxExpr}`, 'ASC');

    if (scope.storeIds?.length) {
      cancelledQb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    const cancelledRows = await cancelledQb.getRawMany();
    const cancelledMap = new Map<number, { netSales: number; taxAmount: number; count: number }>();
    for (const row of cancelledRows) {
      cancelledMap.set(this.toNumber(row.taxRate), {
        netSales: this.toNumber(row.netSales),
        taxAmount: this.toNumber(row.taxAmount),
        count: this.toNumber(row.transactionCount),
      });
    }

    const data = confirmedRows.map((row) => {
      const taxRate = this.toNumber(row.taxRate);
      const grossNet = this.toNumber(row.netSales);
      const grossTax = this.toNumber(row.taxAmount);
      const cancelled = cancelledMap.get(taxRate);
      const netSales = grossNet - (cancelled?.netSales ?? 0);
      const taxAmount = grossTax - (cancelled?.taxAmount ?? 0);

      return {
        taxRate,
        transactionCount: this.toNumber(row.transactionCount),
        cancelledCount: cancelled?.count ?? 0,
        grossNetSales: grossNet,
        cancelledNetSales: cancelled?.netSales ?? 0,
        netSales,
        grossTaxAmount: grossTax,
        cancelledTaxAmount: cancelled?.taxAmount ?? 0,
        taxAmount,
        grossTotal: netSales + taxAmount,
      };
    });

    const totals = {
      netSales: data.reduce((s, i) => s + i.netSales, 0),
      taxAmount: data.reduce((s, i) => s + i.taxAmount, 0),
      grossTotal: data.reduce((s, i) => s + i.grossTotal, 0),
    };

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      month: query.month,
      data,
      totals,
    };
  }

  // =========================================================================
  // E-1: Çalışan Bazlı Satış Performansı (Sales by Employee)
  // =========================================================================
  async getEmployeeSalesPerformanceReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);
    const pagination = this.resolvePagination(query.page, query.limit);

    const qb = this.getSaleRepo(manager)
      .createQueryBuilder('sale')
      .leftJoin(User, 'u', 'u.id = sale."createdById"')
      .select('sale."createdById"', 'userId')
      .addSelect('u.name', 'userName')
      .addSelect('u.surname', 'userSurname')
      .addSelect('u.email', 'userEmail')
      .addSelect('COUNT(sale.id)', 'saleCount')
      .addSelect(
        'COALESCE(SUM(CASE WHEN sale.status = :confirmedStatus THEN 1 ELSE 0 END), 0)',
        'confirmedCount',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN sale.status = :cancelledStatus THEN 1 ELSE 0 END), 0)',
        'cancelledCount',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN sale.status = :confirmedStatus THEN sale."lineTotal" ELSE 0 END), 0)',
        'totalRevenue',
      )
      .where('sale.tenantId = :tenantId', { tenantId })
      .setParameters({
        confirmedStatus: SaleStatus.CONFIRMED,
        cancelledStatus: SaleStatus.CANCELLED,
      })
      .groupBy('sale."createdById"')
      .addGroupBy('u.name')
      .addGroupBy('u.surname')
      .addGroupBy('u.email')
      .orderBy('"totalRevenue"', 'DESC');

    if (scope.storeIds?.length) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(qb, 'sale', 'createdAt', start, end);

    const rows = await qb.getRawMany();

    const mapped = rows.map((row, idx) => {
      const saleCount = this.toNumber(row.saleCount);
      const confirmedCount = this.toNumber(row.confirmedCount);
      const cancelledCount = this.toNumber(row.cancelledCount);
      const totalRevenue = this.toNumber(row.totalRevenue);

      return {
        rank: idx + 1,
        userId: row.userId,
        userName: row.userName,
        userSurname: row.userSurname,
        userEmail: row.userEmail,
        saleCount,
        confirmedCount,
        cancelledCount,
        cancelRate: saleCount > 0 ? Math.round((cancelledCount / saleCount) * 10000) / 100 : 0,
        totalRevenue,
        averageBasket: confirmedCount > 0 ? Math.round((totalRevenue / confirmedCount) * 100) / 100 : 0,
      };
    });

    const total = mapped.length;
    const data = pagination.hasPagination
      ? mapped.slice(pagination.skip, pagination.skip + pagination.limit)
      : mapped;

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      period: { startDate: query.startDate ?? null, endDate: query.endDate ?? null },
      data,
      ...(pagination.hasPagination
        ? { meta: { total, limit: pagination.limit, page: pagination.page, totalPages: Math.ceil(total / pagination.limit) } }
        : {}),
    };
  }

  // =========================================================================
  // T-1: Saatlik Satış Analizi (Hourly Sales Analysis)
  // =========================================================================
  async getHourlySalesReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);

    const qb = this.getSaleRepo(manager)
      .createQueryBuilder('sale')
      .select('EXTRACT(HOUR FROM sale."createdAt")', 'hour')
      .addSelect('COUNT(sale.id)', 'saleCount')
      .addSelect('COALESCE(SUM(sale."lineTotal"), 0)', 'totalRevenue')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
      .groupBy('EXTRACT(HOUR FROM sale."createdAt")')
      .orderBy('hour', 'ASC');

    if (scope.storeIds?.length) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(qb, 'sale', 'createdAt', start, end);

    const rows = await qb.getRawMany();

    const totalRevenue = rows.reduce((s, r) => s + this.toNumber(r.totalRevenue), 0);

    const hourlyData = Array.from({ length: 24 }, (_, h) => {
      const row = rows.find((r) => this.toNumber(r.hour) === h);
      const revenue = row ? this.toNumber(row.totalRevenue) : 0;
      const saleCount = row ? this.toNumber(row.saleCount) : 0;
      return {
        hour: h,
        saleCount,
        totalRevenue: revenue,
        averageBasket: saleCount > 0 ? Math.round((revenue / saleCount) * 100) / 100 : 0,
        revenueShare: totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 10000) / 100 : 0,
      };
    });

    const peakHours = [...hourlyData]
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 3)
      .map((h) => h.hour);

    // Heatmap: haftanin gunu x saat
    const heatmapQb = this.getSaleRepo(manager)
      .createQueryBuilder('sale')
      .select('EXTRACT(DOW FROM sale."createdAt")', 'dow')
      .addSelect('EXTRACT(HOUR FROM sale."createdAt")', 'hour')
      .addSelect('COUNT(sale.id)', 'saleCount')
      .addSelect('COALESCE(SUM(sale."lineTotal"), 0)', 'totalRevenue')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
      .groupBy('EXTRACT(DOW FROM sale."createdAt")')
      .addGroupBy('EXTRACT(HOUR FROM sale."createdAt")')
      .orderBy('dow', 'ASC')
      .addOrderBy('hour', 'ASC');

    if (scope.storeIds?.length) {
      heatmapQb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(heatmapQb, 'sale', 'createdAt', start, end);

    const heatmapRows = await heatmapQb.getRawMany();

    const heatmap = heatmapRows.map((r) => ({
      dayOfWeek: this.toNumber(r.dow),
      hour: this.toNumber(r.hour),
      saleCount: this.toNumber(r.saleCount),
      totalRevenue: this.toNumber(r.totalRevenue),
    }));

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      period: { startDate: query.startDate ?? null, endDate: query.endDate ?? null },
      hourly: hourlyData,
      peakHours,
      heatmap,
    };
  }

  // =========================================================================
  // P-1: En Çok / En Az Satan Ürünler (Performance Ranking)
  // =========================================================================
  async getProductPerformanceRankingReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);
    const pagination = this.resolvePagination(query.page, query.limit);
    const search = query.search?.trim();

    const qb = this.getSaleLineRepo(manager)
      .createQueryBuilder('line')
      .innerJoin('line.sale', 'sale')
      .innerJoin('line.productVariant', 'variant')
      .innerJoin('variant.product', 'product')
      .select('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('variant.id', 'productVariantId')
      .addSelect('variant.name', 'variantName')
      .addSelect('variant.code', 'variantCode')
      .addSelect('COALESCE(SUM(line.quantity), 0)', 'soldQuantity')
      .addSelect('COALESCE(SUM(COALESCE(line."lineTotal", 0)), 0)', 'totalRevenue')
      .addSelect('COUNT(DISTINCT sale.id)', 'saleCount')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
      .groupBy('product.id')
      .addGroupBy('product.name')
      .addGroupBy('variant.id')
      .addGroupBy('variant.name')
      .addGroupBy('variant.code')
      .orderBy('"soldQuantity"', 'DESC');

    if (scope.storeIds?.length) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(qb, 'sale', 'createdAt', start, end);

    if (search) {
      qb.andWhere(
        '(product.name ILIKE :search OR variant.name ILIKE :search OR variant.code ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getRawMany();

    // Stok bilgisi
    const variantIds = rows.map((r) => r.productVariantId);
    const stockMap = new Map<string, number>();

    if (variantIds.length > 0) {
      const stockQb = this.getStockSummaryRepo(manager)
        .createQueryBuilder('s')
        .select('s.productVariantId', 'variantId')
        .addSelect('COALESCE(SUM(s.quantity), 0)', 'totalStock')
        .where('s.tenantId = :tenantId', { tenantId })
        .andWhere('s."isActiveStore" = true')
        .andWhere('s.productVariantId IN (:...variantIds)', { variantIds })
        .groupBy('s.productVariantId');

      if (scope.storeIds?.length) {
        stockQb.andWhere('s.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
      }

      const stockRows = await stockQb.getRawMany();
      for (const sr of stockRows) {
        stockMap.set(sr.variantId, this.toNumber(sr.totalStock));
      }
    }

    const mapped = rows.map((row, idx) => {
      const stock = stockMap.get(row.productVariantId) ?? 0;
      return {
        rank: idx + 1,
        productId: row.productId,
        productName: row.productName,
        productVariantId: row.productVariantId,
        variantName: row.variantName,
        variantCode: row.variantCode,
        soldQuantity: this.toNumber(row.soldQuantity),
        totalRevenue: this.toNumber(row.totalRevenue),
        saleCount: this.toNumber(row.saleCount),
        currentStock: stock,
        stockStatus: stock <= 0 ? 'OUT_OF_STOCK' : stock <= 10 ? 'LOW' : 'IN_STOCK',
      };
    });

    const total = mapped.length;
    const data = pagination.hasPagination
      ? mapped.slice(pagination.skip, pagination.skip + pagination.limit)
      : mapped;

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      period: { startDate: query.startDate ?? null, endDate: query.endDate ?? null },
      data,
      ...(pagination.hasPagination
        ? { meta: { total, limit: pagination.limit, page: pagination.page, totalPages: Math.ceil(total / pagination.limit) } }
        : {}),
    };
  }

  // =========================================================================
  // P-2: Hareketsiz / Ölü Stok (Dead Stock)
  // =========================================================================
  async getDeadStockReport(query: DeadStockQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const pagination = this.resolvePagination(query.page, query.limit);
    const noSaleDays = query.noSaleDays ?? 30;
    const search = query.search?.trim();
    const cutoffDate = new Date();
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - noSaleDays);

    // Stoku > 0 olan varyantlar
    const qb = this.getStockSummaryRepo(manager)
      .createQueryBuilder('s')
      .innerJoin('s.productVariant', 'variant')
      .innerJoin('variant.product', 'product')
      .select('variant.id', 'productVariantId')
      .addSelect('variant.name', 'variantName')
      .addSelect('variant.code', 'variantCode')
      .addSelect('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('COALESCE(SUM(s.quantity), 0)', 'currentStock')
      .addSelect('variant."defaultPurchasePrice"', 'purchasePrice')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s."isActiveStore" = true')
      .having('COALESCE(SUM(s.quantity), 0) > 0')
      .groupBy('variant.id')
      .addGroupBy('variant.name')
      .addGroupBy('variant.code')
      .addGroupBy('product.id')
      .addGroupBy('product.name')
      .addGroupBy('variant."defaultPurchasePrice"')
      .orderBy('"currentStock"', 'DESC');

    if (scope.storeIds?.length) {
      qb.andWhere('s.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    if (search) {
      qb.andWhere(
        '(product.name ILIKE :search OR variant.name ILIKE :search OR variant.code ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const stockRows = await qb.getRawMany();

    // Son satis tarihleri
    const variantIds = stockRows.map((r) => r.productVariantId);
    const lastSaleMap = new Map<string, Date>();

    if (variantIds.length > 0) {
      const lastSaleQb = this.getSaleLineRepo(manager)
        .createQueryBuilder('line')
        .innerJoin('line.sale', 'sale')
        .select('line.productVariantId', 'variantId')
        .addSelect('MAX(sale."createdAt")', 'lastSaleDate')
        .where('sale.tenantId = :tenantId', { tenantId })
        .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
        .andWhere('line.productVariantId IN (:...variantIds)', { variantIds })
        .groupBy('line.productVariantId');

      if (scope.storeIds?.length) {
        lastSaleQb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
      }

      const lastSaleRows = await lastSaleQb.getRawMany();
      for (const r of lastSaleRows) {
        lastSaleMap.set(r.variantId, new Date(r.lastSaleDate));
      }
    }

    const now = new Date();
    const allItems = stockRows
      .map((row) => {
        const lastSaleDate = lastSaleMap.get(row.productVariantId) ?? null;
        const noSaleDaysActual = lastSaleDate
          ? Math.floor((now.getTime() - lastSaleDate.getTime()) / (1000 * 60 * 60 * 24))
          : Infinity;
        const currentStock = this.toNumber(row.currentStock);
        const purchasePrice = this.toNumber(row.purchasePrice);

        return {
          productId: row.productId,
          productName: row.productName,
          productVariantId: row.productVariantId,
          variantName: row.variantName,
          variantCode: row.variantCode,
          currentStock,
          lastSaleDate: lastSaleDate?.toISOString() ?? null,
          noSaleDays: noSaleDaysActual === Infinity ? null : noSaleDaysActual,
          estimatedValue: currentStock * purchasePrice,
        };
      })
      .filter((item) => {
        if (item.noSaleDays === null) return true; // hic satilmamis
        return item.noSaleDays >= noSaleDays;
      });

    const totalEstimatedValue = allItems.reduce((s, i) => s + i.estimatedValue, 0);
    const total = allItems.length;
    const data = pagination.hasPagination
      ? allItems.slice(pagination.skip, pagination.skip + pagination.limit)
      : allItems;

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      noSaleDays,
      data,
      totals: {
        itemCount: total,
        totalEstimatedValue,
      },
      ...(pagination.hasPagination
        ? { meta: { total, limit: pagination.limit, page: pagination.page, totalPages: Math.ceil(total / pagination.limit) } }
        : {}),
    };
  }

  // =========================================================================
  // I-1: Stok Devir Hızı (Stock Turnover Rate)
  // =========================================================================
  async getStockTurnoverReport(query: TurnoverQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const pagination = this.resolvePagination(query.page, query.limit);
    const periodDays = query.periodDays ?? 30;
    const search = query.search?.trim();

    const periodStart = new Date();
    periodStart.setUTCDate(periodStart.getUTCDate() - periodDays);

    // Mevcut stok
    const stockQb = this.getStockSummaryRepo(manager)
      .createQueryBuilder('s')
      .innerJoin('s.productVariant', 'variant')
      .innerJoin('variant.product', 'product')
      .select('variant.id', 'productVariantId')
      .addSelect('variant.name', 'variantName')
      .addSelect('variant.code', 'variantCode')
      .addSelect('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('COALESCE(SUM(s.quantity), 0)', 'currentStock')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s."isActiveStore" = true')
      .groupBy('variant.id')
      .addGroupBy('variant.name')
      .addGroupBy('variant.code')
      .addGroupBy('product.id')
      .addGroupBy('product.name');

    if (scope.storeIds?.length) {
      stockQb.andWhere('s.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    if (search) {
      stockQb.andWhere(
        '(product.name ILIKE :search OR variant.name ILIKE :search OR variant.code ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const stockRows = await stockQb.getRawMany();

    // Donemde satilan miktar
    const variantIds = stockRows.map((r) => r.productVariantId);
    const soldMap = new Map<string, number>();

    if (variantIds.length > 0) {
      const soldQb = this.getSaleLineRepo(manager)
        .createQueryBuilder('line')
        .innerJoin('line.sale', 'sale')
        .select('line.productVariantId', 'variantId')
        .addSelect('COALESCE(SUM(line.quantity), 0)', 'soldQuantity')
        .where('sale.tenantId = :tenantId', { tenantId })
        .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
        .andWhere('sale."createdAt" >= :periodStart', { periodStart })
        .andWhere('line.productVariantId IN (:...variantIds)', { variantIds })
        .groupBy('line.productVariantId');

      if (scope.storeIds?.length) {
        soldQb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
      }

      const soldRows = await soldQb.getRawMany();
      for (const r of soldRows) {
        soldMap.set(r.variantId, this.toNumber(r.soldQuantity));
      }
    }

    const allItems = stockRows.map((row) => {
      const currentStock = this.toNumber(row.currentStock);
      const soldQuantity = soldMap.get(row.productVariantId) ?? 0;
      const dailyAvgSales = soldQuantity / periodDays;
      const avgInventory = currentStock + soldQuantity / 2;
      const turnoverRate = avgInventory > 0 ? soldQuantity / avgInventory : 0;
      const supplyDays = dailyAvgSales > 0 ? Math.round(currentStock / dailyAvgSales) : null;
      const classification = turnoverRate >= 4 ? 'FAST' : turnoverRate >= 1 ? 'NORMAL' : 'SLOW';

      return {
        productId: row.productId,
        productName: row.productName,
        productVariantId: row.productVariantId,
        variantName: row.variantName,
        variantCode: row.variantCode,
        currentStock,
        soldQuantity,
        periodDays,
        dailyAvgSales: Math.round(dailyAvgSales * 100) / 100,
        turnoverRate: Math.round(turnoverRate * 100) / 100,
        supplyDays,
        classification,
      };
    });

    allItems.sort((a, b) => b.turnoverRate - a.turnoverRate);

    const total = allItems.length;
    const data = pagination.hasPagination
      ? allItems.slice(pagination.skip, pagination.skip + pagination.limit)
      : allItems;

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      periodDays,
      data,
      ...(pagination.hasPagination
        ? { meta: { total, limit: pagination.limit, page: pagination.page, totalPages: Math.ceil(total / pagination.limit) } }
        : {}),
    };
  }

  // =========================================================================
  // C-1: En İyi Müşteriler (Top Customers)
  // =========================================================================
  async getTopCustomersReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);
    const pagination = this.resolvePagination(query.page, query.limit);
    const search = query.search?.trim();

    const qb = this.getSaleRepo(manager)
      .createQueryBuilder('sale')
      .select('sale."phoneNumber"', 'phoneNumber')
      .addSelect('MAX(sale.name)', 'name')
      .addSelect('MAX(sale.surname)', 'surname')
      .addSelect('MAX(sale.email)', 'email')
      .addSelect('COUNT(sale.id)', 'totalOrders')
      .addSelect(
        'COALESCE(SUM(CASE WHEN sale.status = :confirmedStatus THEN 1 ELSE 0 END), 0)',
        'confirmedCount',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN sale.status = :cancelledStatus THEN 1 ELSE 0 END), 0)',
        'cancelledCount',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN sale.status = :confirmedStatus THEN sale."lineTotal" ELSE 0 END), 0)',
        'totalSpent',
      )
      .addSelect('MIN(sale."createdAt")', 'firstPurchase')
      .addSelect('MAX(sale."createdAt")', 'lastPurchase')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale."phoneNumber" IS NOT NULL')
      .andWhere("sale.\"phoneNumber\" != ''")
      .setParameters({
        confirmedStatus: SaleStatus.CONFIRMED,
        cancelledStatus: SaleStatus.CANCELLED,
      })
      .groupBy('sale."phoneNumber"')
      .orderBy('"totalSpent"', 'DESC');

    if (scope.storeIds?.length) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(qb, 'sale', 'createdAt', start, end);

    if (search) {
      qb.andWhere(
        '(sale.name ILIKE :search OR sale.surname ILIKE :search OR sale."phoneNumber" ILIKE :search OR sale.email ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getRawMany();

    const mapped = rows.map((row, idx) => {
      const totalOrders = this.toNumber(row.totalOrders);
      const confirmedCount = this.toNumber(row.confirmedCount);
      const cancelledCount = this.toNumber(row.cancelledCount);
      const totalSpent = this.toNumber(row.totalSpent);

      return {
        rank: idx + 1,
        phoneNumber: row.phoneNumber,
        name: row.name,
        surname: row.surname,
        email: row.email,
        totalOrders,
        confirmedCount,
        cancelledCount,
        cancelRate: totalOrders > 0 ? Math.round((cancelledCount / totalOrders) * 10000) / 100 : 0,
        totalSpent,
        averageBasket: confirmedCount > 0 ? Math.round((totalSpent / confirmedCount) * 100) / 100 : 0,
        firstPurchase: row.firstPurchase,
        lastPurchase: row.lastPurchase,
      };
    });

    const total = mapped.length;
    const data = pagination.hasPagination
      ? mapped.slice(pagination.skip, pagination.skip + pagination.limit)
      : mapped;

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      period: { startDate: query.startDate ?? null, endDate: query.endDate ?? null },
      data,
      ...(pagination.hasPagination
        ? { meta: { total, limit: pagination.limit, page: pagination.page, totalPages: Math.ceil(total / pagination.limit) } }
        : {}),
    };
  }

  // =========================================================================
  // PR-1: Kampanya / İndirim Etkinliği (Discount Effectiveness)
  // =========================================================================
  async getDiscountEffectivenessReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);

    const discountExpr = `CASE
      WHEN line."discountAmount" IS NOT NULL THEN line."discountAmount"
      WHEN line."discountPercent" IS NOT NULL THEN (COALESCE(line."unitPrice", 0) * COALESCE(line."quantity", 0) * line."discountPercent" / 100)
      ELSE 0
    END`;

    const qb = this.getSaleLineRepo(manager)
      .createQueryBuilder('line')
      .innerJoin('line.sale', 'sale')
      .select('COALESCE(line."campaignCode", \'NO_CAMPAIGN\')', 'campaignCode')
      .addSelect('COUNT(DISTINCT sale.id)', 'saleCount')
      .addSelect('COALESCE(SUM(line.quantity), 0)', 'soldQuantity')
      .addSelect(`COALESCE(SUM(${discountExpr}), 0)`, 'totalDiscount')
      .addSelect('COALESCE(SUM(COALESCE(line."lineTotal", 0)), 0)', 'totalRevenue')
      .addSelect(
        'COALESCE(SUM(COALESCE(line."unitPrice", 0) * COALESCE(line."quantity", 0)), 0)',
        'totalUnitPrice',
      )
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
      .groupBy('COALESCE(line."campaignCode", \'NO_CAMPAIGN\')')
      .orderBy('"totalRevenue"', 'DESC');

    if (scope.storeIds?.length) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(qb, 'sale', 'createdAt', start, end);

    const rows = await qb.getRawMany();

    const data = rows.map((row) => {
      const saleCount = this.toNumber(row.saleCount);
      const totalRevenue = this.toNumber(row.totalRevenue);
      const totalDiscount = this.toNumber(row.totalDiscount);
      const totalUnitPrice = this.toNumber(row.totalUnitPrice);

      return {
        campaignCode: row.campaignCode,
        saleCount,
        soldQuantity: this.toNumber(row.soldQuantity),
        totalDiscount,
        totalRevenue,
        totalUnitPrice,
        discountRate: totalUnitPrice > 0 ? Math.round((totalDiscount / totalUnitPrice) * 10000) / 100 : 0,
        averageBasket: saleCount > 0 ? Math.round((totalRevenue / saleCount) * 100) / 100 : 0,
      };
    });

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      period: { startDate: query.startDate ?? null, endDate: query.endDate ?? null },
      data,
    };
  }

  // =========================================================================
  // F-4: Maliyet Hareketi Analizi (COGS Movement)
  // =========================================================================
  async getCOGSMovementReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);
    const pagination = this.resolvePagination(query.page, query.limit);

    const qb = this.getMovementRepo(manager)
      .createQueryBuilder('m')
      .innerJoin('m.productVariant', 'variant')
      .innerJoin('variant.product', 'product')
      .select('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('variant.id', 'productVariantId')
      .addSelect('variant.name', 'variantName')
      .addSelect('variant.code', 'variantCode')
      .addSelect('COALESCE(SUM(m.quantity), 0)', 'totalQuantity')
      .addSelect('COALESCE(SUM(COALESCE(m."unitPrice", 0) * m.quantity), 0)', 'totalCost')
      .addSelect('AVG(COALESCE(m."unitPrice", 0))', 'avgUnitPrice')
      .where('m.tenantId = :tenantId', { tenantId })
      .andWhere('m.type = :type', { type: 'IN' })
      .groupBy('product.id')
      .addGroupBy('product.name')
      .addGroupBy('variant.id')
      .addGroupBy('variant.name')
      .addGroupBy('variant.code')
      .orderBy('"totalCost"', 'DESC');

    if (scope.storeIds?.length) {
      qb.andWhere('m.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(qb, 'm', 'createdAt', start, end);

    const rows = await qb.getRawMany();

    const mapped = rows.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      productVariantId: row.productVariantId,
      variantName: row.variantName,
      variantCode: row.variantCode,
      totalQuantity: this.toNumber(row.totalQuantity),
      totalCost: this.toNumber(row.totalCost),
      avgUnitPrice: Math.round(this.toNumber(row.avgUnitPrice) * 100) / 100,
    }));

    const totals = {
      totalQuantity: mapped.reduce((s, i) => s + i.totalQuantity, 0),
      totalCost: mapped.reduce((s, i) => s + i.totalCost, 0),
    };

    const total = mapped.length;
    const data = pagination.hasPagination
      ? mapped.slice(pagination.skip, pagination.skip + pagination.limit)
      : mapped;

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      period: { startDate: query.startDate ?? null, endDate: query.endDate ?? null },
      data,
      totals,
      ...(pagination.hasPagination
        ? { meta: { total, limit: pagination.limit, page: pagination.page, totalPages: Math.ceil(total / pagination.limit) } }
        : {}),
    };
  }

  // =========================================================================
  // C-2: Müşteri Satın Alma Geçmişi (Purchase History)
  // =========================================================================
  async getCustomerPurchaseHistoryReport(query: CustomerQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const pagination = this.resolvePagination(query.page, query.limit);

    if (!query.phoneNumber && !query.email) {
      throw new BadRequestException('phoneNumber veya email parametrelerinden en az biri zorunludur.');
    }

    const qb = this.getSaleRepo(manager)
      .createQueryBuilder('sale')
      .leftJoin('sale.store', 'store')
      .leftJoin('sale.lines', 'line')
      .leftJoin('line.productVariant', 'variant')
      .leftJoin('variant.product', 'product')
      .select('sale.id', 'saleId')
      .addSelect('sale.receiptNo', 'receiptNo')
      .addSelect('sale.status', 'status')
      .addSelect('sale."lineTotal"', 'lineTotal')
      .addSelect('sale."createdAt"', 'createdAt')
      .addSelect('store.id', 'storeId')
      .addSelect('store.name', 'storeName')
      .where('sale.tenantId = :tenantId', { tenantId })
      .orderBy('sale."createdAt"', 'DESC');

    if (query.phoneNumber) {
      qb.andWhere('sale."phoneNumber" = :phone', { phone: query.phoneNumber });
    }

    if (query.email) {
      qb.andWhere('sale.email = :email', { email: query.email });
    }

    if (scope.storeIds?.length) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    // Basit sale listesi
    const salesQb = this.getSaleRepo(manager)
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.store', 'store')
      .leftJoinAndSelect('sale.lines', 'line')
      .leftJoinAndSelect('line.productVariant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .where('sale.tenantId = :tenantId', { tenantId })
      .orderBy('sale."createdAt"', 'DESC');

    if (query.phoneNumber) {
      salesQb.andWhere('sale."phoneNumber" = :phone', { phone: query.phoneNumber });
    }

    if (query.email) {
      salesQb.andWhere('sale.email = :email', { email: query.email });
    }

    if (scope.storeIds?.length) {
      salesQb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    const total = await salesQb.getCount();

    if (pagination.hasPagination) {
      salesQb.skip(pagination.skip).take(pagination.limit);
    }

    const sales = await salesQb.getMany();

    const data = sales.map((sale) => ({
      saleId: sale.id,
      receiptNo: sale.receiptNo,
      status: sale.status,
      lineTotal: this.toNumber(sale.lineTotal),
      createdAt: sale.createdAt,
      store: sale.store ? { id: sale.store.id, name: sale.store.name } : null,
      lines: (sale.lines ?? []).map((line) => ({
        variantName: line.productVariant?.name,
        variantCode: line.productVariant?.code,
        productName: line.productVariant?.product?.name,
        quantity: this.toNumber(line.quantity),
        unitPrice: this.toNumber(line.unitPrice),
        lineTotal: this.toNumber(line.lineTotal),
      })),
    }));

    // Ozet
    const confirmedSales = sales.filter((s) => s.status === SaleStatus.CONFIRMED);
    const summary = {
      totalOrders: total,
      totalSpent: confirmedSales.reduce((s, sale) => s + this.toNumber(sale.lineTotal), 0),
      averageBasket:
        confirmedSales.length > 0
          ? confirmedSales.reduce((s, sale) => s + this.toNumber(sale.lineTotal), 0) / confirmedSales.length
          : 0,
    };

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      customer: { phoneNumber: query.phoneNumber ?? null, email: query.email ?? null },
      summary,
      data,
      ...(pagination.hasPagination
        ? { meta: { total, limit: pagination.limit, page: pagination.page, totalPages: Math.ceil(total / pagination.limit) } }
        : {}),
    };
  }

  // =========================================================================
  // C-3: Müşteri Satın Alma Sıklığı / RFM Segmentasyonu
  // =========================================================================
  async getCustomerFrequencyReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);

    const qb = this.getSaleRepo(manager)
      .createQueryBuilder('sale')
      .select('sale."phoneNumber"', 'phoneNumber')
      .addSelect('COUNT(sale.id)', 'orderCount')
      .addSelect('COALESCE(SUM(CASE WHEN sale.status = :confirmedStatus THEN sale."lineTotal" ELSE 0 END), 0)', 'totalSpent')
      .addSelect('MAX(sale."createdAt")', 'lastPurchase')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale."phoneNumber" IS NOT NULL')
      .andWhere("sale.\"phoneNumber\" != ''")
      .setParameters({ confirmedStatus: SaleStatus.CONFIRMED })
      .groupBy('sale."phoneNumber"');

    if (scope.storeIds?.length) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(qb, 'sale', 'createdAt', start, end);

    const rows = await qb.getRawMany();

    const now = new Date();

    // Frequency buckets
    const frequencyBuckets = { '1': 0, '2-3': 0, '4-10': 0, '10+': 0 };
    // RFM segments
    const segments = { champions: 0, loyal: 0, atRisk: 0, lost: 0 };

    const customers = rows.map((row) => {
      const orderCount = this.toNumber(row.orderCount);
      const totalSpent = this.toNumber(row.totalSpent);
      const lastPurchase = new Date(row.lastPurchase);
      const daysSinceLastPurchase = Math.floor((now.getTime() - lastPurchase.getTime()) / (1000 * 60 * 60 * 24));

      // Frequency bucket
      if (orderCount === 1) frequencyBuckets['1']++;
      else if (orderCount <= 3) frequencyBuckets['2-3']++;
      else if (orderCount <= 10) frequencyBuckets['4-10']++;
      else frequencyBuckets['10+']++;

      // Basit RFM segment
      let segment: string;
      if (orderCount >= 4 && daysSinceLastPurchase <= 30) {
        segment = 'CHAMPION';
        segments.champions++;
      } else if (orderCount >= 2 && daysSinceLastPurchase <= 60) {
        segment = 'LOYAL';
        segments.loyal++;
      } else if (orderCount >= 2 && daysSinceLastPurchase > 60 && daysSinceLastPurchase <= 120) {
        segment = 'AT_RISK';
        segments.atRisk++;
      } else {
        segment = 'LOST';
        segments.lost++;
      }

      return {
        phoneNumber: row.phoneNumber,
        orderCount,
        totalSpent,
        lastPurchase: lastPurchase.toISOString(),
        daysSinceLastPurchase,
        segment,
      };
    });

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      period: { startDate: query.startDate ?? null, endDate: query.endDate ?? null },
      totalCustomers: customers.length,
      frequencyBuckets,
      segments,
      customers,
    };
  }

  // =========================================================================
  // P-3: ABC Analizi (Pareto)
  // =========================================================================
  async getABCAnalysisReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);
    const pagination = this.resolvePagination(query.page, query.limit);

    const qb = this.getSaleLineRepo(manager)
      .createQueryBuilder('line')
      .innerJoin('line.sale', 'sale')
      .innerJoin('line.productVariant', 'variant')
      .innerJoin('variant.product', 'product')
      .select('variant.id', 'productVariantId')
      .addSelect('variant.name', 'variantName')
      .addSelect('variant.code', 'variantCode')
      .addSelect('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('COALESCE(SUM(COALESCE(line."lineTotal", 0)), 0)', 'revenue')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
      .groupBy('variant.id')
      .addGroupBy('variant.name')
      .addGroupBy('variant.code')
      .addGroupBy('product.id')
      .addGroupBy('product.name')
      .orderBy('"revenue"', 'DESC');

    if (scope.storeIds?.length) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(qb, 'sale', 'createdAt', start, end);

    const rows = await qb.getRawMany();

    const totalRevenue = rows.reduce((s, r) => s + this.toNumber(r.revenue), 0);
    let cumulative = 0;

    const mapped = rows.map((row) => {
      const revenue = this.toNumber(row.revenue);
      const revenuePercent = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0;
      cumulative += revenuePercent;
      const abcClass = cumulative <= 80 ? 'A' : cumulative <= 95 ? 'B' : 'C';

      return {
        productId: row.productId,
        productName: row.productName,
        productVariantId: row.productVariantId,
        variantName: row.variantName,
        variantCode: row.variantCode,
        revenue,
        revenuePercent: Math.round(revenuePercent * 100) / 100,
        cumulativePercent: Math.round(cumulative * 100) / 100,
        abcClass,
      };
    });

    const classSummary = {
      A: { count: 0, revenue: 0 },
      B: { count: 0, revenue: 0 },
      C: { count: 0, revenue: 0 },
    };

    for (const item of mapped) {
      classSummary[item.abcClass as 'A' | 'B' | 'C'].count++;
      classSummary[item.abcClass as 'A' | 'B' | 'C'].revenue += item.revenue;
    }

    const total = mapped.length;
    const data = pagination.hasPagination
      ? mapped.slice(pagination.skip, pagination.skip + pagination.limit)
      : mapped;

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      period: { startDate: query.startDate ?? null, endDate: query.endDate ?? null },
      totalRevenue,
      classSummary,
      data,
      ...(pagination.hasPagination
        ? { meta: { total, limit: pagination.limit, page: pagination.page, totalPages: Math.ceil(total / pagination.limit) } }
        : {}),
    };
  }

  // =========================================================================
  // P-4: Varyant Karşılaştırması (Variant Comparison)
  // =========================================================================
  async getVariantComparisonReport(productId: string, query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);

    // Satis verileri
    const salesQb = this.getSaleLineRepo(manager)
      .createQueryBuilder('line')
      .innerJoin('line.sale', 'sale')
      .innerJoin('line.productVariant', 'variant')
      .select('variant.id', 'productVariantId')
      .addSelect('variant.name', 'variantName')
      .addSelect('variant.code', 'variantCode')
      .addSelect('COALESCE(SUM(line.quantity), 0)', 'soldQuantity')
      .addSelect('COALESCE(SUM(COALESCE(line."lineTotal", 0)), 0)', 'revenue')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
      .andWhere('variant.productId = :productId', { productId })
      .groupBy('variant.id')
      .addGroupBy('variant.name')
      .addGroupBy('variant.code')
      .orderBy('"revenue"', 'DESC');

    if (scope.storeIds?.length) {
      salesQb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(salesQb, 'sale', 'createdAt', start, end);

    const salesRows = await salesQb.getRawMany();

    // Stok verileri
    const stockQb = this.getStockSummaryRepo(manager)
      .createQueryBuilder('s')
      .innerJoin('s.productVariant', 'variant')
      .select('variant.id', 'productVariantId')
      .addSelect('COALESCE(SUM(s.quantity), 0)', 'totalStock')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s."isActiveStore" = true')
      .andWhere('variant.productId = :productId', { productId })
      .groupBy('variant.id');

    if (scope.storeIds?.length) {
      stockQb.andWhere('s.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    const stockRows = await stockQb.getRawMany();
    const stockMap = new Map<string, number>();
    for (const r of stockRows) {
      stockMap.set(r.productVariantId, this.toNumber(r.totalStock));
    }

    const totalRevenue = salesRows.reduce((s, r) => s + this.toNumber(r.revenue), 0);

    const data = salesRows.map((row) => {
      const revenue = this.toNumber(row.revenue);
      return {
        productVariantId: row.productVariantId,
        variantName: row.variantName,
        variantCode: row.variantCode,
        soldQuantity: this.toNumber(row.soldQuantity),
        revenue,
        revenueShare: totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 10000) / 100 : 0,
        currentStock: stockMap.get(row.productVariantId) ?? 0,
      };
    });

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      period: { startDate: query.startDate ?? null, endDate: query.endDate ?? null },
      productId,
      totalRevenue,
      data,
    };
  }

  // =========================================================================
  // PR-2: Mağaza Fiyat Karşılaştırması (Cross-Store Price Comparison)
  // =========================================================================
  async getStorePriceComparisonReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const pagination = this.resolvePagination(query.page, query.limit);
    const search = query.search?.trim();

    const repo = manager ? manager.getRepository(StoreProductPrice) : this.priceRepo;

    const qb = repo
      .createQueryBuilder('p')
      .innerJoin('p.store', 'store')
      .innerJoin('p.productVariant', 'variant')
      .innerJoin('variant.product', 'product')
      .select('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('variant.id', 'productVariantId')
      .addSelect('variant.name', 'variantName')
      .addSelect('variant.code', 'variantCode')
      .addSelect('variant."defaultSalePrice"', 'defaultSalePrice')
      .addSelect('store.id', 'storeId')
      .addSelect('store.name', 'storeName')
      .addSelect('p."salePrice"', 'storePrice')
      .addSelect('p."discountPercent"', 'discountPercent')
      .addSelect('p."taxPercent"', 'taxPercent')
      .where('p.tenantId = :tenantId', { tenantId })
      .orderBy('product.name', 'ASC')
      .addOrderBy('variant.name', 'ASC')
      .addOrderBy('store.name', 'ASC');

    if (scope.storeIds?.length) {
      qb.andWhere('p.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    if (search) {
      qb.andWhere(
        '(product.name ILIKE :search OR variant.name ILIKE :search OR variant.code ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getRawMany();

    const mapped = rows.map((row) => {
      const defaultPrice = this.toNumber(row.defaultSalePrice);
      const storePrice = row.storePrice !== null ? this.toNumber(row.storePrice) : null;
      return {
        productId: row.productId,
        productName: row.productName,
        productVariantId: row.productVariantId,
        variantName: row.variantName,
        variantCode: row.variantCode,
        storeId: row.storeId,
        storeName: row.storeName,
        defaultSalePrice: defaultPrice,
        storePrice,
        hasCustomPrice: storePrice !== null,
        priceDifference: storePrice !== null ? storePrice - defaultPrice : 0,
        discountPercent: row.discountPercent !== null ? this.toNumber(row.discountPercent) : null,
        taxPercent: row.taxPercent !== null ? this.toNumber(row.taxPercent) : null,
      };
    });

    const total = mapped.length;
    const data = pagination.hasPagination
      ? mapped.slice(pagination.skip, pagination.skip + pagination.limit)
      : mapped;

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      data,
      ...(pagination.hasPagination
        ? { meta: { total, limit: pagination.limit, page: pagination.page, totalPages: Math.ceil(total / pagination.limit) } }
        : {}),
    };
  }

  // =========================================================================
  // PR-3: İndirim Bandı Analizi (Sales by Discount Band)
  // =========================================================================
  async getSalesByDiscountBandReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);

    const discountPercentExpr = `COALESCE(line."discountPercent", 0)`;

    const bandExpr = `CASE
      WHEN ${discountPercentExpr} = 0 THEN '0%'
      WHEN ${discountPercentExpr} > 0 AND ${discountPercentExpr} <= 10 THEN '1-10%'
      WHEN ${discountPercentExpr} > 10 AND ${discountPercentExpr} <= 20 THEN '11-20%'
      WHEN ${discountPercentExpr} > 20 AND ${discountPercentExpr} <= 30 THEN '21-30%'
      WHEN ${discountPercentExpr} > 30 AND ${discountPercentExpr} <= 50 THEN '31-50%'
      ELSE '50%+'
    END`;

    const qb = this.getSaleLineRepo(manager)
      .createQueryBuilder('line')
      .innerJoin('line.sale', 'sale')
      .select(bandExpr, 'discountBand')
      .addSelect('COUNT(DISTINCT sale.id)', 'saleCount')
      .addSelect('COALESCE(SUM(COALESCE(line."lineTotal", 0)), 0)', 'revenue')
      .addSelect(
        `COALESCE(SUM(CASE
          WHEN line."discountAmount" IS NOT NULL THEN line."discountAmount"
          WHEN line."discountPercent" IS NOT NULL THEN (COALESCE(line."unitPrice", 0) * COALESCE(line."quantity", 0) * line."discountPercent" / 100)
          ELSE 0
        END), 0)`,
        'totalDiscount',
      )
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
      .groupBy(bandExpr)
      .orderBy(bandExpr, 'ASC');

    if (scope.storeIds?.length) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(qb, 'sale', 'createdAt', start, end);

    const rows = await qb.getRawMany();

    const totalRevenue = rows.reduce((s, r) => s + this.toNumber(r.revenue), 0);

    const data = rows.map((row) => {
      const revenue = this.toNumber(row.revenue);
      return {
        discountBand: row.discountBand,
        saleCount: this.toNumber(row.saleCount),
        revenue,
        totalDiscount: this.toNumber(row.totalDiscount),
        revenueShare: totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 10000) / 100 : 0,
      };
    });

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      period: { startDate: query.startDate ?? null, endDate: query.endDate ?? null },
      totalRevenue,
      data,
    };
  }

  // =========================================================================
  // I-2: Stok Yaşlanma Raporu (Stock Aging)
  // =========================================================================
  async getStockAgingReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);

    // Son giris hareketi tarihlerini al (FIFO proxy)
    const qb = this.getMovementRepo(manager)
      .createQueryBuilder('m')
      .innerJoin('m.productVariant', 'variant')
      .innerJoin('variant.product', 'product')
      .select('variant.id', 'productVariantId')
      .addSelect('variant.name', 'variantName')
      .addSelect('variant.code', 'variantCode')
      .addSelect('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('MAX(m."createdAt")', 'lastInDate')
      .where('m.tenantId = :tenantId', { tenantId })
      .andWhere('m.type = :type', { type: 'IN' })
      .groupBy('variant.id')
      .addGroupBy('variant.name')
      .addGroupBy('variant.code')
      .addGroupBy('product.id')
      .addGroupBy('product.name');

    if (scope.storeIds?.length) {
      qb.andWhere('m.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    const movementRows = await qb.getRawMany();
    const lastInMap = new Map<string, Date>();
    for (const r of movementRows) {
      lastInMap.set(r.productVariantId, new Date(r.lastInDate));
    }

    // Mevcut stoklar
    const stockQb = this.getStockSummaryRepo(manager)
      .createQueryBuilder('s')
      .innerJoin('s.productVariant', 'variant')
      .innerJoin('variant.product', 'product')
      .select('variant.id', 'productVariantId')
      .addSelect('variant.name', 'variantName')
      .addSelect('variant.code', 'variantCode')
      .addSelect('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('variant."defaultPurchasePrice"', 'purchasePrice')
      .addSelect('COALESCE(SUM(s.quantity), 0)', 'currentStock')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s."isActiveStore" = true')
      .having('COALESCE(SUM(s.quantity), 0) > 0')
      .groupBy('variant.id')
      .addGroupBy('variant.name')
      .addGroupBy('variant.code')
      .addGroupBy('product.id')
      .addGroupBy('product.name')
      .addGroupBy('variant."defaultPurchasePrice"');

    if (scope.storeIds?.length) {
      stockQb.andWhere('s.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    const stockRows = await stockQb.getRawMany();

    const now = new Date();
    const agingBuckets = {
      '0-30': { quantity: 0, value: 0 },
      '31-60': { quantity: 0, value: 0 },
      '61-90': { quantity: 0, value: 0 },
      '91-180': { quantity: 0, value: 0 },
      '180+': { quantity: 0, value: 0 },
    };

    for (const row of stockRows) {
      const lastIn = lastInMap.get(row.productVariantId);
      const daysInStock = lastIn
        ? Math.floor((now.getTime() - lastIn.getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      const qty = this.toNumber(row.currentStock);
      const value = qty * this.toNumber(row.purchasePrice);

      let bucket: keyof typeof agingBuckets;
      if (daysInStock <= 30) bucket = '0-30';
      else if (daysInStock <= 60) bucket = '31-60';
      else if (daysInStock <= 90) bucket = '61-90';
      else if (daysInStock <= 180) bucket = '91-180';
      else bucket = '180+';

      agingBuckets[bucket].quantity += qty;
      agingBuckets[bucket].value += value;
    }

    const totalQuantity = Object.values(agingBuckets).reduce((s, b) => s + b.quantity, 0);
    const totalValue = Object.values(agingBuckets).reduce((s, b) => s + b.value, 0);

    const data = Object.entries(agingBuckets).map(([range, bucket]) => ({
      range,
      quantity: bucket.quantity,
      estimatedValue: Math.round(bucket.value * 100) / 100,
      quantityPercent: totalQuantity > 0 ? Math.round((bucket.quantity / totalQuantity) * 10000) / 100 : 0,
      valuePercent: totalValue > 0 ? Math.round((bucket.value / totalValue) * 10000) / 100 : 0,
    }));

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      totals: {
        totalQuantity,
        totalValue: Math.round(totalValue * 100) / 100,
      },
      data,
    };
  }

  // =========================================================================
  // I-3: Yeniden Sipariş Noktası Analizi (Reorder Analysis)
  // =========================================================================
  async getReorderAnalysisReport(query: ReorderQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const pagination = this.resolvePagination(query.page, query.limit);
    const safetyStockDays = query.safetyStockDays ?? 7;
    const search = query.search?.trim();

    const periodStart = new Date();
    periodStart.setUTCDate(periodStart.getUTCDate() - 30);

    // Stok
    const stockQb = this.getStockSummaryRepo(manager)
      .createQueryBuilder('s')
      .innerJoin('s.productVariant', 'variant')
      .innerJoin('variant.product', 'product')
      .innerJoin('s.store', 'store')
      .select('variant.id', 'productVariantId')
      .addSelect('variant.name', 'variantName')
      .addSelect('variant.code', 'variantCode')
      .addSelect('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('store.id', 'storeId')
      .addSelect('store.name', 'storeName')
      .addSelect('s.quantity', 'currentStock')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s."isActiveStore" = true')
      .orderBy('product.name', 'ASC')
      .addOrderBy('variant.name', 'ASC')
      .addOrderBy('store.name', 'ASC');

    if (scope.storeIds?.length) {
      stockQb.andWhere('s.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    if (search) {
      stockQb.andWhere(
        '(product.name ILIKE :search OR variant.name ILIKE :search OR variant.code ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const stockRows = await stockQb.getRawMany();

    // Son 30 gün satış (variant + store bazında)
    const soldQb = this.getSaleLineRepo(manager)
      .createQueryBuilder('line')
      .innerJoin('line.sale', 'sale')
      .select('line.productVariantId', 'variantId')
      .addSelect('sale.storeId', 'storeId')
      .addSelect('COALESCE(SUM(line.quantity), 0)', 'soldQuantity')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
      .andWhere('sale."createdAt" >= :periodStart', { periodStart })
      .groupBy('line.productVariantId')
      .addGroupBy('sale.storeId');

    if (scope.storeIds?.length) {
      soldQb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    const soldRows = await soldQb.getRawMany();
    const soldMap = new Map<string, number>();
    for (const r of soldRows) {
      soldMap.set(`${r.variantId}__${r.storeId}`, this.toNumber(r.soldQuantity));
    }

    const allItems = stockRows.map((row) => {
      const currentStock = this.toNumber(row.currentStock);
      const key = `${row.productVariantId}__${row.storeId}`;
      const soldLast30 = soldMap.get(key) ?? 0;
      const dailyAvgSales = soldLast30 / 30;
      const supplyDays = dailyAvgSales > 0 ? Math.round(currentStock / dailyAvgSales) : null;
      const reorderPoint = Math.ceil(dailyAvgSales * safetyStockDays);
      const urgency =
        supplyDays !== null && supplyDays <= safetyStockDays
          ? 'CRITICAL'
          : supplyDays !== null && supplyDays <= safetyStockDays * 2
            ? 'WARNING'
            : 'NORMAL';

      return {
        productId: row.productId,
        productName: row.productName,
        productVariantId: row.productVariantId,
        variantName: row.variantName,
        variantCode: row.variantCode,
        storeId: row.storeId,
        storeName: row.storeName,
        currentStock,
        dailyAvgSales: Math.round(dailyAvgSales * 100) / 100,
        supplyDays,
        reorderPoint,
        urgency,
      };
    });

    // Sirala: CRITICAL first
    const urgencyOrder = { CRITICAL: 0, WARNING: 1, NORMAL: 2 };
    allItems.sort(
      (a, b) =>
        urgencyOrder[a.urgency as keyof typeof urgencyOrder] -
        urgencyOrder[b.urgency as keyof typeof urgencyOrder],
    );

    const total = allItems.length;
    const data = pagination.hasPagination
      ? allItems.slice(pagination.skip, pagination.skip + pagination.limit)
      : allItems;

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      safetyStockDays,
      data,
      summary: {
        critical: allItems.filter((i) => i.urgency === 'CRITICAL').length,
        warning: allItems.filter((i) => i.urgency === 'WARNING').length,
        normal: allItems.filter((i) => i.urgency === 'NORMAL').length,
      },
      ...(pagination.hasPagination
        ? { meta: { total, limit: pagination.limit, page: pagination.page, totalPages: Math.ceil(total / pagination.limit) } }
        : {}),
    };
  }

  // =========================================================================
  // T-2: Mevsimsel Analiz (Seasonality)
  // =========================================================================
  async getSeasonalityReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);

    const qb = this.getSaleRepo(manager)
      .createQueryBuilder('sale')
      .select('EXTRACT(YEAR FROM sale."createdAt")', 'year')
      .addSelect('EXTRACT(MONTH FROM sale."createdAt")', 'month')
      .addSelect('COUNT(sale.id)', 'saleCount')
      .addSelect('COALESCE(SUM(sale."lineTotal"), 0)', 'totalRevenue')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
      .groupBy('EXTRACT(YEAR FROM sale."createdAt")')
      .addGroupBy('EXTRACT(MONTH FROM sale."createdAt")')
      .orderBy('year', 'ASC')
      .addOrderBy('month', 'ASC');

    if (scope.storeIds?.length) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    const rows = await qb.getRawMany();

    const data = rows.map((row) => ({
      year: this.toNumber(row.year),
      month: this.toNumber(row.month),
      saleCount: this.toNumber(row.saleCount),
      totalRevenue: this.toNumber(row.totalRevenue),
    }));

    // YoY hesapla
    const byMonth = new Map<number, { year: number; revenue: number }[]>();
    for (const item of data) {
      if (!byMonth.has(item.month)) byMonth.set(item.month, []);
      byMonth.get(item.month)!.push({ year: item.year, revenue: item.totalRevenue });
    }

    const monthlyAvg = Array.from(byMonth.entries()).map(([month, entries]) => {
      const avgRevenue = entries.reduce((s, e) => s + e.revenue, 0) / entries.length;
      return { month, avgRevenue: Math.round(avgRevenue * 100) / 100, dataPoints: entries.length };
    });

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      data,
      monthlyAverage: monthlyAvg,
    };
  }

  // =========================================================================
  // T-3: Haftalık Performans Karşılaştırması (Week-over-Week)
  // =========================================================================
  async getWeekComparisonReport(query: WeekComparisonQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const weeks = query.weeks ?? 4;

    const now = new Date();
    const periodStart = new Date(now);
    periodStart.setUTCDate(periodStart.getUTCDate() - weeks * 7);

    const qb = this.getSaleRepo(manager)
      .createQueryBuilder('sale')
      .select(`TO_CHAR(DATE_TRUNC('week', sale."createdAt"), 'IYYY-"W"IW')`, 'week')
      .addSelect('COUNT(sale.id)', 'saleCount')
      .addSelect('COALESCE(SUM(sale."lineTotal"), 0)', 'totalRevenue')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
      .andWhere('sale."createdAt" >= :periodStart', { periodStart })
      .groupBy(`TO_CHAR(DATE_TRUNC('week', sale."createdAt"), 'IYYY-"W"IW')`)
      .orderBy('week', 'ASC');

    if (scope.storeIds?.length) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    const rows = await qb.getRawMany();

    const data = rows.map((row, idx) => {
      const saleCount = this.toNumber(row.saleCount);
      const totalRevenue = this.toNumber(row.totalRevenue);
      const prevRevenue = idx > 0 ? this.toNumber(rows[idx - 1].totalRevenue) : null;
      const changePercent = prevRevenue !== null ? this.calculateChangePercent(totalRevenue, prevRevenue) : null;

      return {
        week: row.week,
        saleCount,
        totalRevenue,
        changePercent,
        trend: changePercent === null ? null : changePercent > 0 ? 'INCREASE' : changePercent < 0 ? 'DECREASE' : 'SAME',
      };
    });

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      weeks,
      data,
    };
  }

  // =========================================================================
  // TR-1: Mağazalar Arası Transfer Analizi
  // =========================================================================
  async getTransferAnalysisReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);
    const pagination = this.resolvePagination(query.page, query.limit);

    const repo = manager ? manager.getRepository(StockTransfer) : this.transferRepo;

    const qb = repo
      .createQueryBuilder('t')
      .innerJoin('t.tenant', 'tenant')
      .innerJoin('t.fromStore', 'fromStore')
      .innerJoin('t.toStore', 'toStore')
      .leftJoinAndSelect('t.lines', 'line')
      .leftJoin('line.productVariant', 'variant')
      .where('tenant.id = :tenantId', { tenantId })
      .orderBy('t."createdAt"', 'DESC');

    if (scope.storeIds?.length) {
      qb.andWhere(
        '(t."fromStoreId" IN (:...storeIds) OR t."toStoreId" IN (:...storeIds))',
        { storeIds: scope.storeIds },
      );
    }

    if (start) {
      qb.andWhere('t."createdAt" >= :start', { start });
    }
    if (end) {
      qb.andWhere('t."createdAt" <= :end', { end });
    }

    const total = await qb.getCount();
    if (pagination.hasPagination) {
      qb.skip(pagination.skip).take(pagination.limit);
    }

    const transfers = await qb.getMany();

    // Magaza bazli toplam
    const storeFlowMap = new Map<string, { sent: number; received: number; storeName: string }>();

    const data = transfers.map((t) => {
      const totalQty = (t.lines ?? []).reduce((s, l) => s + this.toNumber(l.quantity), 0);

      // Gonderici
      const fromKey = t.fromStore.id;
      if (!storeFlowMap.has(fromKey)) storeFlowMap.set(fromKey, { sent: 0, received: 0, storeName: t.fromStore.name });
      storeFlowMap.get(fromKey)!.sent += totalQty;

      // Alici
      const toKey = t.toStore.id;
      if (!storeFlowMap.has(toKey)) storeFlowMap.set(toKey, { sent: 0, received: 0, storeName: t.toStore.name });
      storeFlowMap.get(toKey)!.received += totalQty;

      return {
        transferId: t.id,
        status: t.status,
        createdAt: t.createdAt,
        note: t.note,
        fromStore: { id: t.fromStore.id, name: t.fromStore.name },
        toStore: { id: t.toStore.id, name: t.toStore.name },
        totalQuantity: totalQty,
        lineCount: (t.lines ?? []).length,
      };
    });

    const storeFlows = Array.from(storeFlowMap.entries()).map(([storeId, flow]) => ({
      storeId,
      storeName: flow.storeName,
      totalSent: flow.sent,
      totalReceived: flow.received,
      netFlow: flow.received - flow.sent,
    }));

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      period: { startDate: query.startDate ?? null, endDate: query.endDate ?? null },
      data,
      storeFlows,
      ...(pagination.hasPagination
        ? { meta: { total, limit: pagination.limit, page: pagination.page, totalPages: Math.ceil(total / pagination.limit) } }
        : {}),
    };
  }

  // =========================================================================
  // TAX-2: Satış Denetim Kaydı (Audit Trail)
  // =========================================================================
  async getAuditTrailReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);
    const pagination = this.resolvePagination(query.page, query.limit);

    const qb = this.getSaleRepo(manager)
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.store', 'store')
      .leftJoinAndSelect('sale.lines', 'line')
      .leftJoinAndSelect('line.productVariant', 'variant')
      .leftJoin(User, 'creator', 'creator.id = sale."createdById"')
      .leftJoin(User, 'canceller', 'canceller.id = sale."cancelledById"')
      .addSelect('creator.name', 'creatorName')
      .addSelect('creator.surname', 'creatorSurname')
      .addSelect('canceller.name', 'cancellerName')
      .addSelect('canceller.surname', 'cancellerSurname')
      .where('sale.tenantId = :tenantId', { tenantId })
      .orderBy('sale."createdAt"', 'DESC');

    if (scope.storeIds?.length) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(qb, 'sale', 'createdAt', start, end);

    const total = await qb.getCount();
    if (pagination.hasPagination) {
      qb.skip(pagination.skip).take(pagination.limit);
    }

    const rawAndEntities = await qb.getRawAndEntities();

    const data = rawAndEntities.entities.map((sale, idx) => {
      const raw = rawAndEntities.raw[idx];
      return {
        saleId: sale.id,
        receiptNo: sale.receiptNo,
        status: sale.status,
        createdAt: sale.createdAt,
        cancelledAt: sale.cancelledAt,
        store: sale.store ? { id: sale.store.id, name: sale.store.name } : null,
        customer: {
          name: sale.name,
          surname: sale.surname,
          phoneNumber: sale.phoneNumber,
          email: sale.email,
        },
        unitPrice: this.toNumber(sale.unitPrice),
        lineTotal: this.toNumber(sale.lineTotal),
        createdBy: raw.creatorName ? `${raw.creatorName} ${raw.creatorSurname}` : sale.createdById,
        cancelledBy: raw.cancellerName ? `${raw.cancellerName} ${raw.cancellerSurname}` : sale.cancelledById,
        lines: (sale.lines ?? []).map((line) => ({
          variantName: line.productVariant?.name,
          variantCode: line.productVariant?.code,
          quantity: this.toNumber(line.quantity),
          unitPrice: this.toNumber(line.unitPrice),
          lineTotal: this.toNumber(line.lineTotal),
          campaignCode: line.campaignCode,
        })),
      };
    });

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      period: { startDate: query.startDate ?? null, endDate: query.endDate ?? null },
      data,
      ...(pagination.hasPagination
        ? { meta: { total, limit: pagination.limit, page: pagination.page, totalPages: Math.ceil(total / pagination.limit) } }
        : {}),
    };
  }

  // =========================================================================
  // TAX-3: İndirim ve İskonto Özeti (Discount Summary)
  // =========================================================================
  async getDiscountSummaryReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);

    const discountExpr = `CASE
      WHEN line."discountAmount" IS NOT NULL THEN line."discountAmount"
      WHEN line."discountPercent" IS NOT NULL THEN (COALESCE(line."unitPrice", 0) * COALESCE(line."quantity", 0) * line."discountPercent" / 100)
      ELSE 0
    END`;

    // Kampanya bazli
    const byCampaignQb = this.getSaleLineRepo(manager)
      .createQueryBuilder('line')
      .innerJoin('line.sale', 'sale')
      .select('COALESCE(line."campaignCode", \'NO_CAMPAIGN\')', 'campaignCode')
      .addSelect(`COALESCE(SUM(${discountExpr}), 0)`, 'totalDiscount')
      .addSelect('COUNT(DISTINCT sale.id)', 'saleCount')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
      .groupBy('COALESCE(line."campaignCode", \'NO_CAMPAIGN\')')
      .orderBy('"totalDiscount"', 'DESC');

    if (scope.storeIds?.length) {
      byCampaignQb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(byCampaignQb, 'sale', 'createdAt', start, end);

    const byCampaign = (await byCampaignQb.getRawMany()).map((r) => ({
      campaignCode: r.campaignCode,
      totalDiscount: this.toNumber(r.totalDiscount),
      saleCount: this.toNumber(r.saleCount),
    }));

    // Calisan bazli
    const byEmployeeQb = this.getSaleLineRepo(manager)
      .createQueryBuilder('line')
      .innerJoin('line.sale', 'sale')
      .leftJoin(User, 'u', 'u.id = sale."createdById"')
      .select('sale."createdById"', 'userId')
      .addSelect('u.name', 'userName')
      .addSelect('u.surname', 'userSurname')
      .addSelect(`COALESCE(SUM(${discountExpr}), 0)`, 'totalDiscount')
      .addSelect('COUNT(DISTINCT sale.id)', 'saleCount')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
      .groupBy('sale."createdById"')
      .addGroupBy('u.name')
      .addGroupBy('u.surname')
      .orderBy('"totalDiscount"', 'DESC');

    if (scope.storeIds?.length) {
      byEmployeeQb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(byEmployeeQb, 'sale', 'createdAt', start, end);

    const byEmployee = (await byEmployeeQb.getRawMany()).map((r) => ({
      userId: r.userId,
      userName: r.userName,
      userSurname: r.userSurname,
      totalDiscount: this.toNumber(r.totalDiscount),
      saleCount: this.toNumber(r.saleCount),
    }));

    // Magaza bazli
    const byStoreQb = this.getSaleLineRepo(manager)
      .createQueryBuilder('line')
      .innerJoin('line.sale', 'sale')
      .innerJoin('sale.store', 'store')
      .select('store.id', 'storeId')
      .addSelect('store.name', 'storeName')
      .addSelect(`COALESCE(SUM(${discountExpr}), 0)`, 'totalDiscount')
      .addSelect('COUNT(DISTINCT sale.id)', 'saleCount')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
      .groupBy('store.id')
      .addGroupBy('store.name')
      .orderBy('"totalDiscount"', 'DESC');

    if (scope.storeIds?.length) {
      byStoreQb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(byStoreQb, 'sale', 'createdAt', start, end);

    const byStore = (await byStoreQb.getRawMany()).map((r) => ({
      storeId: r.storeId,
      storeName: r.storeName,
      totalDiscount: this.toNumber(r.totalDiscount),
      saleCount: this.toNumber(r.saleCount),
    }));

    const totalDiscount =
      byCampaign.reduce((s, i) => s + i.totalDiscount, 0);

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      period: { startDate: query.startDate ?? null, endDate: query.endDate ?? null },
      totalDiscount,
      byCampaign,
      byEmployee,
      byStore,
    };
  }

  // =========================================================================
  // E-2: Çalışan Saatlik Performans (Hourly Performance)
  // =========================================================================
  async getEmployeeHourlyPerformanceReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const { start, end } = this.resolveDateRange(query.startDate, query.endDate);

    const qb = this.getSaleRepo(manager)
      .createQueryBuilder('sale')
      .leftJoin(User, 'u', 'u.id = sale."createdById"')
      .select('sale."createdById"', 'userId')
      .addSelect('u.name', 'userName')
      .addSelect('u.surname', 'userSurname')
      .addSelect('EXTRACT(HOUR FROM sale."createdAt")', 'hour')
      .addSelect('EXTRACT(DOW FROM sale."createdAt")', 'dow')
      .addSelect('COUNT(sale.id)', 'saleCount')
      .addSelect('COALESCE(SUM(sale."lineTotal"), 0)', 'totalRevenue')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
      .groupBy('sale."createdById"')
      .addGroupBy('u.name')
      .addGroupBy('u.surname')
      .addGroupBy('EXTRACT(HOUR FROM sale."createdAt")')
      .addGroupBy('EXTRACT(DOW FROM sale."createdAt")')
      .orderBy('sale."createdById"', 'ASC')
      .addOrderBy('dow', 'ASC')
      .addOrderBy('hour', 'ASC');

    if (scope.storeIds?.length) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    this.applyDateFilter(qb, 'sale', 'createdAt', start, end);

    const rows = await qb.getRawMany();

    // Calisan bazli gruplama
    const byEmployee = new Map<string, {
      userId: string;
      userName: string;
      userSurname: string;
      heatmap: { dayOfWeek: number; hour: number; saleCount: number; totalRevenue: number }[];
    }>();

    for (const row of rows) {
      const key = row.userId ?? 'unknown';
      if (!byEmployee.has(key)) {
        byEmployee.set(key, {
          userId: row.userId,
          userName: row.userName,
          userSurname: row.userSurname,
          heatmap: [],
        });
      }
      byEmployee.get(key)!.heatmap.push({
        dayOfWeek: this.toNumber(row.dow),
        hour: this.toNumber(row.hour),
        saleCount: this.toNumber(row.saleCount),
        totalRevenue: this.toNumber(row.totalRevenue),
      });
    }

    const data = Array.from(byEmployee.values());

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      period: { startDate: query.startDate ?? null, endDate: query.endDate ?? null },
      data,
    };
  }

  // =========================================================================
  // TR-2: Mağaza Stok Dengesi Optimizasyonu
  // =========================================================================
  async getTransferBalanceRecommendationReport(query: ReportScopeQueryDto, manager?: EntityManager) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await this.resolveScopedStoreIds(query.storeIds, manager);
    const pagination = this.resolvePagination(query.page, query.limit);

    const periodStart = new Date();
    periodStart.setUTCDate(periodStart.getUTCDate() - 30);

    // Varyant + magaza bazinda stok
    const stockQb = this.getStockSummaryRepo(manager)
      .createQueryBuilder('s')
      .innerJoin('s.productVariant', 'variant')
      .innerJoin('variant.product', 'product')
      .innerJoin('s.store', 'store')
      .select('variant.id', 'productVariantId')
      .addSelect('variant.name', 'variantName')
      .addSelect('variant.code', 'variantCode')
      .addSelect('product.name', 'productName')
      .addSelect('store.id', 'storeId')
      .addSelect('store.name', 'storeName')
      .addSelect('s.quantity', 'stock')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s."isActiveStore" = true');

    if (scope.storeIds?.length) {
      stockQb.andWhere('s.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    const stockRows = await stockQb.getRawMany();

    // Son 30 gun satis (variant + store)
    const soldQb = this.getSaleLineRepo(manager)
      .createQueryBuilder('line')
      .innerJoin('line.sale', 'sale')
      .select('line.productVariantId', 'variantId')
      .addSelect('sale.storeId', 'storeId')
      .addSelect('COALESCE(SUM(line.quantity), 0)', 'soldQuantity')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.CONFIRMED })
      .andWhere('sale."createdAt" >= :periodStart', { periodStart })
      .groupBy('line.productVariantId')
      .addGroupBy('sale.storeId');

    if (scope.storeIds?.length) {
      soldQb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
    }

    const soldRows = await soldQb.getRawMany();
    const soldMap = new Map<string, number>();
    for (const r of soldRows) {
      soldMap.set(`${r.variantId}__${r.storeId}`, this.toNumber(r.soldQuantity));
    }

    // Varyant bazinda gruplama
    const variantStoreMap = new Map<string, {
      productName: string;
      variantName: string;
      variantCode: string;
      stores: { storeId: string; storeName: string; stock: number; dailyAvgSales: number; supplyDays: number | null }[];
    }>();

    for (const row of stockRows) {
      const vid = row.productVariantId;
      if (!variantStoreMap.has(vid)) {
        variantStoreMap.set(vid, {
          productName: row.productName,
          variantName: row.variantName,
          variantCode: row.variantCode,
          stores: [],
        });
      }

      const stock = this.toNumber(row.stock);
      const sold = soldMap.get(`${vid}__${row.storeId}`) ?? 0;
      const dailyAvgSales = sold / 30;
      const supplyDays = dailyAvgSales > 0 ? Math.round(stock / dailyAvgSales) : null;

      variantStoreMap.get(vid)!.stores.push({
        storeId: row.storeId,
        storeName: row.storeName,
        stock,
        dailyAvgSales: Math.round(dailyAvgSales * 100) / 100,
        supplyDays,
      });
    }

    // Dengesizlik tespit (en az 2 magaza olan varyantlarda)
    const recommendations: any[] = [];

    for (const [variantId, info] of variantStoreMap.entries()) {
      if (info.stores.length < 2) continue;

      const supplyDays = info.stores
        .filter((s) => s.supplyDays !== null)
        .map((s) => s.supplyDays as number);

      if (supplyDays.length < 2) continue;

      const maxSupply = Math.max(...supplyDays);
      const minSupply = Math.min(...supplyDays);

      if (maxSupply - minSupply >= 14) {
        const fromStore = info.stores.find((s) => s.supplyDays === maxSupply)!;
        const toStore = info.stores.find((s) => s.supplyDays === minSupply)!;
        const suggestedQty = Math.max(1, Math.floor((fromStore.stock - toStore.stock) / 3));

        recommendations.push({
          productVariantId: variantId,
          productName: info.productName,
          variantName: info.variantName,
          variantCode: info.variantCode,
          fromStore: { id: fromStore.storeId, name: fromStore.storeName, stock: fromStore.stock, supplyDays: fromStore.supplyDays },
          toStore: { id: toStore.storeId, name: toStore.storeName, stock: toStore.stock, supplyDays: toStore.supplyDays },
          suggestedQuantity: suggestedQty,
          stores: info.stores,
        });
      }
    }

    recommendations.sort((a, b) => (a.toStore.supplyDays ?? 0) - (b.toStore.supplyDays ?? 0));

    const total = recommendations.length;
    const data = pagination.hasPagination
      ? recommendations.slice(pagination.skip, pagination.skip + pagination.limit)
      : recommendations;

    return {
      scope: { mode: scope.mode, storeIds: scope.storeIds },
      data,
      totalRecommendations: total,
      ...(pagination.hasPagination
        ? { meta: { total, limit: pagination.limit, page: pagination.page, totalPages: Math.ceil(total / pagination.limit) } }
        : {}),
    };
  }
}
