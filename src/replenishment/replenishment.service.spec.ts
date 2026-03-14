import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReplenishmentService } from './replenishment.service';
import { ReplenishmentRule } from './entities/replenishment-rule.entity';
import { ReplenishmentSuggestion } from './entities/replenishment-suggestion.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { AppContextService } from 'src/common/context/app-context.service';
import { ProcurementService } from 'src/procurement/procurement.service';

const TENANT_ID = '457a00bf-5bd1-4fc5-af30-eab10b3cde2f';
const USER_ID = '12e064d7-7465-4f71-a262-42b716b76a18';

describe('ReplenishmentService', () => {
  let service: ReplenishmentService;
  let ruleRepo: {
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let suggestionRepo: Record<string, never>;
  let productVariantRepo: {
    find: jest.Mock;
  };

  beforeEach(async () => {
    ruleRepo = {
      create: jest.fn((dto: any) => dto),
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(async (entity: any) => entity),
    };

    suggestionRepo = {};

    productVariantRepo = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReplenishmentService,
        { provide: getRepositoryToken(ReplenishmentRule), useValue: ruleRepo },
        { provide: getRepositoryToken(ReplenishmentSuggestion), useValue: suggestionRepo },
        { provide: getRepositoryToken(ProductVariant), useValue: productVariantRepo },
        {
          provide: AppContextService,
          useValue: {
            getTenantIdOrThrow: jest.fn().mockReturnValue(TENANT_ID),
            getUserIdOrNull: jest.fn().mockReturnValue(USER_ID),
          },
        },
        {
          provide: ProcurementService,
          useValue: {
            createPurchaseOrder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ReplenishmentService);
  });

  describe('rule responses', () => {
    it('createRule responseuna productName ve variantName ekler', async () => {
      ruleRepo.save.mockResolvedValue({
        id: 'rule-1',
        tenant: { id: TENANT_ID },
        storeId: 'store-1',
        productVariantId: 'variant-1',
        minStock: 25,
        targetStock: 100,
        supplierId: 'supplier-1',
        leadTimeDays: 7,
        isActive: true,
      });
      productVariantRepo.find.mockResolvedValue([
        {
          id: 'variant-1',
          name: 'Kirmizi / M',
          product: { name: 'Tisort' },
        },
      ]);

      const result = await service.createRule({
        storeId: 'store-1',
        productVariantId: 'variant-1',
        minStock: 25,
        targetStock: 100,
        supplierId: 'supplier-1',
        leadTimeDays: 7,
      });

      expect(result).toEqual(
        expect.objectContaining({
          id: 'rule-1',
          productName: 'Tisort',
          variantName: 'Kirmizi / M',
        }),
      );
    });

    it('listRules responseundaki data satirlarina productName ve variantName ekler', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'rule-1',
              storeId: 'store-1',
              productVariantId: 'variant-1',
              minStock: 25,
              targetStock: 100,
              isActive: true,
            },
          ]),
      };
      ruleRepo.createQueryBuilder.mockReturnValue(qb);
      productVariantRepo.find.mockResolvedValue([
        {
          id: 'variant-1',
          name: 'Kirmizi / M',
          product: { name: 'Tisort' },
        },
      ]);

      const result = await service.listRules({
        page: 1,
        limit: 10,
        storeId: '1292efb0-ca75-4951-9641-8a75f47cf015',
        isActive: true,
        hasPagination: true,
        skip: 0,
      } as any);

      expect(result).toEqual({
        data: [
          expect.objectContaining({
            id: 'rule-1',
            productName: 'Tisort',
            variantName: 'Kirmizi / M',
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

    it('getRule responseuna productName ve variantName ekler', async () => {
      ruleRepo.findOne.mockResolvedValue({
        id: 'rule-1',
        tenant: { id: TENANT_ID },
        storeId: 'store-1',
        productVariantId: 'variant-1',
        minStock: 25,
        targetStock: 100,
        isActive: true,
      });
      productVariantRepo.find.mockResolvedValue([
        {
          id: 'variant-1',
          name: 'Kirmizi / M',
          product: { name: 'Tisort' },
        },
      ]);

      const result = await service.getRule('rule-1');

      expect(result).toEqual(
        expect.objectContaining({
          id: 'rule-1',
          productName: 'Tisort',
          variantName: 'Kirmizi / M',
        }),
      );
    });
  });
});
