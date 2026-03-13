import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ApprovalService } from './approval.service';
import {
  ApprovalEntityType,
  ApprovalRequest,
  ApprovalStatus,
} from './entities/approval-request.entity';
import { AppContextService } from 'src/common/context/app-context.service';
import { InventoryService } from 'src/inventory/inventory.service';
import { PriceService } from 'src/pricing/price.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';

const TENANT_ID = '457a00bf-5bd1-4fc5-af30-eab10b3cde2f';
const USER_ID = '12e064d7-7465-4f71-a262-42b716b76a18';
const STORE_ID = '1292efb0-ca75-4951-9641-8a75f47cf015';
const VARIANT_ID = '2fdf144e-8cf2-4112-a547-a909b15b6a91';
const PURCHASE_ORDER_ID = '49183f64-0a33-4572-8ad2-52c2c3f2e144';

describe('ApprovalService', () => {
  let service: ApprovalService;
  let repo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn((dto: any) => dto),
      save: jest.fn(async (dto: any) => dto),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalService,
        { provide: getRepositoryToken(ApprovalRequest), useValue: repo },
        {
          provide: AppContextService,
          useValue: {
            getTenantIdOrThrow: jest.fn().mockReturnValue(TENANT_ID),
            getUserIdOrThrow: jest.fn().mockReturnValue(USER_ID),
          },
        },
        { provide: InventoryService, useValue: { adjustStock: jest.fn() } },
        { provide: PriceService, useValue: { setStorePriceForVariant: jest.fn() } },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(ApprovalService);
  });

  describe('create()', () => {
    it('stock adjustment icin entityId olmadan stable dedupeKey uretir', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.create({
        entityType: ApprovalEntityType.STOCK_ADJUSTMENT,
        requestData: {
          storeId: STORE_ID,
          productVariantId: VARIANT_ID,
          newQuantity: 25,
        },
        requesterNotes: 'stok duzeltme',
      });

      expect(repo.findOne.mock.calls[0][0].where.dedupeKey).toBe(
        `STOCK_ADJUSTMENT:${STORE_ID}:${VARIANT_ID}`,
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          entityType: ApprovalEntityType.STOCK_ADJUSTMENT,
          entityId: undefined,
          dedupeKey: `STOCK_ADJUSTMENT:${STORE_ID}:${VARIANT_ID}`,
          requestedById: USER_ID,
          maxLevel: 1,
          status: ApprovalStatus.PENDING_L1,
        }),
      );
      expect(result.entityId).toBeUndefined();
    });

    it('purchase order icin entityIdyi requestData icinden derive eder', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.create({
        entityType: ApprovalEntityType.PURCHASE_ORDER,
        requestData: {
          purchaseOrderId: PURCHASE_ORDER_ID,
          totalAmount: 12500,
          currency: 'TRY',
        },
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: ApprovalEntityType.PURCHASE_ORDER,
          entityId: PURCHASE_ORDER_ID,
          dedupeKey: `PURCHASE_ORDER:${PURCHASE_ORDER_ID}`,
        }),
      );
      expect(result.entityId).toBe(PURCHASE_ORDER_ID);
    });

    it('bekleyen L2 approval varsa duplicate create istegini bloklar', async () => {
      repo.findOne.mockResolvedValue({ id: 'existing-approval-id' });

      await expect(
        service.create({
          entityType: ApprovalEntityType.PRICE_OVERRIDE,
          requestData: {
            storeId: STORE_ID,
            productVariantId: VARIANT_ID,
            newPrice: 199.9,
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('gerekli subject alani yoksa BadRequest firlatir', async () => {
      await expect(
        service.create({
          entityType: ApprovalEntityType.PURCHASE_ORDER,
          requestData: {
            totalAmount: 12500,
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
