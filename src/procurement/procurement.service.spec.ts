import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProcurementService } from './procurement.service';
import { PurchaseOrder, PurchaseOrderStatus } from './entities/purchase-order.entity';
import { PurchaseOrderLine } from './entities/purchase-order-line.entity';
import { GoodsReceipt } from './entities/goods-receipt.entity';
import { GoodsReceiptLine } from './entities/goods-receipt-line.entity';
import { AppContextService } from 'src/common/context/app-context.service';
import { InventoryService } from 'src/inventory/inventory.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { OutboxService } from 'src/outbox/outbox.service';
import { ProductVariant } from 'src/product/product-variant.entity';
import { Store } from 'src/store/store.entity';
import { Warehouse } from 'src/warehouse/entities/warehouse.entity';

const TENANT_ID = 'tenant-uuid-1111';
const USER_ID   = 'user-uuid-2222';
const STORE_ID  = 'store-uuid-3333';
const WAREHOUSE_ID = 'warehouse-uuid-9999';
const VARIANT_ID = 'variant-uuid-4444';
const PO_ID     = 'po-uuid-5555';

function makePo(status: PurchaseOrderStatus): PurchaseOrder {
  return {
    id: PO_ID,
    status,
    tenantId: TENANT_ID,
    lines: [],
  } as any;
}

/** DataSource.transaction mock'u — callback'i hemen çalıştırır */
function makeDataSource(manager: any) {
  return {
    transaction: jest.fn(async (cb: (m: any) => any) => cb(manager)),
  };
}

describe('ProcurementService', () => {
  let service: ProcurementService;
  let dataSource: ReturnType<typeof makeDataSource>;
  let appContext: jest.Mocked<AppContextService>;
  let auditLog: jest.Mocked<AuditLogService>;
  let inventoryService: jest.Mocked<InventoryService>;
  let outbox: jest.Mocked<OutboxService>;
  let purchaseOrderRepo: { findOne: jest.Mock };
  let goodsReceiptRepo: { createQueryBuilder: jest.Mock; find: jest.Mock; findOne: jest.Mock };
  let productVariantRepo: { find: jest.Mock };
  let storeRepo: { find: jest.Mock; findOne: jest.Mock };
  let warehouseRepo: { find: jest.Mock };
  let manager: any;

  beforeEach(async () => {
    manager = {
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn(),
        save: jest.fn(),
        create: jest.fn((dto: any) => dto),
      }),
    };

    dataSource = makeDataSource(manager);
    appContext  = {
      getTenantIdOrThrow: jest.fn().mockReturnValue(TENANT_ID),
      getUserIdOrNull: jest.fn().mockReturnValue(USER_ID),
      getStoreId: jest.fn().mockReturnValue(undefined),
    } as any;
    auditLog = { log: jest.fn().mockResolvedValue(undefined) } as any;
    inventoryService = { receiveStock: jest.fn().mockResolvedValue({}) } as any;
    outbox = { publish: jest.fn().mockResolvedValue({}) } as any;
    purchaseOrderRepo = { findOne: jest.fn() };
    goodsReceiptRepo = {
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    productVariantRepo = { find: jest.fn().mockResolvedValue([]) };
    storeRepo = { find: jest.fn(), findOne: jest.fn() };
    warehouseRepo = { find: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcurementService,
        { provide: getRepositoryToken(PurchaseOrder),     useValue: purchaseOrderRepo },
        { provide: getRepositoryToken(PurchaseOrderLine), useValue: {} },
        { provide: getRepositoryToken(GoodsReceipt),      useValue: goodsReceiptRepo },
        { provide: getRepositoryToken(GoodsReceiptLine),  useValue: {} },
        { provide: getRepositoryToken(ProductVariant),    useValue: productVariantRepo },
        { provide: getRepositoryToken(Store),             useValue: storeRepo },
        { provide: getRepositoryToken(Warehouse),         useValue: warehouseRepo },
        { provide: AppContextService,  useValue: appContext },
        { provide: InventoryService,   useValue: inventoryService },
        { provide: DataSource,         useValue: dataSource },
        { provide: AuditLogService,    useValue: auditLog },
        { provide: OutboxService,      useValue: outbox },
      ],
    }).compile();

    service = module.get(ProcurementService);
  });

  // ── createPurchaseOrder ──────────────────────────────────────────────────

  describe('createPurchaseOrder()', () => {
    it('DRAFT status ile PO oluşturur ve satırları kaydeder', async () => {
      const createdPo = makePo(PurchaseOrderStatus.DRAFT);
      const poRepo = {
        create: jest.fn().mockReturnValue(createdPo),
        save:   jest.fn().mockResolvedValue(createdPo),
        findOne: jest.fn().mockResolvedValue({ ...createdPo, lines: [] }),
      };
      const lineRepo = {
        create: jest.fn().mockImplementation((dto) => dto),
        save:   jest.fn().mockResolvedValue([]),
      };

      manager.getRepository.mockImplementation((entity: any) => {
        if (entity === PurchaseOrder)     return poRepo;
        if (entity === PurchaseOrderLine) return lineRepo;
        return poRepo; // fallback for findPurchaseOrderOrThrow
      });

      const dto = {
        storeId: STORE_ID,
        lines: [{ productVariantId: VARIANT_ID, quantity: 5, unitPrice: 100 }],
      };

      const result = await service.createPurchaseOrder(dto as any);
      expect(poRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: PurchaseOrderStatus.DRAFT }),
      );
      expect(lineRepo.save).toHaveBeenCalled();
      expect(result.status).toBe(PurchaseOrderStatus.DRAFT);
    });
  });

  // ── approvePurchaseOrder ─────────────────────────────────────────────────

  describe('approvePurchaseOrder()', () => {
    it('DRAFT → APPROVED geçişini yapar', async () => {
      const po = makePo(PurchaseOrderStatus.DRAFT);
      const poRepo = {
        findOne: jest.fn().mockResolvedValue({ ...po, lines: [] }),
        save: jest.fn().mockImplementation((entity) => entity),
      };
      manager.getRepository.mockReturnValue(poRepo);

      const result = await service.approvePurchaseOrder(PO_ID);
      expect(result.status).toBe(PurchaseOrderStatus.APPROVED);
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PO_APPROVED' }),
        manager,
      );
    });

    it('DRAFT olmayan PO onaylamaya çalışınca BadRequestException fırlatır', async () => {
      const po = makePo(PurchaseOrderStatus.APPROVED);
      const poRepo = {
        findOne: jest.fn().mockResolvedValue({ ...po, lines: [] }),
        save: jest.fn(),
      };
      manager.getRepository.mockReturnValue(poRepo);

      await expect(service.approvePurchaseOrder(PO_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ── cancelPurchaseOrder ──────────────────────────────────────────────────

  describe('cancelPurchaseOrder()', () => {
    it.each([PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.APPROVED])(
      '%s durumundaki PO iptal edilebilir',
      async (status) => {
        const po = makePo(status);
        const poRepo = {
          findOne: jest.fn().mockResolvedValue({ ...po, lines: [] }),
          save: jest.fn().mockImplementation((entity) => entity),
        };
        manager.getRepository.mockReturnValue(poRepo);

        const result = await service.cancelPurchaseOrder(PO_ID);
        expect(result.status).toBe(PurchaseOrderStatus.CANCELLED);
      },
    );

    it('RECEIVED durumundaki PO iptal edilemez', async () => {
      const po = makePo(PurchaseOrderStatus.RECEIVED);
      const poRepo = {
        findOne: jest.fn().mockResolvedValue({ ...po, lines: [] }),
        save: jest.fn(),
      };
      manager.getRepository.mockReturnValue(poRepo);

      await expect(service.cancelPurchaseOrder(PO_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ── createGoodsReceipt ───────────────────────────────────────────────────

  describe('createGoodsReceipt()', () => {
    it('PO statusunu relation graph olmadan gunceller', async () => {
      const savedGr = { id: 'gr-uuid-6666' } as GoodsReceipt;
      const poLine = {
        id: 'line-uuid-7777',
        productVariantId: VARIANT_ID,
        quantity: 100,
        receivedQuantity: 0,
      } as PurchaseOrderLine;
      const po = {
        id: PO_ID,
        status: PurchaseOrderStatus.APPROVED,
        supplierId: 'supplier-uuid-8888',
        store: { id: STORE_ID },
        lines: [poLine],
        goodsReceipts: [],
      } as any;
      const receiptLine = {
        purchaseOrderLine: poLine,
      } as GoodsReceiptLine;
      const hydratedReceipt = {
        ...savedGr,
        lines: [receiptLine],
      } as GoodsReceipt;

      const poRepo = {
        findOne: jest.fn().mockResolvedValue(po),
        save: jest.fn().mockImplementation((entity) => entity),
      };
      const poLineRepo = {
        save: jest.fn().mockResolvedValue(poLine),
      };
      const grRepo = {
        create: jest.fn().mockImplementation((dto) => dto),
        save: jest.fn().mockResolvedValue(savedGr),
        findOne: jest.fn().mockResolvedValue(hydratedReceipt),
      };
      const grLineRepo = {
        create: jest.fn().mockImplementation((dto) => dto),
        save: jest.fn().mockResolvedValue({}),
      };
      const warehouseRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: WAREHOUSE_ID,
          storeId: STORE_ID,
          isActive: true,
        }),
      };
      productVariantRepo.find.mockResolvedValue([
        {
          id: VARIANT_ID,
          name: 'Kirmizi / M',
          product: { name: 'Tisort' },
        },
      ]);

      manager.getRepository.mockImplementation((entity: any) => {
        if (entity === PurchaseOrder) return poRepo;
        if (entity === PurchaseOrderLine) return poLineRepo;
        if (entity === GoodsReceipt) return grRepo;
        if (entity === GoodsReceiptLine) return grLineRepo;
        if (entity === Warehouse) return warehouseRepo;
        return poRepo;
      });

      const result = await service.createGoodsReceipt(PO_ID, {
        warehouseId: WAREHOUSE_ID,
        lines: [
          {
            purchaseOrderLineId: poLine.id,
            receivedQuantity: 100,
            lotNumber: 'LOT-001',
            expiryDate: '2026-03-26',
          },
        ],
      } as any);

      expect(inventoryService.receiveStock).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: STORE_ID,
          productVariantId: VARIANT_ID,
          quantity: 100,
        }),
        manager,
      );
      expect(grRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          warehouseId: WAREHOUSE_ID,
        }),
      );
      expect(outbox.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            goodsReceiptId: savedGr.id,
            warehouseId: WAREHOUSE_ID,
          }),
        }),
        manager,
      );
      expect(poRepo.save).toHaveBeenCalledWith({
        id: PO_ID,
        status: PurchaseOrderStatus.RECEIVED,
        updatedById: USER_ID,
      });
      expect(result.lines[0]).toEqual(
        expect.objectContaining({
          productName: 'Tisort',
          variantName: 'Kirmizi / M',
        }),
      );
    });

    it('warehouse siparisin magazasi ile uyusmuyorsa BadRequest firlatir', async () => {
      const poLine = {
        id: 'line-uuid-7777',
        productVariantId: VARIANT_ID,
        quantity: 10,
        receivedQuantity: 0,
      } as PurchaseOrderLine;
      const po = {
        id: PO_ID,
        status: PurchaseOrderStatus.APPROVED,
        store: { id: STORE_ID },
        lines: [poLine],
        goodsReceipts: [],
      } as any;
      const poRepo = {
        findOne: jest.fn().mockResolvedValue(po),
        save: jest.fn(),
      };
      const warehouseRepo = {
        findOne: jest.fn().mockResolvedValue(null),
      };

      manager.getRepository.mockImplementation((entity: any) => {
        if (entity === PurchaseOrder) return poRepo;
        if (entity === Warehouse) return warehouseRepo;
        return {
          findOne: jest.fn(),
          save: jest.fn(),
          create: jest.fn((dto: any) => dto),
        };
      });

      await expect(
        service.createGoodsReceipt(PO_ID, {
          warehouseId: WAREHOUSE_ID,
          lines: [
            {
              purchaseOrderLineId: poLine.id,
              receivedQuantity: 5,
            },
          ],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('liste responseunda da productName ve variantName doner', async () => {
      const poLine = {
        id: 'line-uuid-7777',
        productVariantId: VARIANT_ID,
      } as PurchaseOrderLine;
      const po = {
        id: PO_ID,
        lines: [],
        goodsReceipts: [],
      } as any;
      const receipt = {
        id: 'gr-uuid-6666',
        warehouseId: WAREHOUSE_ID,
        lines: [{ purchaseOrderLine: poLine }],
      } as any;

      purchaseOrderRepo.findOne.mockResolvedValue(po);
      goodsReceiptRepo.find.mockResolvedValue([receipt]);
      productVariantRepo.find.mockResolvedValue([
        {
          id: VARIANT_ID,
          name: 'Kirmizi / M',
          product: { name: 'Tisort' },
        },
      ]);

      const result = await service.listGoodsReceipts(PO_ID);

      expect(result[0].lines[0]).toEqual(
        expect.objectContaining({
          productName: 'Tisort',
          variantName: 'Kirmizi / M',
        }),
      );
    });
  });

  // ── getPurchaseOrder ─────────────────────────────────────────────────────

  describe('getPurchaseOrder()', () => {
    it('detail responseunda line icinde productName ve variantName doner', async () => {
      const po = {
        id: PO_ID,
        lines: [
          {
            id: 'line-uuid-7777',
            productVariantId: VARIANT_ID,
          },
        ],
        goodsReceipts: [],
      } as any;

      purchaseOrderRepo.findOne.mockResolvedValue(po);
      productVariantRepo.find.mockResolvedValue([
        {
          id: VARIANT_ID,
          name: 'Kirmizi / M',
          product: { name: 'Tisort' },
        },
      ]);

      const result = await service.getPurchaseOrder(PO_ID);

      expect(result.lines[0]).toEqual(
        expect.objectContaining({
          productName: 'Tisort',
          variantName: 'Kirmizi / M',
        }),
      );
    });
  });

  // ── central goods receipt endpoints ──────────────────────────────────────

  describe('central goods receipt endpoints', () => {
    it('listAllGoodsReceipts responseunda merkezi liste alanlarini doner', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'gr-uuid-6666',
            purchaseOrder: { id: PO_ID },
            warehouseId: WAREHOUSE_ID,
            receivedAt: new Date('2026-03-14T09:00:00.000Z'),
            notes: 'Merkezi liste kaydi',
            store: { id: STORE_ID, name: 'Merkez Magaza' },
          },
        ]),
      };
      goodsReceiptRepo.createQueryBuilder.mockReturnValue(qb);
      goodsReceiptRepo.find.mockResolvedValue([
        {
          id: 'gr-uuid-6666',
          lines: [
            { receivedQuantity: 40 },
            { receivedQuantity: 60 },
          ],
        },
      ]);
      storeRepo.find.mockResolvedValue([{ id: STORE_ID }]);
      warehouseRepo.find.mockResolvedValue([{ id: WAREHOUSE_ID, name: 'Ana Depo' }]);

      const result = await service.listAllGoodsReceipts({
        page: 1,
        limit: 10,
        storeId: STORE_ID,
        hasPagination: true,
        skip: 0,
      } as any);

      expect(result).toEqual({
        data: [
          expect.objectContaining({
            id: 'gr-uuid-6666',
            purchaseOrderId: PO_ID,
            purchaseOrderReference: 'PO-PO-UUID-',
            warehouseId: WAREHOUSE_ID,
            warehouseName: 'Ana Depo',
            lineCount: 2,
            totalReceivedQuantity: 100,
            store: {
              id: STORE_ID,
              name: 'Merkez Magaza',
            },
          }),
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      });
    });

    it('getGoodsReceipt responseunda purchaseOrderId, warehouseName ve line detaylari doner', async () => {
      goodsReceiptRepo.findOne.mockResolvedValue({
        id: 'gr-uuid-6666',
        purchaseOrder: { id: PO_ID },
        warehouseId: WAREHOUSE_ID,
        receivedAt: new Date('2026-03-14T09:00:00.000Z'),
        notes: 'Detay kaydi',
        store: { id: STORE_ID, name: 'Merkez Magaza' },
        lines: [
          {
            id: 'receipt-line-1',
            receivedQuantity: 100,
            lotNumber: 'LOT-001',
            expiryDate: new Date('2026-03-26'),
            purchaseOrderLine: {
              id: 'po-line-1',
              productVariantId: VARIANT_ID,
              quantity: 100,
              receivedQuantity: 100,
            },
          },
        ],
      });
      warehouseRepo.find.mockResolvedValue([{ id: WAREHOUSE_ID, name: 'Ana Depo' }]);
      productVariantRepo.find.mockResolvedValue([
        {
          id: VARIANT_ID,
          name: 'Kirmizi / M',
          product: { name: 'Tisort' },
        },
      ]);

      const result = await service.getGoodsReceipt('gr-uuid-6666');

      expect(result).toEqual(
        expect.objectContaining({
          id: 'gr-uuid-6666',
          purchaseOrderId: PO_ID,
          purchaseOrderReference: 'PO-PO-UUID-',
          warehouseId: WAREHOUSE_ID,
          warehouseName: 'Ana Depo',
          store: {
            id: STORE_ID,
            name: 'Merkez Magaza',
          },
          lines: [
            expect.objectContaining({
              id: 'receipt-line-1',
              productName: 'Tisort',
              variantName: 'Kirmizi / M',
            }),
          ],
        }),
      );
    });
  });
});
