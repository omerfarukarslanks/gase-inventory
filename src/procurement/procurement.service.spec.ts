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

const TENANT_ID = 'tenant-uuid-1111';
const USER_ID   = 'user-uuid-2222';
const STORE_ID  = 'store-uuid-3333';
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
  let goodsReceiptRepo: { find: jest.Mock };
  let productVariantRepo: { find: jest.Mock };
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
    } as any;
    auditLog = { log: jest.fn().mockResolvedValue(undefined) } as any;
    inventoryService = { receiveStock: jest.fn().mockResolvedValue({}) } as any;
    outbox = { publish: jest.fn().mockResolvedValue({}) } as any;
    purchaseOrderRepo = { findOne: jest.fn() };
    goodsReceiptRepo = { find: jest.fn() };
    productVariantRepo = { find: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcurementService,
        { provide: getRepositoryToken(PurchaseOrder),     useValue: purchaseOrderRepo },
        { provide: getRepositoryToken(PurchaseOrderLine), useValue: {} },
        { provide: getRepositoryToken(GoodsReceipt),      useValue: goodsReceiptRepo },
        { provide: getRepositoryToken(GoodsReceiptLine),  useValue: {} },
        { provide: getRepositoryToken(ProductVariant),    useValue: productVariantRepo },
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
        return poRepo;
      });

      const result = await service.createGoodsReceipt(PO_ID, {
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
});
