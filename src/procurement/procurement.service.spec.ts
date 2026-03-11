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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcurementService,
        { provide: getRepositoryToken(PurchaseOrder),     useValue: {} },
        { provide: getRepositoryToken(PurchaseOrderLine), useValue: {} },
        { provide: getRepositoryToken(GoodsReceipt),      useValue: {} },
        { provide: getRepositoryToken(GoodsReceiptLine),  useValue: {} },
        { provide: AppContextService,  useValue: appContext },
        { provide: InventoryService,   useValue: {} },
        { provide: DataSource,         useValue: dataSource },
        { provide: AuditLogService,    useValue: auditLog },
        { provide: OutboxService,      useValue: { publish: jest.fn().mockResolvedValue({}) } },
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
});
