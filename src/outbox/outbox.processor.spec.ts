import { DataSource } from 'typeorm';
import { OutboxProcessor } from './outbox.processor';
import { OutboxService } from './outbox.service';
import { OutboxEvent, OutboxEventStatus } from './outbox-event.entity';
import { PutawayTaskStatus } from 'src/warehouse/entities/putaway-task.entity';
import { GoodsReceipt } from 'src/procurement/entities/goods-receipt.entity';
import { Warehouse } from 'src/warehouse/entities/warehouse.entity';
import { Location } from 'src/warehouse/entities/location.entity';
import { PutawayTask } from 'src/warehouse/entities/putaway-task.entity';

const TENANT_ID = '457a00bf-5bd1-4fc5-af30-eab10b3cde2f';
const STORE_ID = '1292efb0-ca75-4951-9641-8a75f47cf015';
const GOODS_RECEIPT_ID = '81a6f9fd-783c-4756-bbf8-d2f07764efa8';
const WAREHOUSE_ID = '5de68f42-1fc8-4af4-9460-6ec7565bf4d7';
const LOCATION_ID = '0d1207d0-35c1-44f9-a1fd-d1c0f2ef2d14';

describe('OutboxProcessor', () => {
  let processor: OutboxProcessor;
  let outboxService: jest.Mocked<OutboxService>;
  let dataSource: { transaction: jest.Mock };
  let putawayRepo: {
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let goodsReceiptRepo: {
    findOne: jest.Mock;
  };
  let warehouseRepo: {
    findOne: jest.Mock;
  };
  let locationRepo: {
    find: jest.Mock;
  };

  const event: OutboxEvent = {
    id: 'event-1',
    tenantId: TENANT_ID,
    eventType: 'goods_receipt.created',
    payload: {
      goodsReceiptId: GOODS_RECEIPT_ID,
      warehouseId: WAREHOUSE_ID,
      purchaseOrderId: 'po-1',
    },
    status: OutboxEventStatus.PENDING,
    retryCount: 0,
    nextRetryAt: new Date('2026-03-13T10:00:00.000Z'),
    processedAt: undefined,
    lastError: undefined,
    createdAt: new Date('2026-03-13T10:00:00.000Z'),
    updatedAt: new Date('2026-03-13T10:00:00.000Z'),
  };

  beforeEach(() => {
    outboxService = {
      fetchPending: jest.fn().mockResolvedValue([event]),
      markSent: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      markDeadLetter: jest.fn().mockResolvedValue(undefined),
    } as any;

    putawayRepo = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((dto: any) => dto),
      save: jest.fn().mockResolvedValue(undefined),
    };

    goodsReceiptRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: GOODS_RECEIPT_ID,
        warehouseId: WAREHOUSE_ID,
        createdById: 'user-1',
        updatedById: 'user-1',
        lines: [
          {
            id: 'line-1',
            receivedQuantity: 20,
            purchaseOrderLine: { productVariantId: 'variant-1' },
          },
          {
            id: 'line-2',
            receivedQuantity: 5,
            purchaseOrderLine: { productVariantId: 'variant-2' },
          },
        ],
      } satisfies Partial<GoodsReceipt>),
    };

    warehouseRepo = {
      findOne: jest.fn().mockResolvedValue(
        { id: WAREHOUSE_ID, storeId: STORE_ID, isActive: true },
      ),
    };

    locationRepo = {
      find: jest.fn().mockResolvedValue([
        { id: LOCATION_ID, code: 'A-01-B1', name: 'Varsayilan Raf', isActive: true },
      ]),
    };

    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === PutawayTask) return putawayRepo;
        if (entity === GoodsReceipt) return goodsReceiptRepo;
        if (entity === Warehouse) return warehouseRepo;
        if (entity === Location) return locationRepo;
        throw new Error('Unknown repository request');
      }),
    };

    dataSource = {
      transaction: jest.fn(async (callback: (manager: any) => Promise<void>) => callback(manager)),
    };

    processor = new OutboxProcessor(outboxService, dataSource as unknown as DataSource);
  });

  it('goods_receipt.created eventinden otomatik putaway taskleri olusturur', async () => {
    await processor.processPendingEvents();

    expect(putawayRepo.count).toHaveBeenCalledWith({
      where: {
        tenant: { id: TENANT_ID },
        goodsReceiptId: GOODS_RECEIPT_ID,
      },
    });
    expect(putawayRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        warehouseId: WAREHOUSE_ID,
        productVariantId: 'variant-1',
        quantity: 20,
        goodsReceiptId: GOODS_RECEIPT_ID,
        goodsReceiptLineId: 'line-1',
        status: PutawayTaskStatus.PENDING,
        toLocation: expect.objectContaining({ id: LOCATION_ID }),
      }),
      expect.objectContaining({
        warehouseId: WAREHOUSE_ID,
        productVariantId: 'variant-2',
        quantity: 5,
        goodsReceiptId: GOODS_RECEIPT_ID,
        goodsReceiptLineId: 'line-2',
        status: PutawayTaskStatus.PENDING,
        toLocation: expect.objectContaining({ id: LOCATION_ID }),
      }),
    ]);
    expect(outboxService.markSent).toHaveBeenCalledWith('event-1');
  });

  it('ayni goods receipt icin task zaten varsa duplicate olusturmaz', async () => {
    putawayRepo.count.mockResolvedValue(2);

    await processor.processPendingEvents();

    expect(goodsReceiptRepo.findOne).not.toHaveBeenCalled();
    expect(putawayRepo.save).not.toHaveBeenCalled();
    expect(outboxService.markSent).toHaveBeenCalledWith('event-1');
  });

  it('warehouse secimi belirsizse eventi failed olarak isaretler', async () => {
    warehouseRepo.findOne.mockResolvedValue(null);

    await processor.processPendingEvents();

    expect(outboxService.markFailed).toHaveBeenCalledWith(
      'event-1',
      expect.stringContaining('aktif warehouse bulunamadi'),
      expect.any(Date),
    );
    expect(outboxService.markSent).not.toHaveBeenCalled();
  });
});
