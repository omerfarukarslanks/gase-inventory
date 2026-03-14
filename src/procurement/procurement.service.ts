import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { AppContextService } from 'src/common/context/app-context.service';
import { applyScopeToQb, resolveStoreScope } from 'src/common/helpers/store-scope.helper';
import { InventoryService } from 'src/inventory/inventory.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { OutboxService } from 'src/outbox/outbox.service';
import { PurchaseOrder, PurchaseOrderStatus } from './entities/purchase-order.entity';
import { PurchaseOrderLine } from './entities/purchase-order-line.entity';
import { GoodsReceipt } from './entities/goods-receipt.entity';
import { GoodsReceiptLine } from './entities/goods-receipt-line.entity';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { ListPurchaseOrdersDto } from './dto/list-purchase-orders.dto';
import { ListGoodsReceiptsDto } from './dto/list-goods-receipts.dto';
import { ProductVariant } from 'src/product/product-variant.entity';
import { Warehouse } from 'src/warehouse/entities/warehouse.entity';
import { Store } from 'src/store/store.entity';

type GoodsReceiptLineResponse = GoodsReceiptLine & {
  productName: string | null;
  variantName: string | null;
};

type PurchaseOrderLineResponse = PurchaseOrderLine & {
  productName: string | null;
  variantName: string | null;
};

type GoodsReceiptResponse = Omit<GoodsReceipt, 'lines'> & {
  lines: GoodsReceiptLineResponse[];
};

type GoodsReceiptListItemResponse = {
  id: string;
  purchaseOrderId: string;
  purchaseOrderReference: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  receivedAt: Date;
  notes: string | null;
  lineCount: number;
  totalReceivedQuantity: number;
  store: {
    id: string;
    name: string | null;
  };
};

type GoodsReceiptDetailResponse = {
  id: string;
  purchaseOrderId: string;
  purchaseOrderReference: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  receivedAt: Date;
  notes: string | null;
  store: {
    id: string;
    name: string | null;
  };
  lines: GoodsReceiptLineResponse[];
};

type PurchaseOrderResponse = Omit<PurchaseOrder, 'lines'> & {
  lines: PurchaseOrderLineResponse[];
};

type VariantDetails = {
  productName: string | null;
  variantName: string | null;
};

@Injectable()
export class ProcurementService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderLine)
    private readonly poLineRepo: Repository<PurchaseOrderLine>,
    @InjectRepository(GoodsReceipt)
    private readonly grRepo: Repository<GoodsReceipt>,
    @InjectRepository(GoodsReceiptLine)
    private readonly grLineRepo: Repository<GoodsReceiptLine>,
    @InjectRepository(ProductVariant)
    private readonly productVariantRepo: Repository<ProductVariant>,
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    private readonly appContext: AppContextService,
    private readonly inventoryService: InventoryService,
    private readonly dataSource: DataSource,
    private readonly auditLog: AuditLogService,
    private readonly outbox: OutboxService,
  ) {}

  // ─── Satın alma siparişi oluştur (DRAFT) ────────────────────────────────────

  async createPurchaseOrder(dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const actorId = this.appContext.getUserIdOrNull();

    return this.dataSource.transaction(async (manager) => {
      const poRepo = manager.getRepository(PurchaseOrder);
      const poLineRepo = manager.getRepository(PurchaseOrderLine);

      const po = poRepo.create({
        tenant: { id: tenantId } as any,
        store: { id: dto.storeId } as any,
        supplierId: dto.supplierId,
        status: PurchaseOrderStatus.DRAFT,
        notes: dto.notes,
        expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : undefined,
        currency: dto.currency ?? 'TRY',
        createdById: actorId,
        updatedById: actorId,
      });
      const savedPo = await poRepo.save(po);

      const lines = dto.lines.map((lineDto) => {
        const lineTotal =
          lineDto.unitPrice != null ? lineDto.unitPrice * lineDto.quantity : undefined;

        return poLineRepo.create({
          purchaseOrder: savedPo,
          productVariantId: lineDto.productVariantId,
          quantity: lineDto.quantity,
          receivedQuantity: 0,
          unitPrice: lineDto.unitPrice,
          taxPercent: lineDto.taxPercent,
          lineTotal,
          notes: lineDto.notes,
          createdById: actorId,
          updatedById: actorId,
        });
      });

      await poLineRepo.save(lines);
      return this.findPurchaseOrderOrThrow(savedPo.id, tenantId, manager);
    });
  }

  // ─── Sipariş onayla (DRAFT → APPROVED) ─────────────────────────────────────

  async approvePurchaseOrder(poId: string): Promise<PurchaseOrder> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const actorId = this.appContext.getUserIdOrNull();

    return this.dataSource.transaction(async (manager) => {
      const po = await this.findPurchaseOrderOrThrow(poId, tenantId, manager);

      if (po.status !== PurchaseOrderStatus.DRAFT) {
        throw new BadRequestException(
          `Sipariş onaylanamaz: mevcut durum ${po.status}. Yalnızca DRAFT siparişler onaylanabilir.`,
        );
      }

      const prevStatus = po.status;
      po.status = PurchaseOrderStatus.APPROVED;
      po.updatedById = actorId;
      const saved = await manager.getRepository(PurchaseOrder).save(po);

      await this.auditLog.log(
        {
          action: 'PO_APPROVED',
          entityType: 'PurchaseOrder',
          entityId: po.id,
          diff: { from: prevStatus, to: PurchaseOrderStatus.APPROVED },
        },
        manager,
      );

      return saved;
    });
  }

  // ─── Sipariş iptal et (DRAFT veya APPROVED → CANCELLED) ────────────────────

  async cancelPurchaseOrder(poId: string): Promise<PurchaseOrder> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const actorId = this.appContext.getUserIdOrNull();

    return this.dataSource.transaction(async (manager) => {
      const po = await this.findPurchaseOrderOrThrow(poId, tenantId, manager);

      if (
        po.status !== PurchaseOrderStatus.DRAFT &&
        po.status !== PurchaseOrderStatus.APPROVED
      ) {
        throw new BadRequestException(
          `Sipariş iptal edilemez: mevcut durum ${po.status}.`,
        );
      }

      const prevStatus = po.status;
      po.status = PurchaseOrderStatus.CANCELLED;
      po.updatedById = actorId;
      const saved = await manager.getRepository(PurchaseOrder).save(po);

      await this.auditLog.log(
        {
          action: 'PO_CANCELLED',
          entityType: 'PurchaseOrder',
          entityId: po.id,
          diff: { from: prevStatus, to: PurchaseOrderStatus.CANCELLED },
        },
        manager,
      );

      return saved;
    });
  }

  // ─── Mal teslim al ──────────────────────────────────────────────────────────

  async createGoodsReceipt(
    poId: string,
    dto: CreateGoodsReceiptDto,
  ): Promise<GoodsReceiptResponse> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const actorId = this.appContext.getUserIdOrNull();

    return this.dataSource.transaction(async (manager) => {
      const po = await this.findPurchaseOrderOrThrow(poId, tenantId, manager);

      if (
        po.status !== PurchaseOrderStatus.APPROVED &&
        po.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
      ) {
        throw new BadRequestException(
          `Teslim alma yapılamaz: sipariş durumu ${po.status}. APPROVED veya PARTIALLY_RECEIVED olmalıdır.`,
        );
      }

      const poLineRepo = manager.getRepository(PurchaseOrderLine);
      const grRepo = manager.getRepository(GoodsReceipt);
      const grLineRepo = manager.getRepository(GoodsReceiptLine);
      const warehouse = await this.findWarehouseForGoodsReceiptOrThrow(
        dto.warehouseId,
        po,
        tenantId,
        manager,
      );

      // GoodsReceipt kaydet
      const gr = grRepo.create({
        tenant: { id: tenantId } as any,
        purchaseOrder: po,
        store: po.store,
        warehouseId: warehouse.id,
        notes: dto.notes,
        createdById: actorId,
        updatedById: actorId,
      });
      const savedGr = await grRepo.save(gr);

      for (const lineDto of dto.lines) {
        // PO satırını bul
        const poLine = po.lines.find((l) => l.id === lineDto.purchaseOrderLineId);
        if (!poLine) {
          throw new NotFoundException(
            `PO kalemi bulunamadı: ${lineDto.purchaseOrderLineId}`,
          );
        }

        // Miktar kontrolü
        const remaining = Number(poLine.quantity) - Number(poLine.receivedQuantity);
        if (lineDto.receivedQuantity > remaining) {
          throw new BadRequestException(
            `Kalem ${poLine.id}: teslim alınmak istenen miktar (${lineDto.receivedQuantity}) kalan miktarı (${remaining}) aşıyor.`,
          );
        }

        // GoodsReceiptLine kaydet
        const grLine = grLineRepo.create({
          goodsReceipt: savedGr,
          purchaseOrderLine: poLine,
          receivedQuantity: lineDto.receivedQuantity,
          lotNumber: lineDto.lotNumber,
          expiryDate: lineDto.expiryDate ? new Date(lineDto.expiryDate) : undefined,
          createdById: actorId,
          updatedById: actorId,
        });
        await grLineRepo.save(grLine);

        // Stok girişi — aynı transaction'a katıl
        await this.inventoryService.receiveStock(
          {
            storeId: (po.store as any).id,
            productVariantId: poLine.productVariantId,
            quantity: lineDto.receivedQuantity,
            supplierId: po.supplierId,
            reference: `GR-${savedGr.id.slice(0, 8).toUpperCase()}`,
            lotNumber: lineDto.lotNumber,
            expiryDate: lineDto.expiryDate,
            meta: {
              purchaseOrderId: po.id,
              goodsReceiptId: savedGr.id,
            },
          },
          manager,
        );

        // PO satırı alınan miktarı güncelle
        poLine.receivedQuantity = Number(poLine.receivedQuantity) + lineDto.receivedQuantity;
        poLine.updatedById = actorId;
        await poLineRepo.save(poLine);
      }

      // PO durumunu güncelle
      const allReceived = po.lines.every(
        (l) => Number(l.receivedQuantity) >= Number(l.quantity),
      );
      po.status = allReceived
        ? PurchaseOrderStatus.RECEIVED
        : PurchaseOrderStatus.PARTIALLY_RECEIVED;
      po.updatedById = actorId;
      await manager.getRepository(PurchaseOrder).save({
        id: po.id,
        status: po.status,
        updatedById: actorId,
      });

      await this.auditLog.log(
        {
          action: 'PO_RECEIPT_CREATED',
          entityType: 'GoodsReceipt',
          entityId: savedGr.id,
          diff: { purchaseOrderId: po.id, newPoStatus: po.status },
        },
        manager,
      );

      // Outbox event — aynı transaction'da commit edilir
      await this.outbox.publish(
        {
          tenantId,
          eventType: 'goods_receipt.created',
          payload: {
            goodsReceiptId: savedGr.id,
            purchaseOrderId: po.id,
            storeId: (po.store as any).id,
            warehouseId: warehouse.id,
            newPoStatus: po.status,
          },
        },
        manager,
      );

      const receipt = await grRepo.findOne({
        where: { id: savedGr.id },
        relations: ['lines', 'lines.purchaseOrderLine', 'store'],
      });

      if (!receipt) {
        throw new NotFoundException('Teslim kaydi bulunamadi');
      }

      return this.enrichGoodsReceipt(receipt);
    });
  }

  // ─── Listele ────────────────────────────────────────────────────────────────

  async listPurchaseOrders(query: ListPurchaseOrdersDto) {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const qb = this.poRepo
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.store', 'store')
      .leftJoinAndSelect('po.lines', 'lines')
      .where('po.tenantId = :tenantId', { tenantId });

    if (query.status) {
      qb.andWhere('po.status = :status', { status: query.status });
    }
    if (query.storeId) {
      qb.andWhere('po.storeId = :storeId', { storeId: query.storeId });
    }
    if (query.supplierId) {
      qb.andWhere('po.supplierId = :supplierId', { supplierId: query.supplierId });
    }

    qb.orderBy('po.createdAt', 'DESC');

    if (!query.hasPagination) {
      const data = await qb.getMany();
      return { data };
    }

    const total = await qb.getCount();
    const data = await qb.skip(query.skip).take(query.limit ?? 20).getMany();

    return {
      data,
      meta: {
        total,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        totalPages: Math.ceil(total / (query.limit ?? 20)),
      },
    };
  }

  // ─── Tekil PO ───────────────────────────────────────────────────────────────

  async getPurchaseOrder(poId: string): Promise<PurchaseOrderResponse> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const po = await this.findPurchaseOrderOrThrow(poId, tenantId);
    return this.enrichPurchaseOrder(po);
  }

  // ─── Goods receipt listesi ──────────────────────────────────────────────────

  async listGoodsReceipts(poId: string): Promise<GoodsReceiptResponse[]> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    await this.findPurchaseOrderOrThrow(poId, tenantId);

    const receipts = await this.grRepo.find({
      where: { purchaseOrder: { id: poId }, tenant: { id: tenantId } },
      relations: ['lines', 'lines.purchaseOrderLine', 'store'],
      order: { createdAt: 'DESC' },
    });

    return this.enrichGoodsReceipts(receipts);
  }

  async listAllGoodsReceipts(query: ListGoodsReceiptsDto) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const scope = await resolveStoreScope(
      this.appContext,
      this.storeRepo,
      query.storeId ? [query.storeId] : undefined,
    );

    const qb = this.grRepo
      .createQueryBuilder('gr')
      .leftJoinAndSelect('gr.store', 'store')
      .leftJoinAndSelect('gr.purchaseOrder', 'purchaseOrder')
      .where('gr.tenantId = :tenantId', { tenantId });

    applyScopeToQb(qb, scope, 'gr');

    if (query.warehouseId) {
      qb.andWhere('gr.warehouseId = :warehouseId', { warehouseId: query.warehouseId });
    }
    if (query.startDate) {
      qb.andWhere('DATE(gr.receivedAt) >= :startDate', { startDate: query.startDate });
    }
    if (query.endDate) {
      qb.andWhere('DATE(gr.receivedAt) <= :endDate', { endDate: query.endDate });
    }
    if (query.q?.trim()) {
      const search = `%${query.q.trim()}%`;
      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where('gr.notes ILIKE :search', { search })
            .orWhere('CAST(purchaseOrder.id AS text) ILIKE :search', { search })
            .orWhere(
              "CONCAT('PO-', UPPER(SUBSTRING(CAST(purchaseOrder.id AS text), 1, 8))) ILIKE :search",
              { search },
            );
        }),
      );
    }

    qb.orderBy('gr.receivedAt', 'DESC');

    if (!query.hasPagination) {
      const data = await this.enrichGoodsReceiptListItems(await qb.getMany(), tenantId);
      return { data };
    }

    const total = await qb.getCount();
    const data = await this.enrichGoodsReceiptListItems(
      await qb.skip(query.skip).take(query.limit ?? 20).getMany(),
      tenantId,
    );

    return {
      data,
      meta: {
        total,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        totalPages: Math.ceil(total / (query.limit ?? 20)),
      },
    };
  }

  async getGoodsReceipt(goodsReceiptId: string): Promise<GoodsReceiptDetailResponse> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const receipt = await this.findGoodsReceiptOrThrow(goodsReceiptId, tenantId);
    return this.enrichGoodsReceiptDetail(receipt, tenantId);
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  private async findPurchaseOrderOrThrow(
    poId: string,
    tenantId: string,
    manager?: EntityManager,
  ): Promise<PurchaseOrder> {
    const repo = manager
      ? manager.getRepository(PurchaseOrder)
      : this.poRepo;

    const po = await repo.findOne({
      where: { id: poId, tenant: { id: tenantId } },
      relations: ['store', 'lines', 'goodsReceipts'],
    });

    if (!po) {
      throw new NotFoundException('Satın alma siparişi bulunamadı');
    }

    return po;
  }

  private async findWarehouseForGoodsReceiptOrThrow(
    warehouseId: string,
    po: PurchaseOrder,
    tenantId: string,
    manager: EntityManager,
  ): Promise<Warehouse> {
    const warehouse = await manager.getRepository(Warehouse).findOne({
      where: {
        id: warehouseId,
        tenant: { id: tenantId },
        storeId: (po.store as any).id,
        isActive: true,
      },
    });

    if (!warehouse) {
      throw new BadRequestException(
        `Depo bulunamadi veya siparisin magazasi ile uyusmuyor: ${warehouseId}`,
      );
    }

    return warehouse;
  }

  private async findGoodsReceiptOrThrow(
    goodsReceiptId: string,
    tenantId: string,
  ): Promise<GoodsReceipt> {
    const contextStoreId = this.appContext.getStoreId();
    const receipt = await this.grRepo.findOne({
      where: {
        id: goodsReceiptId,
        tenant: { id: tenantId },
        ...(contextStoreId ? { store: { id: contextStoreId } } : {}),
      },
      relations: ['purchaseOrder', 'lines', 'lines.purchaseOrderLine', 'store'],
    });

    if (!receipt) {
      throw new NotFoundException('Teslim kaydi bulunamadi');
    }

    return receipt;
  }

  private async enrichGoodsReceipt(
    receipt: GoodsReceipt,
  ): Promise<GoodsReceiptResponse> {
    const [enriched] = await this.enrichGoodsReceipts([receipt]);
    return enriched;
  }

  private async enrichGoodsReceipts(
    receipts: GoodsReceipt[],
  ): Promise<GoodsReceiptResponse[]> {
    const variantIds = Array.from(
      new Set(
        receipts.flatMap((receipt) =>
          (receipt.lines ?? [])
            .map((line) => line.purchaseOrderLine?.productVariantId)
            .filter((variantId): variantId is string => Boolean(variantId)),
        ),
      ),
    );

    const variantById = await this.loadVariantDetailsMap(variantIds);

    return receipts.map((receipt) => ({
      ...receipt,
      lines: (receipt.lines ?? []).map((line) => {
        const variantDetails = line.purchaseOrderLine?.productVariantId
          ? variantById.get(line.purchaseOrderLine.productVariantId)
          : undefined;

        return {
          ...line,
          productName: variantDetails?.productName ?? null,
          variantName: variantDetails?.variantName ?? null,
        };
      }),
    }));
  }

  private async enrichGoodsReceiptListItems(
    receipts: GoodsReceipt[],
    tenantId: string,
  ): Promise<GoodsReceiptListItemResponse[]> {
    if (receipts.length === 0) {
      return [];
    }

    const metricsByReceiptId = await this.loadGoodsReceiptMetricsMap(
      receipts.map((receipt) => receipt.id),
      tenantId,
    );
    const warehouseNameById = await this.loadWarehouseNamesMap(
      receipts
        .map((receipt) => receipt.warehouseId)
        .filter((warehouseId): warehouseId is string => Boolean(warehouseId)),
      tenantId,
    );

    return receipts.map((receipt) => {
      const metrics = metricsByReceiptId.get(receipt.id);
      const purchaseOrderId = (receipt.purchaseOrder as any)?.id;

      return {
        id: receipt.id,
        purchaseOrderId,
        purchaseOrderReference: this.buildPurchaseOrderReference(purchaseOrderId),
        warehouseId: receipt.warehouseId ?? null,
        warehouseName: receipt.warehouseId
          ? warehouseNameById.get(receipt.warehouseId) ?? null
          : null,
        receivedAt: receipt.receivedAt,
        notes: receipt.notes ?? null,
        lineCount: metrics?.lineCount ?? 0,
        totalReceivedQuantity: metrics?.totalReceivedQuantity ?? 0,
        store: {
          id: (receipt.store as any)?.id,
          name: receipt.store?.name ?? null,
        },
      };
    });
  }

  private async enrichGoodsReceiptDetail(
    receipt: GoodsReceipt,
    tenantId: string,
  ): Promise<GoodsReceiptDetailResponse> {
    const enrichedReceipt = await this.enrichGoodsReceipt(receipt);
    const warehouseNameById = await this.loadWarehouseNamesMap(
      enrichedReceipt.warehouseId ? [enrichedReceipt.warehouseId] : [],
      tenantId,
    );
    const purchaseOrderId = (receipt.purchaseOrder as any)?.id;

    return {
      id: enrichedReceipt.id,
      purchaseOrderId,
      purchaseOrderReference: this.buildPurchaseOrderReference(purchaseOrderId),
      warehouseId: enrichedReceipt.warehouseId ?? null,
      warehouseName: enrichedReceipt.warehouseId
        ? warehouseNameById.get(enrichedReceipt.warehouseId) ?? null
        : null,
      receivedAt: enrichedReceipt.receivedAt,
      notes: enrichedReceipt.notes ?? null,
      store: {
        id: (enrichedReceipt.store as any)?.id,
        name: enrichedReceipt.store?.name ?? null,
      },
      lines: enrichedReceipt.lines,
    };
  }

  private async enrichPurchaseOrder(
    po: PurchaseOrder,
  ): Promise<PurchaseOrderResponse> {
    const variantIds = Array.from(
      new Set(
        (po.lines ?? [])
          .map((line) => line.productVariantId)
          .filter((variantId): variantId is string => Boolean(variantId)),
      ),
    );
    const variantById = await this.loadVariantDetailsMap(variantIds);

    return {
      ...po,
      lines: (po.lines ?? []).map((line) => {
        const variantDetails = variantById.get(line.productVariantId);

        return {
          ...line,
          productName: variantDetails?.productName ?? null,
          variantName: variantDetails?.variantName ?? null,
        };
      }),
    };
  }

  private async loadVariantDetailsMap(
    variantIds: string[],
  ): Promise<Map<string, VariantDetails>> {
    if (variantIds.length === 0) {
      return new Map<string, VariantDetails>();
    }

    const variants = await this.productVariantRepo.find({
      where: { id: In(variantIds) },
      relations: ['product'],
    });
    return new Map(
      variants.map((variant) => [
        variant.id,
        {
          productName: variant.product?.name ?? null,
          variantName: variant.name ?? null,
        },
      ]),
    );
  }

  private async loadWarehouseNamesMap(
    warehouseIds: string[],
    tenantId: string,
  ): Promise<Map<string, string | null>> {
    if (warehouseIds.length === 0) {
      return new Map<string, string | null>();
    }

    const warehouses = await this.warehouseRepo.find({
      where: { id: In([...new Set(warehouseIds)]), tenant: { id: tenantId } },
      select: { id: true, name: true },
    });

    return new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name ?? null]));
  }

  private async loadGoodsReceiptMetricsMap(
    receiptIds: string[],
    tenantId: string,
  ): Promise<Map<string, { lineCount: number; totalReceivedQuantity: number }>> {
    if (receiptIds.length === 0) {
      return new Map();
    }

    const receipts = await this.grRepo.find({
      where: { id: In(receiptIds), tenant: { id: tenantId } },
      relations: ['lines'],
    });

    return new Map(
      receipts.map((receipt) => [
        receipt.id,
        {
          lineCount: receipt.lines?.length ?? 0,
          totalReceivedQuantity: (receipt.lines ?? []).reduce(
            (sum, line) => sum + Number(line.receivedQuantity ?? 0),
            0,
          ),
        },
      ]),
    );
  }

  private buildPurchaseOrderReference(
    purchaseOrderId?: string | null,
  ): string | null {
    if (!purchaseOrderId) {
      return null;
    }

    return `PO-${purchaseOrderId.slice(0, 8).toUpperCase()}`;
  }
}
