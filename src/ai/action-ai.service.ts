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

        // Zaten bekleyen öneri var mı?
        const existingCount = await this.repo.count({
          where: {
            tenantId,
            actionType: AiActionType.CREATE_PO_DRAFT,
            status: AiActionStatus.PENDING,
          },
        });
        // Aşırı öneri üretimini önle — aynı varyant için tek öneri
        const alreadyExists = await this.repo.findOne({
          where: {
            tenantId,
            actionType: AiActionType.CREATE_PO_DRAFT,
            status: AiActionStatus.PENDING,
          },
        });
        if (alreadyExists && JSON.stringify(alreadyExists.suggestedData).includes(row.productVariantId)) {
          continue;
        }
        void existingCount; // suppress unused warning

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

        const alreadyExists = await this.repo.findOne({
          where: {
            tenantId,
            actionType: AiActionType.PRICE_ADJUSTMENT,
            status: AiActionStatus.PENDING,
          },
        });
        if (alreadyExists && JSON.stringify(alreadyExists.suggestedData).includes(row.productVariantId)) {
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

    return created;
  }

  // ── Onay / Red ────────────────────────────────────────────────────────────

  /**
   * İnsan onayladığında:
   * - CREATE_PO_DRAFT → Draft PO oluşturur (hemen uygulanır)
   * - PRICE_ADJUSTMENT → ApprovalRequest(PRICE_OVERRIDE, L2) oluşturur
   * - STOCK_ADJUSTMENT → ApprovalRequest(STOCK_ADJUSTMENT, L1) oluşturur
   */
  async confirm(id: string): Promise<AiActionSuggestion> {
    const suggestion = await this.findOrThrow(id);

    if (suggestion.status !== AiActionStatus.PENDING) {
      throw new BadRequestException(`Öneri zaten ${suggestion.status} durumunda.`);
    }

    switch (suggestion.actionType) {
      case AiActionType.CREATE_PO_DRAFT: {
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
