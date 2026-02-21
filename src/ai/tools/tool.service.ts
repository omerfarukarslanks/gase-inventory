import { Injectable } from '@nestjs/common';
import { InventoryService } from 'src/inventory/inventory.service';
import { ProductService } from 'src/product/product.service';
import { ReportsService } from 'src/reports/reports.service';
import { ToolCall, ToolResult } from './tool.type';

type DateRangeOptions = {
  defaultToCurrentMonth?: boolean;
};

const PRODUCT_SEARCH_STOP_WORDS = new Set([
  'urun',
  'urunun',
  'urunu',
  'urununun',
  'stok',
  'durum',
  'durumu',
  'durumunu',
  'goster',
  'gosterebilir',
  'gosterir',
  'ver',
  'getir',
  'bana',
  'lutfen',
]);

const PRODUCT_SEARCH_BATCH_SIZE = 3;

@Injectable()
export class ToolService {
  constructor(
    private readonly products: ProductService,
    private readonly inventory: InventoryService,
    private readonly reports: ReportsService,
  ) {}

  private asObject(value: unknown): Record<string, any> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, any>;
    }
    return {};
  }

  private parseTrimmedString(value: unknown): string | undefined {
    const raw = String(value ?? '').trim();
    return raw ? raw : undefined;
  }

  private parsePositiveInt(
    value: unknown,
    fallback: number,
    max = 100,
  ): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    const normalized = Math.trunc(parsed);
    if (normalized <= 0) {
      return fallback;
    }
    return Math.min(normalized, max);
  }

  private parsePositiveIntOrUndefined(
    value: unknown,
    max = 100,
  ): number | undefined {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }
    const normalized = Math.trunc(parsed);
    if (normalized <= 0) {
      return undefined;
    }
    return Math.min(normalized, max);
  }

  private parseOptionalNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private isIsoDate(value?: string): boolean {
    if (!value) {
      return false;
    }
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  private parseOptionalDate(value: unknown): string | undefined {
    const raw = this.parseTrimmedString(value);
    if (!raw) {
      return undefined;
    }
    if (!this.isIsoDate(raw)) {
      return undefined;
    }
    return raw;
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private getCurrentMonthRange(): { from: string; to: string } {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    );
    return { from: this.formatDate(from), to: this.formatDate(to) };
  }

  private parseStoreIds(value: unknown): string[] {
    if (value == null || value === '') {
      return [];
    }

    const isInvalid = (item: string) => {
      const lowered = item.toLowerCase();
      return lowered === 'null' || lowered === 'undefined';
    };

    if (Array.isArray(value)) {
      return Array.from(
        new Set(
          value
            .map((item) => String(item ?? '').trim())
            .filter((item) => item.length > 0 && !isInvalid(item)),
        ),
      );
    }

    const raw = String(value).trim();
    if (!raw) {
      return [];
    }

    return Array.from(
      new Set(
        raw
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0 && !isInvalid(item)),
      ),
    );
  }

  private isUuidV4(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private normalizeText(value: string): string {
    return value
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  private buildProductSearchCandidates(reference: string): string[] {
    const raw = reference.trim();
    if (!raw) {
      return [];
    }

    const normalized = this.normalizeText(raw);
    const words = normalized
      .split(/[\s,.;:/\\|()[\]{}"'`!?+-]+/)
      .map((part) => part.trim())
      .filter(Boolean);

    const filteredWords = words.filter(
      (word) => word.length >= 2 && !PRODUCT_SEARCH_STOP_WORDS.has(word),
    );

    const dedup = new Set<string>();
    const result: string[] = [];

    const push = (value?: string) => {
      if (!value) {
        return;
      }
      const cleaned = value.trim();
      if (!cleaned) {
        return;
      }
      const key = this.normalizeText(cleaned);
      if (!key || dedup.has(key)) {
        return;
      }
      dedup.add(key);
      result.push(cleaned);
    };

    push(raw);
    push(this.sanitizeProductReference(raw));
    push(filteredWords.join(' '));

    for (const word of filteredWords) {
      push(word);
    }

    return result;
  }

  private isPlaceholderRef(value: string): boolean {
    const raw = value.trim().toLowerCase();
    if (!raw) {
      return true;
    }

    if (
      (raw.startsWith('<') && raw.endsWith('>')) ||
      (raw.startsWith('{') && raw.endsWith('}'))
    ) {
      return true;
    }

    if (
      raw.includes('uuid') ||
      raw.includes('placeholder') ||
      raw.includes('product_id') ||
      raw.includes('productid')
    ) {
      return true;
    }

    return false;
  }

  private normalizePossibleWrappedUuid(value: string): string {
    const trimmed = value.trim();
    const unwrapped = trimmed.replace(/^<+|>+$/g, '');
    if (this.isUuidV4(unwrapped)) {
      return unwrapped;
    }
    return trimmed;
  }

  private sanitizeProductReference(value: string): string {
    return value
      .trim()
      .replace(/\s+(ürünün|ürünu?nün|urununun|urunün|ürünü|urunu)$/i, '')
      .replace(/^["'`]+|["'`]+$/g, '')
      .trim();
  }

  private extractProductReferenceFromText(text?: string): string | undefined {
    const raw = String(text ?? '').trim();
    if (!raw) {
      return undefined;
    }

    const cleaned = raw.replace(/[?.!]+$/g, '').trim();
    const patterns = [
      /^(.+?)\s+ürünün?\s+stok/i,
      /^(.+?)\s+urun[unınin]*\s+stok/i,
      /^(.+?)\s+stok\s+durum/i,
      /^(.+?)\s+stok/i,
    ];

    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match?.[1]) {
        const candidate = this.sanitizeProductReference(match[1]);
        if (candidate) {
          return candidate;
        }
      }
    }

    return undefined;
  }

  private resolveProductRefFromArgs(args: Record<string, any>): string | undefined {
    const directRefs = [
      this.parseTrimmedString(args.productId),
      this.parseTrimmedString(args.productName),
      this.parseTrimmedString(args.query),
      this.parseTrimmedString(args.product),
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) =>
        this.sanitizeProductReference(this.normalizePossibleWrappedUuid(value)),
      );

    const directUuid = directRefs.find((value) => this.isUuidV4(value));
    if (directUuid) {
      return directUuid;
    }

    const userQuery = this.parseTrimmedString(args.__userQuery);
    const inferredFromUser = this.extractProductReferenceFromText(userQuery);
    if (inferredFromUser && !this.isPlaceholderRef(inferredFromUser)) {
      return inferredFromUser;
    }

    const validDirect = directRefs.find((value) => !this.isPlaceholderRef(value));
    if (validDirect) {
      return validDirect;
    }

    return undefined;
  }

  private async searchProductsByCandidate(candidate: string): Promise<any[]> {
    const products = await this.products.findAll({
      page: 1,
      limit: 20,
      search: candidate,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    } as any);

    return Array.isArray(products?.data) ? products.data : [];
  }

  private async resolveProductIdByReference(
    reference: string,
  ): Promise<{
    productId?: string;
    productName?: string;
    candidates?: Array<{ id: string; name: string; sku?: string }>;
  }> {
    const ref = reference.trim();
    if (!ref) {
      return {};
    }

    if (this.isUuidV4(ref)) {
      return { productId: ref };
    }

    const candidates = this.buildProductSearchCandidates(ref);
    let rows: any[] = [];

    const firstBatch = candidates.slice(0, PRODUCT_SEARCH_BATCH_SIZE);
    if (firstBatch.length > 0) {
      const firstBatchResults = await Promise.all(
        firstBatch.map((candidate) => this.searchProductsByCandidate(candidate)),
      );

      for (const batchRows of firstBatchResults) {
        if (batchRows.length > 0) {
          rows = batchRows;
          break;
        }
      }
    }

    if (rows.length === 0 && candidates.length > PRODUCT_SEARCH_BATCH_SIZE) {
      for (const candidate of candidates.slice(PRODUCT_SEARCH_BATCH_SIZE)) {
        const candidateRows = await this.searchProductsByCandidate(candidate);
        if (candidateRows.length > 0) {
          rows = candidateRows;
          break;
        }
      }
    }

    if (rows.length === 0) {
      return {
        candidates: [],
      };
    }

    const normalizedRef = this.normalizeText(ref);
    const mappedCandidates = rows.map((item: any) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      normalizedName: this.normalizeText(String(item.name ?? '')),
      normalizedSku: item.sku ? this.normalizeText(String(item.sku)) : '',
    }));

    const exact =
      mappedCandidates.find(
        (item) =>
          item.normalizedName === normalizedRef ||
          item.normalizedSku === normalizedRef,
      ) ??
      mappedCandidates.find(
        (item) =>
          item.normalizedName.includes(normalizedRef) ||
          normalizedRef.includes(item.normalizedName),
      ) ??
      mappedCandidates[0];

    return {
      productId: exact?.id,
      productName: exact?.name,
      candidates: mappedCandidates
        .slice(0, 5)
        .map(({ id, name, sku }) => ({ id, name, sku })),
    };
  }

  private pickBestStockMatch(
    rows: any[],
    resolvedProductId: string | undefined,
    productRef: string,
  ): any | null {
    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    const normalizedRef = this.normalizeText(productRef);
    let best: any | null = null;
    let bestScore = -1;

    for (const row of rows) {
      let score = 0;
      if (resolvedProductId && row?.productId === resolvedProductId) {
        score = 3;
      } else {
        const normalizedName = this.normalizeText(String(row?.productName ?? ''));
        if (normalizedName === normalizedRef) {
          score = 2;
        } else if (
          normalizedName.includes(normalizedRef) ||
          normalizedRef.includes(normalizedName)
        ) {
          score = 1;
        }
      }

      if (score > bestScore) {
        best = row;
        bestScore = score;
        if (score === 3) {
          break;
        }
      }
    }

    return best;
  }

  private resolveStoreIds(args: Record<string, any>): string[] {
    const storeIds = this.parseStoreIds(args.storeIds);
    if (storeIds.length > 0) {
      return storeIds;
    }
    return this.parseStoreIds(args.storeId);
  }

  private resolveDateRange(
    args: Record<string, any>,
    options: DateRangeOptions = {},
  ): { from?: string; to?: string } {
    const from =
      this.parseOptionalDate(args.from) ?? this.parseOptionalDate(args.startDate);
    const to =
      this.parseOptionalDate(args.to) ?? this.parseOptionalDate(args.endDate);

    if (from || to) {
      return { from, to };
    }

    if (options.defaultToCurrentMonth) {
      const month = this.getCurrentMonthRange();
      return { from: month.from, to: month.to };
    }

    return {};
  }

  private resolveMonth(value: unknown): string {
    const raw = this.parseTrimmedString(value);
    if (raw && /^\d{4}-\d{2}$/.test(raw)) {
      return raw;
    }
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private buildScopeQuery(
    args: Record<string, any>,
    options: DateRangeOptions = {},
  ): Record<string, any> {
    const query: Record<string, any> = {};
    const { from, to } = this.resolveDateRange(args, options);
    const storeIds = this.resolveStoreIds(args);
    const search = this.parseTrimmedString(args.search);
    const page = this.parsePositiveIntOrUndefined(args.page, 10000);
    const limit = this.parsePositiveIntOrUndefined(args.limit, 100);

    if (from) {
      query.startDate = from;
    }
    if (to) {
      query.endDate = to;
    }
    if (storeIds.length > 0) {
      query.storeIds = storeIds;
    }
    if (search) {
      query.search = search;
    }
    if (page !== undefined) {
      query.page = page;
    }
    if (limit !== undefined) {
      query.limit = limit;
    }

    const compareDate = this.parseOptionalDate(args.compareDate);
    if (compareDate) {
      query.compareDate = compareDate;
    }

    return query;
  }

  private buildSalesFilterQuery(
    args: Record<string, any>,
    options: DateRangeOptions = {},
  ): Record<string, any> {
    const query = this.buildScopeQuery(args, options);
    const receiptNo = this.parseTrimmedString(args.receiptNo);
    const name = this.parseTrimmedString(args.name);
    const surname = this.parseTrimmedString(args.surname);
    const minLinePrice = this.parseOptionalNumber(args.minLinePrice);
    const maxLinePrice = this.parseOptionalNumber(args.maxLinePrice);

    if (receiptNo) {
      query.receiptNo = receiptNo;
    }
    if (name) {
      query.name = name;
    }
    if (surname) {
      query.surname = surname;
    }
    if (minLinePrice !== undefined) {
      query.minLinePrice = minLinePrice;
    }
    if (maxLinePrice !== undefined) {
      query.maxLinePrice = maxLinePrice;
    }

    return query;
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    try {
      const args = this.asObject(call.args);

      switch (call.name) {
        case 'search_products': {
          const query = this.parseTrimmedString(args.query);
          if (!query) {
            return { name: call.name, ok: false, error: 'query gerekli' };
          }

          const limit = this.parsePositiveInt(args.limit, 10, 50);
          const rows = await this.products.findAll({
            page: 1,
            limit,
            search: query,
            sortBy: 'createdAt',
            sortOrder: 'DESC',
          } as any);

          const data = (rows?.data ?? []).map((product: any) => ({
            id: product.id,
            name: product.name,
            sku: product.sku,
            defaultCurrency: product.defaultCurrency ?? null,
            defaultSalePrice:
              product.defaultSalePrice != null
                ? Number(product.defaultSalePrice)
                : null,
            isActive: product.isActive ?? null,
          }));

          return {
            name: call.name,
            ok: true,
            data,
            meta: { total: data.length, limit },
          };
        }

        case 'get_product_stock': {
          const productRef = this.resolveProductRefFromArgs(args);

          if (!productRef) {
            return {
              name: call.name,
              ok: false,
              error: 'productId veya productName/query gerekli',
            };
          }

          const resolved = await this.resolveProductIdByReference(productRef);
          if (!resolved.productId) {
            return {
              name: call.name,
              ok: false,
              error: `Urun bulunamadi: ${productRef}`,
            };
          }

          const storeIds = this.resolveStoreIds(args);
          const searchTerm =
            this.parseTrimmedString(resolved.productName) ??
            (this.isUuidV4(productRef) ? undefined : productRef);
          const summaryQuery: Record<string, any> = {
            storeIds: storeIds.length > 0 ? storeIds : undefined,
          };
          if (searchTerm) {
            summaryQuery.search = searchTerm;
          }
          const summary = await this.inventory.getStockSummary(summaryQuery as any);

          const stock = this.pickBestStockMatch(
            summary?.data ?? [],
            resolved.productId,
            productRef,
          );

          return {
            name: call.name,
            ok: true,
            data: stock,
            meta: {
              requested: productRef,
              resolvedProductId: resolved.productId,
              resolvedProductName: resolved.productName,
              candidates: resolved.candidates ?? [],
            },
          };
        }

        case 'sales_summary': {
          const query = this.buildScopeQuery(args, {
            defaultToCurrentMonth: true,
          });
          const data = await this.reports.getSalesSummaryReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'store_performance': {
          const query = this.buildScopeQuery(args, {
            defaultToCurrentMonth: true,
          });
          query.page ??= 1;
          query.limit ??= this.parsePositiveInt(args.limit, 10, 50);
          const data = await this.reports.getStorePerformanceReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'stock_summary': {
          const query = this.buildScopeQuery(args);
          query.page ??= 1;
          query.limit ??= this.parsePositiveInt(args.limit, 10, 100);
          const data = await this.reports.getStockSummaryReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'low_stock_alerts': {
          const query = this.buildScopeQuery(args);
          query.page ??= 1;
          query.limit ??= this.parsePositiveInt(args.limit, 10, 100);
          query.threshold = this.parseOptionalNumber(args.threshold) ?? 10;
          const data = await this.reports.getLowStockReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'total_stock_quantity_report': {
          const query = this.buildScopeQuery(args);
          const data = await this.reports.getTotalStockQuantityReport(
            query as any,
          );
          return { name: call.name, ok: true, data };
        }

        case 'confirmed_orders_total_report': {
          const query = this.buildSalesFilterQuery(args, {
            defaultToCurrentMonth: true,
          });
          const data = await this.reports.getTotalConfirmedOrdersReport(
            query as any,
          );
          return { name: call.name, ok: true, data };
        }

        case 'returned_orders_total_report': {
          const query = this.buildSalesFilterQuery(args, {
            defaultToCurrentMonth: true,
          });
          const data = await this.reports.getTotalReturnedOrdersReport(
            query as any,
          );
          return { name: call.name, ok: true, data };
        }

        case 'sales_by_product_report': {
          const query = this.buildScopeQuery(args, {
            defaultToCurrentMonth: true,
          });
          query.page ??= 1;
          query.limit ??= this.parsePositiveInt(args.limit, 10, 100);
          const data = await this.reports.getSalesByProductReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'inventory_movements_summary': {
          const query = this.buildScopeQuery(args);
          query.movementType = this.parseTrimmedString(args.movementType);
          query.productVariantId = this.parseTrimmedString(args.productVariantId);
          const data = await this.reports.getInventoryMovementsSummaryReport(
            query as any,
          );
          return { name: call.name, ok: true, data };
        }

        case 'sales_cancellations': {
          const query = this.buildSalesFilterQuery(args);
          query.page ??= 1;
          query.limit ??= this.parsePositiveInt(args.limit, 10, 100);
          const data = await this.reports.getSalesCancellationsReport(
            query as any,
          );
          return { name: call.name, ok: true, data };
        }

        case 'profit_margin_report': {
          const query = this.buildScopeQuery(args, {
            defaultToCurrentMonth: true,
          });
          query.page ??= 1;
          query.limit ??= this.parsePositiveInt(args.limit, 10, 100);
          const data = await this.reports.getProfitMarginReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'revenue_trend_report': {
          const query = this.buildScopeQuery(args, {
            defaultToCurrentMonth: true,
          });
          const groupBy = this.parseTrimmedString(args.groupBy);
          if (groupBy && ['day', 'week', 'month'].includes(groupBy)) {
            query.groupBy = groupBy;
          }
          const data = await this.reports.getRevenueTrendReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'tax_summary_report': {
          const query = this.buildScopeQuery(args, {
            defaultToCurrentMonth: true,
          });
          const data = await this.reports.getTaxSummaryReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'cogs_movement_report': {
          const query = this.buildScopeQuery(args, {
            defaultToCurrentMonth: true,
          });
          const data = await this.reports.getCOGSMovementReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'vat_summary_report': {
          const query = this.buildScopeQuery(args);
          query.month = this.resolveMonth(args.month);
          const breakdown = this.parseTrimmedString(args.breakdown);
          if (breakdown && ['day', 'store'].includes(breakdown)) {
            query.breakdown = breakdown;
          }
          const data = await this.reports.getVatSummaryReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'audit_trail_report': {
          const query = this.buildScopeQuery(args);
          query.page ??= 1;
          query.limit ??= this.parsePositiveInt(args.limit, 20, 100);
          const data = await this.reports.getAuditTrailReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'discount_summary_report': {
          const query = this.buildScopeQuery(args, {
            defaultToCurrentMonth: true,
          });
          const data = await this.reports.getDiscountSummaryReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'employee_sales_performance_report': {
          const query = this.buildScopeQuery(args, {
            defaultToCurrentMonth: true,
          });
          query.page ??= 1;
          query.limit ??= this.parsePositiveInt(args.limit, 10, 100);
          const data = await this.reports.getEmployeeSalesPerformanceReport(
            query as any,
          );
          return { name: call.name, ok: true, data };
        }

        case 'employee_hourly_performance_report': {
          const query = this.buildScopeQuery(args, {
            defaultToCurrentMonth: true,
          });
          const data = await this.reports.getEmployeeHourlyPerformanceReport(
            query as any,
          );
          return { name: call.name, ok: true, data };
        }

        case 'hourly_sales_report': {
          const query = this.buildScopeQuery(args, {
            defaultToCurrentMonth: true,
          });
          const data = await this.reports.getHourlySalesReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'seasonality_report': {
          const query = this.buildScopeQuery(args);
          const data = await this.reports.getSeasonalityReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'week_comparison_report': {
          const query = this.buildScopeQuery(args);
          const weeks = this.parsePositiveIntOrUndefined(args.weeks, 52);
          if (weeks !== undefined) {
            query.weeks = weeks;
          }
          const data = await this.reports.getWeekComparisonReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'product_performance_ranking_report': {
          const query = this.buildScopeQuery(args, {
            defaultToCurrentMonth: true,
          });
          query.page ??= 1;
          query.limit ??= this.parsePositiveInt(args.limit, 10, 100);
          const data = await this.reports.getProductPerformanceRankingReport(
            query as any,
          );
          return { name: call.name, ok: true, data };
        }

        case 'dead_stock_report': {
          const query = this.buildScopeQuery(args);
          const noSaleDays = this.parsePositiveIntOrUndefined(args.noSaleDays, 3650);
          if (noSaleDays !== undefined) {
            query.noSaleDays = noSaleDays;
          }
          query.page ??= 1;
          query.limit ??= this.parsePositiveInt(args.limit, 10, 100);
          const data = await this.reports.getDeadStockReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'abc_analysis_report': {
          const query = this.buildScopeQuery(args, {
            defaultToCurrentMonth: true,
          });
          const data = await this.reports.getABCAnalysisReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'variant_comparison_report': {
          const productId = this.parseTrimmedString(args.productId);
          if (!productId) {
            return { name: call.name, ok: false, error: 'productId gerekli' };
          }
          const query = this.buildScopeQuery(args, {
            defaultToCurrentMonth: true,
          });
          const data = await this.reports.getVariantComparisonReport(
            productId,
            query as any,
          );
          return { name: call.name, ok: true, data };
        }

        case 'top_customers_report': {
          const query = this.buildScopeQuery(args, {
            defaultToCurrentMonth: true,
          });
          query.page ??= 1;
          query.limit ??= this.parsePositiveInt(args.limit, 10, 100);
          const data = await this.reports.getTopCustomersReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'customer_purchase_history_report': {
          const query = this.buildScopeQuery(args);
          const phoneNumber = this.parseTrimmedString(args.phoneNumber);
          const email = this.parseTrimmedString(args.email);
          if (!phoneNumber && !email) {
            return {
              name: call.name,
              ok: false,
              error: 'phoneNumber veya email gerekli',
            };
          }
          if (phoneNumber) {
            query.phoneNumber = phoneNumber;
          }
          if (email) {
            query.email = email;
          }
          query.page ??= 1;
          query.limit ??= this.parsePositiveInt(args.limit, 20, 100);
          const data = await this.reports.getCustomerPurchaseHistoryReport(
            query as any,
          );
          return { name: call.name, ok: true, data };
        }

        case 'customer_frequency_report': {
          const query = this.buildScopeQuery(args, {
            defaultToCurrentMonth: true,
          });
          const data = await this.reports.getCustomerFrequencyReport(
            query as any,
          );
          return { name: call.name, ok: true, data };
        }

        case 'discount_effectiveness_report': {
          const query = this.buildScopeQuery(args, {
            defaultToCurrentMonth: true,
          });
          const data = await this.reports.getDiscountEffectivenessReport(
            query as any,
          );
          return { name: call.name, ok: true, data };
        }

        case 'store_price_comparison_report': {
          const query = this.buildScopeQuery(args);
          const productId = this.parseTrimmedString(args.productId);
          const productVariantId = this.parseTrimmedString(args.productVariantId);
          if (productId) {
            query.productId = productId;
          }
          if (productVariantId) {
            query.productVariantId = productVariantId;
          }
          const data = await this.reports.getStorePriceComparisonReport(
            query as any,
          );
          return { name: call.name, ok: true, data };
        }

        case 'sales_by_discount_band_report': {
          const query = this.buildScopeQuery(args, {
            defaultToCurrentMonth: true,
          });
          const data = await this.reports.getSalesByDiscountBandReport(
            query as any,
          );
          return { name: call.name, ok: true, data };
        }

        case 'stock_turnover_report': {
          const query = this.buildScopeQuery(args);
          const periodDays = this.parsePositiveIntOrUndefined(args.periodDays, 3650);
          if (periodDays !== undefined) {
            query.periodDays = periodDays;
          }
          query.page ??= 1;
          query.limit ??= this.parsePositiveInt(args.limit, 10, 100);
          const data = await this.reports.getStockTurnoverReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'stock_aging_report': {
          const query = this.buildScopeQuery(args);
          query.page ??= 1;
          query.limit ??= this.parsePositiveInt(args.limit, 10, 100);
          const data = await this.reports.getStockAgingReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'reorder_analysis_report': {
          const query = this.buildScopeQuery(args);
          const safetyStockDays = this.parsePositiveIntOrUndefined(
            args.safetyStockDays,
            3650,
          );
          if (safetyStockDays !== undefined) {
            query.safetyStockDays = safetyStockDays;
          }
          query.page ??= 1;
          query.limit ??= this.parsePositiveInt(args.limit, 10, 100);
          const data = await this.reports.getReorderAnalysisReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'transfer_analysis_report': {
          const query = this.buildScopeQuery(args);
          query.page ??= 1;
          query.limit ??= this.parsePositiveInt(args.limit, 10, 100);
          const data = await this.reports.getTransferAnalysisReport(query as any);
          return { name: call.name, ok: true, data };
        }

        case 'transfer_balance_recommendation_report': {
          const query = this.buildScopeQuery(args);
          query.page ??= 1;
          query.limit ??= this.parsePositiveInt(args.limit, 10, 100);
          const data = await this.reports.getTransferBalanceRecommendationReport(
            query as any,
          );
          return { name: call.name, ok: true, data };
        }

        default:
          return {
            name: call.name as any,
            ok: false,
            error: 'tool bulunamadi',
          };
      }
    } catch (error: any) {
      return {
        name: call.name,
        ok: false,
        error: error?.message ?? 'tool error',
      };
    }
  }
}
