import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AppContextService } from 'src/common/context/app-context.service';
import { InventoryService } from 'src/inventory/inventory.service';
import { AdjustStockDto } from 'src/inventory/dto/adjust-stock.dto';
import { PriceService } from 'src/pricing/price.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import {
  ApprovalEntityType,
  ApprovalRequest,
  ApprovalStatus,
} from './entities/approval-request.entity';
import {
  CountAdjustmentRequestData,
  CreateApprovalRequestDto,
  ListApprovalQueryDto,
  PriceOverrideRequestData,
  PurchaseOrderRequestData,
  ReviewApprovalDto,
  SaleReturnRequestData,
  StockAdjustmentRequestData,
} from './dto/approval.dto';

/** Kaç onay seviyesi gerekiyor? 1 = L1 yeterli, 2 = L1 + L2 zorunlu */
const MAX_LEVEL: Record<ApprovalEntityType, 1 | 2> = {
  [ApprovalEntityType.STOCK_ADJUSTMENT]: 1,
  [ApprovalEntityType.PRICE_OVERRIDE]:   2,
  [ApprovalEntityType.PURCHASE_ORDER]:   1,
  [ApprovalEntityType.SALE_RETURN]:      1,
  [ApprovalEntityType.COUNT_ADJUSTMENT]: 1,
};

@Injectable()
export class ApprovalService {
  constructor(
    @InjectRepository(ApprovalRequest)
    private readonly repo: Repository<ApprovalRequest>,
    private readonly appContext: AppContextService,
    private readonly inventoryService: InventoryService,
    private readonly priceService: PriceService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private tenantId() { return this.appContext.getTenantIdOrThrow(); }
  private userId()   { return this.appContext.getUserIdOrThrow(); }

  private async findOrThrow(id: string): Promise<ApprovalRequest> {
    const req = await this.repo.findOne({
      where: { id, tenantId: this.tenantId() },
    });
    if (!req) throw new NotFoundException(`Onay talebi bulunamadı: ${id}`);
    return req;
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async create(dto: CreateApprovalRequestDto): Promise<ApprovalRequest> {
    const tenantId = this.tenantId();
    const { entityId, dedupeKey } = this.resolveApprovalTarget(dto);

    const existing = await this.repo.findOne({
      where: {
        tenantId,
        dedupeKey,
        status: In([ApprovalStatus.PENDING_L1, ApprovalStatus.PENDING_L2]),
      },
    });
    if (existing) {
      throw new BadRequestException(
        `Bu kayıt için zaten bekleyen bir onay talebi mevcut: ${existing.id}`,
      );
    }

    const approval = this.repo.create({
      tenantId,
      entityType: dto.entityType,
      entityId,
      dedupeKey,
      requestData: dto.requestData,
      requesterNotes: dto.requesterNotes,
      requestedById: this.userId(),
      maxLevel: MAX_LEVEL[dto.entityType],
      status: ApprovalStatus.PENDING_L1,
    });

    return this.repo.save(approval);
  }

  private resolveApprovalTarget(
    dto: CreateApprovalRequestDto,
  ): { entityId?: string; dedupeKey: string } {
    switch (dto.entityType) {
      case ApprovalEntityType.STOCK_ADJUSTMENT: {
        const data = dto.requestData as StockAdjustmentRequestData;
        const storeId = this.requireRequestField(data?.storeId, 'storeId', dto.entityType);
        const productVariantId = this.requireRequestField(
          data?.productVariantId,
          'productVariantId',
          dto.entityType,
        );
        return {
          dedupeKey: `${dto.entityType}:${storeId}:${productVariantId}`,
        };
      }

      case ApprovalEntityType.PRICE_OVERRIDE: {
        const data = dto.requestData as PriceOverrideRequestData;
        const storeId = this.requireRequestField(data?.storeId, 'storeId', dto.entityType);
        const productVariantId = this.requireRequestField(
          data?.productVariantId,
          'productVariantId',
          dto.entityType,
        );
        return {
          dedupeKey: `${dto.entityType}:${storeId}:${productVariantId}`,
        };
      }

      case ApprovalEntityType.PURCHASE_ORDER: {
        const data = dto.requestData as PurchaseOrderRequestData;
        const purchaseOrderId = this.requireRequestField(
          data?.purchaseOrderId,
          'purchaseOrderId',
          dto.entityType,
        );
        return {
          entityId: purchaseOrderId,
          dedupeKey: `${dto.entityType}:${purchaseOrderId}`,
        };
      }

      case ApprovalEntityType.SALE_RETURN: {
        const data = dto.requestData as SaleReturnRequestData;
        const saleReturnId = this.requireRequestField(
          data?.saleReturnId,
          'saleReturnId',
          dto.entityType,
        );
        return {
          entityId: saleReturnId,
          dedupeKey: `${dto.entityType}:${saleReturnId}`,
        };
      }

      case ApprovalEntityType.COUNT_ADJUSTMENT: {
        const data = dto.requestData as CountAdjustmentRequestData;
        const countSessionId = this.requireRequestField(
          data?.countSessionId,
          'countSessionId',
          dto.entityType,
        );
        return {
          entityId: countSessionId,
          dedupeKey: `${dto.entityType}:${countSessionId}`,
        };
      }
    }

    throw new BadRequestException(`Desteklenmeyen approval entityType: ${dto.entityType}`);
  }

  private requireRequestField(
    value: string | undefined,
    fieldName: string,
    entityType: ApprovalEntityType,
  ): string {
    if (!value?.trim()) {
      throw new BadRequestException(
        `${entityType} approval requestData içinde '${fieldName}' zorunludur.`,
      );
    }
    return value;
  }

  async list(query: ListApprovalQueryDto): Promise<ApprovalRequest[]> {
    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.tenantId = :tenantId', { tenantId: this.tenantId() })
      .orderBy('a.createdAt', 'DESC');

    if (query.status)     qb.andWhere('a.status = :status',         { status: query.status });
    if (query.entityType) qb.andWhere('a.entityType = :entityType', { entityType: query.entityType });

    return qb.getMany();
  }

  async get(id: string): Promise<ApprovalRequest> {
    return this.findOrThrow(id);
  }

  async cancel(id: string): Promise<ApprovalRequest> {
    const approval = await this.findOrThrow(id);
    const userId = this.userId();

    if (approval.requestedById !== userId) {
      throw new ForbiddenException('Yalnızca talep sahibi iptal edebilir.');
    }
    if (
      approval.status !== ApprovalStatus.PENDING_L1 &&
      approval.status !== ApprovalStatus.PENDING_L2
    ) {
      throw new BadRequestException(`İptal edilemez: mevcut durum ${approval.status}`);
    }

    approval.status = ApprovalStatus.CANCELLED;
    return this.repo.save(approval);
  }

  // ── Review (Onay / Red) ───────────────────────────────────────────────────

  /**
   * L1 inceleme — `APPROVAL_REVIEW` yetkisi yeterli.
   */
  async reviewL1(id: string, dto: ReviewApprovalDto): Promise<ApprovalRequest> {
    const approval = await this.findOrThrow(id);

    if (approval.status !== ApprovalStatus.PENDING_L1) {
      throw new BadRequestException(
        `L1 inceleme yapılamaz: mevcut durum ${approval.status}`,
      );
    }

    approval.l1ReviewedById = this.userId();
    approval.l1ReviewedAt   = new Date();
    approval.l1ReviewNotes  = dto.notes;

    if (dto.action === 'REJECT') {
      approval.status = ApprovalStatus.REJECTED;
      return this.repo.save(approval);
    }

    // Onay
    if (approval.maxLevel === 1) {
      // Tek seviyeli → hemen uygula
      approval.status = ApprovalStatus.APPROVED;
      await this.repo.save(approval);
      await this.executeApproval(approval);
      return approval;
    }

    // Çift seviyeli → L2'ye geç
    approval.status = ApprovalStatus.PENDING_L2;
    return this.repo.save(approval);
  }

  /**
   * L2 inceleme — `APPROVAL_REVIEW_L2` yetkisi gerekli.
   */
  async reviewL2(id: string, dto: ReviewApprovalDto): Promise<ApprovalRequest> {
    const approval = await this.findOrThrow(id);

    if (approval.status !== ApprovalStatus.PENDING_L2) {
      throw new BadRequestException(
        `L2 inceleme yapılamaz: mevcut durum ${approval.status}`,
      );
    }

    approval.l2ReviewedById = this.userId();
    approval.l2ReviewedAt   = new Date();
    approval.l2ReviewNotes  = dto.notes;

    if (dto.action === 'REJECT') {
      approval.status = ApprovalStatus.REJECTED;
      return this.repo.save(approval);
    }

    approval.status = ApprovalStatus.APPROVED;
    await this.repo.save(approval);
    await this.executeApproval(approval);
    return approval;
  }

  // ── Execution Dispatcher ──────────────────────────────────────────────────

  private async executeApproval(approval: ApprovalRequest): Promise<void> {
    switch (approval.entityType) {
      case ApprovalEntityType.STOCK_ADJUSTMENT:
        await this.executeStockAdjustment(approval);
        break;
      case ApprovalEntityType.PRICE_OVERRIDE:
        await this.executePriceOverride(approval);
        break;
      case ApprovalEntityType.PURCHASE_ORDER:
        // PO onayı: ProcurementService.approvePurchaseOrder() çağrılmalı.
        // Circular dependency nedeniyle buraya inject edilmedi; eventId requestData'da saklanıyor.
        // TODO: OutboxService'e PURCHASE_ORDER_APPROVED event yaz → ProcurementModule işlesin.
        break;
      case ApprovalEntityType.SALE_RETURN:
        // İade onayı: SaleReturnService.executeReturn() çağrılmalı.
        // TODO: OutboxService'e SALE_RETURN_APPROVED event yaz → SalesModule işlesin.
        break;
      case ApprovalEntityType.COUNT_ADJUSTMENT:
        // Stok sayım farkı: her satır için inventory.adjustStock() çağrılmalı.
        // TODO: requestData.lines üzerinde dönerek adjustStock çağır.
        break;
    }

    await this.auditLogService.log({
      action:     `${approval.entityType}_APPROVAL_EXECUTED`,
      entityType: 'ApprovalRequest',
      entityId:   approval.id,
      diff:       { requestData: approval.requestData },
    });
  }

  private async executeStockAdjustment(approval: ApprovalRequest): Promise<void> {
    const d = approval.requestData as StockAdjustmentRequestData;
    const dto: AdjustStockDto = {
      storeId:          d.storeId,
      productVariantId: d.productVariantId,
      newQuantity:      d.newQuantity,
      reference:        `approval:${approval.id}`,
    };
    await this.inventoryService.adjustStock(dto);
  }

  private async executePriceOverride(approval: ApprovalRequest): Promise<void> {
    const d = approval.requestData as PriceOverrideRequestData;
    await this.priceService.setStorePriceForVariant({
      storeId:          d.storeId,
      productVariantId: d.productVariantId,
      unitPrice:        d.newPrice,
      currency:         d.currency ?? 'TRY',
      taxPercent:       d.taxPercent,
    });
  }
}
