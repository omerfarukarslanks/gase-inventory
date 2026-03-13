import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DataSource, EntityManager } from 'typeorm';
import { OutboxService } from './outbox.service';
import { OutboxEvent } from './outbox-event.entity';
import { GoodsReceipt } from 'src/procurement/entities/goods-receipt.entity';
import { Warehouse } from 'src/warehouse/entities/warehouse.entity';
import { Location } from 'src/warehouse/entities/location.entity';
import { PutawayTask, PutawayTaskStatus } from 'src/warehouse/entities/putaway-task.entity';

const MAX_RETRIES = 5;
/** Exponential backoff: 2^retryCount dakika (max 32 dk) */
const backoffMs = (retryCount: number) =>
  Math.min(Math.pow(2, retryCount) * 60_000, 32 * 60_000);

type GoodsReceiptCreatedPayload = {
  goodsReceiptId: string;
  warehouseId?: string;
  purchaseOrderId?: string;
  newPoStatus?: string;
};

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);
  private isRunning = false;

  constructor(
    private readonly outboxService: OutboxService,
    private readonly dataSource: DataSource,
  ) {}

  /** Her 10 saniyede bir PENDING event'leri işler */
  @Interval(10_000)
  async processPendingEvents(): Promise<void> {
    if (this.isRunning) return; // Önceki tur bitmeden tekrar başlama

    this.isRunning = true;
    try {
      const events = await this.outboxService.fetchPending(50);
      if (events.length === 0) return;

      this.logger.debug(`${events.length} outbox event işleniyor...`);

      for (const event of events) {
        await this.processEvent(event);
      }
    } finally {
      this.isRunning = false;
    }
  }

  private async processEvent(event: OutboxEvent): Promise<void> {
    try {
      await this.dispatch(event);
      await this.outboxService.markSent(event.id);
      this.logger.debug(`Event işlendi: ${event.eventType} (${event.id})`);
    } catch (err) {
      const error = (err as Error).message;
      const nextRetryCount = event.retryCount + 1;

      if (nextRetryCount >= MAX_RETRIES) {
        this.logger.error(
          `Event dead-letter'a taşındı: ${event.eventType} (${event.id}) — ${error}. ` +
          `RetryCount: ${nextRetryCount}/${MAX_RETRIES}.`,
        );
        await this.outboxService.markDeadLetter(event.id, error);
      } else {
        const nextRetryAt = new Date(Date.now() + backoffMs(event.retryCount));
        this.logger.warn(
          `Event başarısız: ${event.eventType} (${event.id}) — ${error}. ` +
          `RetryCount: ${nextRetryCount}/${MAX_RETRIES}. ` +
          `Sonraki deneme: ${nextRetryAt.toISOString()}`,
        );
        await this.outboxService.markFailed(event.id, error, nextRetryAt);
      }
    }
  }

  /**
   * Event tipine göre işlem yapar.
   * Faz 2'de gerçek entegrasyonlar (webhook, e-fatura, marketplace) buraya bağlanır.
   */
  private async dispatch(event: OutboxEvent): Promise<void> {
    switch (event.eventType) {
      case 'goods_receipt.created':
        await this.handleGoodsReceiptCreated(event);
        break;

      case 'purchase_order.approved':
        // Faz 2: Tedarikçi sistemine sipariş bildirimi
        this.logger.debug(
          `[STUB] purchase_order.approved — tenantId=${event.tenantId}`,
        );
        break;

      default:
        // Bilinmeyen event tiplerini logla ama hata fırlatma
        this.logger.warn(`Bilinmeyen event tipi: ${event.eventType}`);
        break;
    }
  }

  private async handleGoodsReceiptCreated(event: OutboxEvent): Promise<void> {
    const payload = this.parseGoodsReceiptCreatedPayload(event);

    await this.dataSource.transaction(async (manager) => {
      const putawayRepo = manager.getRepository(PutawayTask);
      const existingTaskCount = await putawayRepo.count({
        where: {
          tenant: { id: event.tenantId },
          goodsReceiptId: payload.goodsReceiptId,
        },
      });

      if (existingTaskCount > 0) {
        this.logger.debug(
          `goods_receipt.created skip edildi; goodsReceiptId=${payload.goodsReceiptId} icin zaten ${existingTaskCount} putaway task var.`,
        );
        return;
      }

      const goodsReceipt = await manager.getRepository(GoodsReceipt).findOne({
        where: {
          id: payload.goodsReceiptId,
          tenant: { id: event.tenantId },
        },
        relations: ['lines', 'lines.purchaseOrderLine'],
      });

      if (!goodsReceipt) {
        throw new Error(`Goods receipt bulunamadi: ${payload.goodsReceiptId}`);
      }

      if (!goodsReceipt.lines?.length) {
        this.logger.debug(
          `goods_receipt.created skip edildi; goodsReceiptId=${payload.goodsReceiptId} icin line yok.`,
        );
        return;
      }

      const warehouse = await this.resolveWarehouseOrThrow(
        manager,
        event.tenantId,
        payload.warehouseId ?? goodsReceipt.warehouseId,
      );
      const toLocation = await this.resolveDefaultPutawayLocation(
        manager,
        event.tenantId,
        warehouse.id,
      );
      const actorId = goodsReceipt.updatedById ?? goodsReceipt.createdById;

      const tasks = goodsReceipt.lines.map((line) =>
        putawayRepo.create({
          tenant: { id: event.tenantId } as any,
          warehouseId: warehouse.id,
          productVariantId: line.purchaseOrderLine.productVariantId,
          quantity: line.receivedQuantity,
          toLocation,
          goodsReceiptId: payload.goodsReceiptId,
          goodsReceiptLineId: line.id,
          notes: `Auto-created from goods receipt ${payload.goodsReceiptId}`,
          status: PutawayTaskStatus.PENDING,
          createdById: actorId,
          updatedById: actorId,
        }),
      );

      await putawayRepo.save(tasks);
      this.logger.debug(
        `${tasks.length} putaway task olusturuldu. goodsReceiptId=${payload.goodsReceiptId}, warehouseId=${warehouse.id}, toLocationId=${toLocation.id}`,
      );
    });
  }

  private parseGoodsReceiptCreatedPayload(
    event: OutboxEvent,
  ): GoodsReceiptCreatedPayload {
    const goodsReceiptId =
      typeof event.payload?.goodsReceiptId === 'string'
        ? event.payload.goodsReceiptId.trim()
        : '';

    if (!goodsReceiptId) {
      throw new Error(
        `goods_receipt.created payload eksik. goodsReceiptId='${goodsReceiptId}'`,
      );
    }

    return {
      goodsReceiptId,
      warehouseId:
        typeof event.payload?.warehouseId === 'string'
          ? event.payload.warehouseId.trim()
          : undefined,
      purchaseOrderId:
        typeof event.payload?.purchaseOrderId === 'string'
          ? event.payload.purchaseOrderId
          : undefined,
      newPoStatus:
        typeof event.payload?.newPoStatus === 'string'
          ? event.payload.newPoStatus
          : undefined,
    };
  }

  private async resolveWarehouseOrThrow(
    manager: EntityManager,
    tenantId: string,
    warehouseId?: string,
  ): Promise<Warehouse> {
    if (!warehouseId) {
      throw new Error(
        'goods_receipt.created icin warehouseId bulunamadi. GoodsReceipt uzerinde warehouse context zorunlu olmalidir.',
      );
    }

    const warehouse = await manager.getRepository(Warehouse).findOne({
      where: {
        id: warehouseId,
        tenant: { id: tenantId },
        isActive: true,
      },
    });

    if (!warehouse) {
      throw new Error(
        `goods_receipt.created icin aktif warehouse bulunamadi. warehouseId=${warehouseId}`,
      );
    }

    return warehouse;
  }

  private async resolveDefaultPutawayLocation(
    manager: EntityManager,
    tenantId: string,
    warehouseId: string,
  ): Promise<Location> {
    const locations = await manager.getRepository(Location).find({
      where: {
        tenant: { id: tenantId },
        warehouse: { id: warehouseId },
        isActive: true,
      },
      order: { code: 'ASC' },
    });

    if (locations.length === 1) {
      return locations[0];
    }

    if (locations.length === 0) {
      throw new Error(
        `goods_receipt.created icin aktif putaway lokasyonu bulunamadi. warehouseId=${warehouseId}`,
      );
    }

    throw new Error(
      `goods_receipt.created icin warehouseId=${warehouseId} altinda birden fazla aktif lokasyon var. Otomatik putaway hedefi belirsiz.`,
    );
  }
}
