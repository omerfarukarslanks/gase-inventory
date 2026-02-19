import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';

import { AppContextService } from '../common/context/app-context.service';
import { Sale, SaleStatus } from '../sales/sale.entity';
import { SaleLine } from '../sales/sale-line.entity';
import { Store } from 'src/store/store.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { StoreErrors } from 'src/common/errors/store.errors';
import { ReportsErrors } from 'src/common/errors/report.errors';
import { StoreVariantStock } from 'src/inventory/store-variant-stock.entity';
import { ReportScopeQueryDto } from './dto/report-scope-query.dto';
import { InventoryMovement } from 'src/inventory/inventory-movement.entity';

type ResolvedScope = {
  mode: 'context-store' | 'query-stores' | 'tenant';
  storeIds: string[] | null;
};

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(StoreVariantStock)
    private readonly stockSummaryRepo: Repository<StoreVariantStock>,
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(SaleLine)
    private readonly saleLineRepo: Repository<SaleLine>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(InventoryMovement)
    private readonly movementRepo: Repository<InventoryMovement>,
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
      .addSelect('COALESCE(SUM(sale."lineTotal"), 0)', 'totalLinePrice')
      .getRawOne<{
        orderCount: string;
        totalUnitPrice: string;
        totalLinePrice: string;
      }>();

    const dailyQb = buildFilteredQb();
    this.applyDateFilter(dailyQb, 'sale', dateField, range.start, range.end);

    const dailyRows = await dailyQb
      .clone()
      .select(`DATE(sale."${dateField}")`, 'day')
      .addSelect('COUNT(sale.id)', 'orderCount')
      .addSelect('COALESCE(SUM(sale."lineTotal"), 0)', 'totalLinePrice')
      .groupBy(`DATE(sale."${dateField}")`)
      .orderBy('day', 'ASC')
      .getRawMany<{
        day: string;
        orderCount: string;
        totalLinePrice: string;
      }>();

    const dailyMap = new Map<string, { orderCount: number; totalLinePrice: number }>();
    for (const row of dailyRows) {
      const dayKey = this.normalizeDayKey(row.day);
      if (!dayKey) {
        continue;
      }
      dailyMap.set(dayKey, {
        orderCount: this.toNumber(row.orderCount),
        totalLinePrice: this.toNumber(row.totalLinePrice),
      });
    }

    const dailyKeys =
      range.end >= range.start ? this.buildUtcDayList(range.start, range.end) : [];
    const daily = dailyKeys.map((day) => ({
      date: day,
      orderCount: dailyMap.get(day)?.orderCount ?? 0,
      totalLinePrice: dailyMap.get(day)?.totalLinePrice ?? 0,
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
        totalLinePrice: this.toNumber(summaryRow?.totalLinePrice),
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
            totalQuantity: number;
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
        totalQuantity: quantity,
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

    const total = await qb.getCount();
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
      totalUnitPrice: data.reduce((sum, item) => sum + item.unitPrice, 0),
      totalLineTotal: data.reduce((sum, item) => sum + item.lineTotal, 0),
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
}
