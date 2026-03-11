import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppContextService } from 'src/common/context/app-context.service';
import { ToolService } from './tools/tool.service';
import { ProcurementService } from 'src/procurement/procurement.service';
import { ApprovalService } from 'src/approval/approval.service';
import { ApprovalEntityType } from 'src/approval/entities/approval-request.entity';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import {
  AiActionStatus,
  AiActionSuggestion,
  AiActionType,
} from './entities/ai-action-suggestion.entity';
import { AnalyzeContextDto, ListAiSuggestionsQueryDto } from './dto/action-ai.dto';

const DEFAULT_REORDER_MULTIPLIER = 3; // mevcut stok × 3 = önerilen sipariş miktarı

@Injectable()
export class ActionAiService {
  constructor(
    @InjectRepository(AiActionSuggestion)
    private readonly repo: Repository<AiActionSuggestion>,
    private readonly appContext: AppContextService,
    private readonly toolService: ToolService,
    private readonly procurementService: ProcurementService,
    private readonly approvalService: ApprovalService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private tenantId() { return this.appContext.getTenantIdOrThrow(); }
  private userId()   { return this.appContext.getUserIdOrThrow(); }

  /**
   * Genel PENDING kontrol: belirli bir actionType + JSONB alanı kombinasyonu zaten var mı?
   * Demand forecast ve anomaly için storeId bazlı tekrar oluşturmayı önler.
   */
  private async pendingExists_generic(
    tenantId: string,
    actionType: AiActionType,
    jsonbKey: string,
    jsonbValue: string,
  ): Promise<boolean> {
    const count = await this.repo
      .createQueryBuilder('s')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s.actionType = :type', { type: actionType })
      .andWhere('s.status = :status', { status: AiActionStatus.PENDING })
      .andWhere(`s.suggestedData->>'${jsonbKey}' = :val`, { val: jsonbValue })
      .getCount();
    return count > 0;
  }

  /** PRICE_ADJUSTMENT: suggestedData->>'productVariantId' eşleşmesi */
  private async pendingExists_price(tenantId: string, variantId: string): Promise<boolean> {
    const count = await this.repo
      .createQueryBuilder('s')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s.actionType = :type', { type: AiActionType.PRICE_ADJUSTMENT })
      .andWhere('s.status = :status', { status: AiActionStatus.PENDING })
      .andWhere("s.suggestedData->>'productVariantId' = :variantId", { variantId })
      .getCount();
    return count > 0;
  }

  /** CREATE_PO_DRAFT: lines dizisinde productVariantId içeren kayıt var mı? */
  private async pendingExists_po(tenantId: string, storeId: string, variantId: string): Promise<boolean> {
    const count = await this.repo
      .createQueryBuilder('s')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s.actionType = :type', { type: AiActionType.CREATE_PO_DRAFT })
      .andWhere('s.status = :status', { status: AiActionStatus.PENDING })
      .andWhere("s.suggestedData->>'storeId' = :storeId", { storeId })
      .andWhere(
        `s.suggestedData->'lines' @> :lineFragment::jsonb`,
        { lineFragment: JSON.stringify([{ productVariantId: variantId }]) },
      )
      .getCount();
    return count > 0;
  }

  private async findOrThrow(id: string): Promise<AiActionSuggestion> {
    const s = await this.repo.findOne({ where: { id, tenantId: this.tenantId() } });
    if (!s) throw new NotFoundException(`AI öneri bulunamadı: ${id}`);
    return s;
  }

  // ── Öneri Listesi ─────────────────────────────────────────────────────────

  async list(query: ListAiSuggestionsQueryDto): Promise<AiActionSuggestion[]> {
    const qb = this.repo
      .createQueryBuilder('s')
      .where('s.tenantId = :tenantId', { tenantId: this.tenantId() })
      .orderBy('s.createdAt', 'DESC');

    if (query.status)     qb.andWhere('s.status = :status',         { status: query.status });
    if (query.actionType) qb.andWhere('s.actionType = :actionType', { actionType: query.actionType });

    return qb.getMany();
  }

  async get(id: string): Promise<AiActionSuggestion> {
    return this.findOrThrow(id);
  }

  // ── Analiz + Öneri Üretimi ────────────────────────────────────────────────

  /**
   * Mevcut araç verilerini okuyarak eylem önerileri üretir.
   * Deterministik — LLM çağrısı yapmaz, her zaman tutarlı sonuç döner.
   *
   * Mantık:
   * 1. low_stock_alerts çağır → her düşük stoklu ürün için CREATE_PO_DRAFT önerisi
   * 2. reorder_analysis_report çağır → tedarikçi bazlı sipariş önerileri
   * 3. dead_stock_report çağır → hareketsiz stok için PRICE_ADJUSTMENT önerisi
   *
   * Zaten PENDING olan aynı (tenant, storeId, variantId, actionType) kombinasyonu varsa atla.
   */
  async analyzeAndGenerate(dto: AnalyzeContextDto): Promise<AiActionSuggestion[]> {
    const tenantId = this.tenantId();
    const created: AiActionSuggestion[] = [];
    const threshold = dto.lowStockThreshold ?? 10;

    // ── 1. Düşük stok → CREATE_PO_DRAFT ──────────────────────────────────────
    const lowStockResult = await this.toolService.execute({
      name: 'low_stock_alerts',
      args: { threshold, limit: 50, storeId: dto.storeId },
    });

    if (lowStockResult.ok && Array.isArray((lowStockResult.data as any)?.data)) {
      const rows: any[] = (lowStockResult.data as any).data;

      for (const row of rows) {
        const storeId = row.storeId ?? dto.storeId;
        if (!storeId || !row.productVariantId) continue;

        // Aynı mağaza + varyant için zaten bekleyen öneri var mı?
        if (await this.pendingExists_po(tenantId, storeId, row.productVariantId)) {
          continue;
        }

        const currentQty = Number(row.quantity ?? 0);
        const suggestedQty = Math.max(
          1,
          Math.ceil((threshold - currentQty) * DEFAULT_REORDER_MULTIPLIER),
        );

        const suggestion = this.repo.create({
          tenantId,
          actionType: AiActionType.CREATE_PO_DRAFT,
          suggestedData: {
            storeId,
            supplierId: row.supplierId ?? null,
            lines: [{ productVariantId: row.productVariantId, quantity: suggestedQty }],
          },
          rationale: [
            `${row.productName ?? 'Ürün'} / ${row.variantName ?? row.productVariantId}`,
            `için stok ${currentQty} adet — eşik ${threshold} altında.`,
            `${suggestedQty} adet sipariş önerilmektedir.`,
          ].join(' '),
        });

        created.push(await this.repo.save(suggestion));
      }
    }

    // ── 2. Ölü stok → PRICE_ADJUSTMENT ───────────────────────────────────────
    const deadStockResult = await this.toolService.execute({
      name: 'dead_stock_report',
      args: { noSaleDays: 60, limit: 20, storeId: dto.storeId },
    });

    if (deadStockResult.ok && Array.isArray((deadStockResult.data as any)?.data)) {
      const rows: any[] = (deadStockResult.data as any).data;

      for (const row of rows) {
        const storeId = row.storeId ?? dto.storeId;
        if (!storeId || !row.productVariantId || !row.price) continue;

        if (await this.pendingExists_price(tenantId, row.productVariantId)) {
          continue;
        }

        const currentPrice = Number(row.price);
        const suggestedPrice = parseFloat((currentPrice * 0.8).toFixed(2)); // %20 indirim

        const suggestion = this.repo.create({
          tenantId,
          actionType: AiActionType.PRICE_ADJUSTMENT,
          suggestedData: {
            storeId,
            productVariantId: row.productVariantId,
            newPrice: suggestedPrice,
            currency: row.currency ?? 'TRY',
          },
          rationale: [
            `${row.productName ?? 'Ürün'} / ${row.variantName ?? row.productVariantId}`,
            `${row.noSaleDays ?? 60} gündür satılmadı (mevcut stok: ${row.quantity ?? '?'} adet).`,
            `Hızlandırılmış satış için %20 indirimle ${suggestedPrice} ${row.currency ?? 'TRY'} önerilmektedir.`,
          ].join(' '),
        });

        created.push(await this.repo.save(suggestion));
      }
    }

    // ── 3. Talep tahmini → DEMAND_FORECAST ───────────────────────────────────
    const demandSuggestions = await this.analyzeDemandForecast(tenantId, dto.storeId);
    created.push(...demandSuggestions);

    // ── 4. Anomali tespiti → ANOMALY_ALERT ────────────────────────────────────
    const anomalySuggestions = await this.analyzeAnomalies(tenantId, dto.storeId);
    created.push(...anomalySuggestions);

    return created;
  }

  /**
   * Reorder analysis raporundan düşük stok günü kalan ürünleri bulur.
   * Her biri için DEMAND_FORECAST önerisi oluşturur (henüz PENDING yoksa).
   *
   * suggestedData şeması:
   * {
   *   storeId, productVariantId, productName?, variantName?,
   *   currentQuantity, daysOfStockLeft, safetyStockDays, forecastedDemandPerDay
   * }
   */
  private async analyzeDemandForecast(
    tenantId: string,
    storeId?: string,
  ): Promise<AiActionSuggestion[]> {
    const created: AiActionSuggestion[] = [];

    const result = await this.toolService.execute({
      name: 'reorder_analysis_report',
      args: { storeId, limit: 30 },
    });

    if (!result.ok || !Array.isArray((result.data as any)?.data)) {
      return created;
    }

    const rows: any[] = (result.data as any).data;

    for (const row of rows) {
      const variantId = row.productVariantId;
      const resolvedStoreId = row.storeId ?? storeId;
      if (!variantId || !resolvedStoreId) continue;

      const daysOfStockLeft = Number(row.daysOfStockLeft ?? row.daysLeft ?? 0);
      const safetyStockDays = Number(row.safetyStockDays ?? 14);

      // Yalnızca güvenlik stoğu günü sınırının altındaki ürünler için öneri üret
      if (daysOfStockLeft >= safetyStockDays) continue;

      // Bu varyant için zaten PENDING forecast var mı?
      if (await this.pendingExists_generic(tenantId, AiActionType.DEMAND_FORECAST, 'productVariantId', variantId)) {
        continue;
      }

      const currentQty = Number(row.currentQuantity ?? row.quantity ?? 0);
      const avgDailyDemand = Number(row.avgDailySales ?? row.avgDailyDemand ?? 0);
      const forecastedDemand = Math.ceil(avgDailyDemand * safetyStockDays * 1.2); // %20 tampon

      const suggestion = this.repo.create({
        tenantId,
        actionType: AiActionType.DEMAND_FORECAST,
        suggestedData: {
          storeId: resolvedStoreId,
          productVariantId: variantId,
          productName: row.productName ?? null,
          variantName: row.variantName ?? null,
          currentQuantity: currentQty,
          daysOfStockLeft,
          safetyStockDays,
          forecastedDemandPerDay: avgDailyDemand,
          recommendedOrderQty: Math.max(forecastedDemand, 1),
          supplierId: row.supplierId ?? null,
        },
        rationale: [
          `${row.productName ?? 'Ürün'} / ${row.variantName ?? variantId}:`,
          `mevcut stok ${daysOfStockLeft} günlük, güvenlik eşiği ${safetyStockDays} gün.`,
          `Günlük ortalama talep ${avgDailyDemand.toFixed(1)} adet;`,
          `${safetyStockDays} günlük tampon için ${Math.max(forecastedDemand, 1)} adet sipariş önerilmektedir.`,
        ].join(' '),
      });

      created.push(await this.repo.save(suggestion));
    }

    return created;
  }

  /**
   * Haftalık karşılaştırma raporundan ani satış spike veya drop'u tespit eder.
   * Haftalık değişim >= %40 olan mağaza/metrik kombinasyonları için ANOMALY_ALERT üretir.
   *
   * suggestedData şeması:
   * {
   *   storeId, metric, currentWeekValue, previousWeekValue,
   *   changePercent, direction: 'UP' | 'DOWN', detectedAt
   * }
   */
  private async analyzeAnomalies(
    tenantId: string,
    storeId?: string,
  ): Promise<AiActionSuggestion[]> {
    const created: AiActionSuggestion[] = [];

    const result = await this.toolService.execute({
      name: 'week_comparison_report',
      args: { storeId, weeks: 2 },
    });

    if (!result.ok) return created;

    // week_comparison_report dönen yapı: data ya array ya da tek nesne olabilir
    const rows: any[] = Array.isArray(result.data)
      ? result.data
      : Array.isArray((result.data as any)?.data)
        ? (result.data as any).data
        : [result.data];

    const ANOMALY_THRESHOLD_PCT = 40; // %40 değişim eşiği

    for (const row of rows) {
      const resolvedStoreId = row.storeId ?? storeId;
      if (!resolvedStoreId) continue;

      // Rapor satırındaki metrikleri incele: revenue, orderCount, avgOrderValue
      const metricsToCheck: Array<{ key: string; label: string }> = [
        { key: 'revenue',       label: 'Ciro'          },
        { key: 'orderCount',    label: 'Sipariş sayısı' },
        { key: 'avgOrderValue', label: 'Ortalama sepet' },
      ];

      for (const { key, label } of metricsToCheck) {
        const current  = Number(row[`current${key.charAt(0).toUpperCase() + key.slice(1)}`]  ?? row[`currentWeek${key.charAt(0).toUpperCase() + key.slice(1)}`]  ?? row[key]        ?? 0);
        const previous = Number(row[`previous${key.charAt(0).toUpperCase() + key.slice(1)}`] ?? row[`previousWeek${key.charAt(0).toUpperCase() + key.slice(1)}`] ?? row[`prev${key.charAt(0).toUpperCase() + key.slice(1)}`] ?? 0);

        if (previous === 0) continue; // Bölme sıfır koruması

        const changePercent = ((current - previous) / previous) * 100;
        if (Math.abs(changePercent) < ANOMALY_THRESHOLD_PCT) continue;

        const direction: 'UP' | 'DOWN' = changePercent > 0 ? 'UP' : 'DOWN';

        // Bu mağaza + metrik için zaten PENDING anomali var mı?
        if (await this.pendingExists_generic(tenantId, AiActionType.ANOMALY_ALERT, 'storeId', resolvedStoreId)) {
          break; // Bu mağaza için zaten uyarı mevcut — sonraki mağazaya geç
        }

        const suggestion = this.repo.create({
          tenantId,
          actionType: AiActionType.ANOMALY_ALERT,
          suggestedData: {
            storeId: resolvedStoreId,
            metric: key,
            metricLabel: label,
            currentWeekValue: current,
            previousWeekValue: previous,
            changePercent: parseFloat(changePercent.toFixed(1)),
            direction,
            detectedAt: new Date().toISOString(),
          },
          rationale: [
            `${label} bu hafta önceki haftaya göre`,
            `%${Math.abs(changePercent).toFixed(1)} ${direction === 'UP' ? 'arttı' : 'düştü'}`,
            `(${previous.toFixed(0)} → ${current.toFixed(0)}).`,
            `Bu ani değişiklik inceleme gerektirebilir.`,
          ].join(' '),
        });

        created.push(await this.repo.save(suggestion));
        break; // Her mağaza için en fazla 1 anomali uyarısı
      }
    }

    return created;
  }

  // ── Onay / Red ────────────────────────────────────────────────────────────

  /**
   * İnsan onayladığında:
   *
   * - CREATE_PO_DRAFT  → Draft PO doğrudan oluşturulur.
   *   @ApprovalBypass  Bu akış kasıtlı olarak approval zincirini atlar:
   *   AI öneri sayfasındaki "Onayla" butonu insan onayı görevi görür.
   *   PO DRAFT statüsünde oluşturulur; onay için ikinci bir ApprovalRequest
   *   açmak gereksiz çift onay adımı yaratır. Procurement ekibi PO'yu
   *   doğrudan APPROVED'a çekebilir (`PATCH /procurement/:id/approve`).
   *   Eğer ileride PO onay akışı zorunlu hale gelirse, bu case'i
   *   `approvalService.create({ entityType: PURCHASE_ORDER })` ile değiştirin.
   *
   * - PRICE_ADJUSTMENT → ApprovalRequest(PRICE_OVERRIDE, L2) oluşturur
   * - STOCK_ADJUSTMENT → ApprovalRequest(STOCK_ADJUSTMENT, L1) oluşturur
   * - DEMAND_FORECAST  → Sadece audit log (kullanıcı "incelendi" der, manuel aksiyon alır)
   * - ANOMALY_ALERT    → Sadece audit log (kullanıcı "incelendi" der, manuel aksiyon alır)
   */
  async confirm(id: string): Promise<AiActionSuggestion> {
    const suggestion = await this.findOrThrow(id);

    if (suggestion.status !== AiActionStatus.PENDING) {
      throw new BadRequestException(`Öneri zaten ${suggestion.status} durumunda.`);
    }

    switch (suggestion.actionType) {
      case AiActionType.CREATE_PO_DRAFT: {
        // @ApprovalBypass — Bkz. JSDoc açıklaması
        const po = await this.procurementService.createPurchaseOrder(
          suggestion.suggestedData as any,
        );
        suggestion.createdPoId = po.id;
        break;
      }

      case AiActionType.PRICE_ADJUSTMENT: {
        const approval = await this.approvalService.create({
          entityType: ApprovalEntityType.PRICE_OVERRIDE,
          requestData: suggestion.suggestedData,
          requesterNotes: `AI öneri #${id} onayından oluşturuldu.`,
        });
        suggestion.approvalRequestId = approval.id;
        break;
      }

      case AiActionType.STOCK_ADJUSTMENT: {
        const approval = await this.approvalService.create({
          entityType: ApprovalEntityType.STOCK_ADJUSTMENT,
          requestData: suggestion.suggestedData,
          requesterNotes: `AI öneri #${id} onayından oluşturuldu.`,
        });
        suggestion.approvalRequestId = approval.id;
        break;
      }

      case AiActionType.DEMAND_FORECAST:
      case AiActionType.ANOMALY_ALERT: {
        // Bilgi amaçlı öneri türleri — "okundu / incelendi" olarak işaretlenir.
        // Kullanıcı gerekli görürse ilgili raporları inceleyip manuel aksiyon alır.
        // Audit log zaten aşağıda yazılmaktadır; burada ek işlem gerekmez.
        break;
      }
    }

    suggestion.status       = AiActionStatus.CONFIRMED;
    suggestion.confirmedById = this.userId();
    suggestion.confirmedAt   = new Date();

    await this.repo.save(suggestion);

    await this.auditLogService.log({
      action:     'AI_ACTION_CONFIRMED',
      entityType: 'AiActionSuggestion',
      entityId:   id,
      diff: {
        actionType:        suggestion.actionType,
        approvalRequestId: suggestion.approvalRequestId,
        createdPoId:       suggestion.createdPoId,
      },
    });

    return suggestion;
  }

  async dismiss(id: string): Promise<AiActionSuggestion> {
    const suggestion = await this.findOrThrow(id);

    if (suggestion.status !== AiActionStatus.PENDING) {
      throw new BadRequestException(`Öneri zaten ${suggestion.status} durumunda.`);
    }

    suggestion.status = AiActionStatus.DISMISSED;
    return this.repo.save(suggestion);
  }
}
