import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { WarehouseService } from './warehouse.service';
import { Warehouse } from './entities/warehouse.entity';
import { Location } from './entities/location.entity';
import { CountSession, CountSessionStatus } from './entities/count-session.entity';
import { CountLine } from './entities/count-line.entity';
import { PutawayTask } from './entities/putaway-task.entity';
import { Wave } from './entities/wave.entity';
import { PickingTask } from './entities/picking-task.entity';
import { Store } from 'src/store/store.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { AppContextService } from 'src/common/context/app-context.service';
import { InventoryService } from 'src/inventory/inventory.service';

const TENANT_ID = '457a00bf-5bd1-4fc5-af30-eab10b3cde2f';
const USER_ID = '12e064d7-7465-4f71-a262-42b716b76a18';
const STORE_ID = '1292efb0-ca75-4951-9641-8a75f47cf015';
const WAREHOUSE_ID = '5de68f42-1fc8-4af4-9460-6ec7565bf4d7';

describe('WarehouseService', () => {
  let service: WarehouseService;
  let warehouseRepo: {
    find: jest.Mock;
  };
  let storeRepo: {
    find: jest.Mock;
  };
  let productVariantRepo: {
    find: jest.Mock;
  };
  let locationRepo: {
    find: jest.Mock;
  };
  let sessionRepo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
  };
  let lineRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    warehouseRepo = {
      find: jest.fn(),
    };

    storeRepo = {
      find: jest.fn(),
    };

    productVariantRepo = {
      find: jest.fn(),
    };

    locationRepo = {
      find: jest.fn(),
    };

    sessionRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
    };

    lineRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (line: any) => line),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WarehouseService,
        { provide: getRepositoryToken(Warehouse), useValue: warehouseRepo },
        { provide: getRepositoryToken(Store), useValue: storeRepo },
        { provide: getRepositoryToken(ProductVariant), useValue: productVariantRepo },
        { provide: getRepositoryToken(Location), useValue: locationRepo },
        { provide: getRepositoryToken(CountSession), useValue: sessionRepo },
        { provide: getRepositoryToken(CountLine), useValue: lineRepo },
        { provide: getRepositoryToken(PutawayTask), useValue: {} },
        { provide: getRepositoryToken(Wave), useValue: {} },
        { provide: getRepositoryToken(PickingTask), useValue: {} },
        {
          provide: AppContextService,
          useValue: {
            getTenantIdOrThrow: jest.fn().mockReturnValue(TENANT_ID),
            getUserIdOrThrow: jest.fn().mockReturnValue(USER_ID),
          },
        },
        { provide: InventoryService, useValue: {} },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();

    service = module.get(WarehouseService);
  });

  describe('count session responses', () => {
    it('listCountSessions responseuna storeName ve warehouseName ekler', async () => {
      const startedAt = new Date('2026-03-13T10:00:00.000Z');
      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'session-1',
            storeId: STORE_ID,
            warehouseId: WAREHOUSE_ID,
            status: CountSessionStatus.OPEN,
            startedAt,
          },
          {
            id: 'session-2',
            storeId: STORE_ID,
            warehouseId: null,
            status: CountSessionStatus.IN_PROGRESS,
            startedAt,
          },
        ]),
      };

      sessionRepo.createQueryBuilder.mockReturnValue(qb);
      storeRepo.find.mockResolvedValue([{ id: STORE_ID, name: 'Merkez Magaza' }]);
      warehouseRepo.find.mockResolvedValue([{ id: WAREHOUSE_ID, name: 'Ana Depo' }]);
      productVariantRepo.find.mockResolvedValue([]);
      locationRepo.find.mockResolvedValue([]);

      const result = await service.listCountSessions(STORE_ID);

      expect(qb.andWhere).toHaveBeenCalledWith('cs.storeId = :storeId', { storeId: STORE_ID });
      expect(result).toEqual([
        expect.objectContaining({
          id: 'session-1',
          storeId: STORE_ID,
          warehouseId: WAREHOUSE_ID,
          storeName: 'Merkez Magaza',
          warehouseName: 'Ana Depo',
        }),
        expect.objectContaining({
          id: 'session-2',
          storeId: STORE_ID,
          warehouseId: null,
          storeName: 'Merkez Magaza',
          warehouseName: null,
        }),
      ]);
    });

    it('getCountSession responseuna line icinde productName, variantName ve dogru difference ekler', async () => {
      const lines = [
        {
          id: 'line-1',
          productVariantId: 'variant-1',
          locationId: 'location-1',
          expectedQuantity: 100,
          countedQuantity: 98,
          difference: 0,
        },
      ];
      sessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        storeId: STORE_ID,
        warehouseId: WAREHOUSE_ID,
        status: CountSessionStatus.OPEN,
        lines,
      } satisfies Partial<CountSession>);
      storeRepo.find.mockResolvedValue([{ id: STORE_ID, name: 'Merkez Magaza' }]);
      warehouseRepo.find.mockResolvedValue([{ id: WAREHOUSE_ID, name: 'Ana Depo' }]);
      productVariantRepo.find.mockResolvedValue([
        {
          id: 'variant-1',
          name: 'Kirmizi / M',
          product: { name: 'Tisort' },
        },
      ]);
      locationRepo.find.mockResolvedValue([
        {
          id: 'location-1',
          name: 'A Blok Raf 1',
          code: 'A-01-R1',
        },
      ]);

      const result = await service.getCountSession('session-1');

      expect(result).toEqual(
        expect.objectContaining({
          id: 'session-1',
          storeId: STORE_ID,
          warehouseId: WAREHOUSE_ID,
          storeName: 'Merkez Magaza',
          warehouseName: 'Ana Depo',
          lines: [
            expect.objectContaining({
              id: 'line-1',
              productVariantId: 'variant-1',
              productName: 'Tisort',
              variantName: 'Kirmizi / M',
              locationName: 'A Blok Raf 1',
              difference: -2,
            }),
          ],
        }),
      );
    });

    it('updateCountLine countedQuantity degisince difference alanini yeniden hesaplar', async () => {
      sessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        storeId: STORE_ID,
        warehouseId: WAREHOUSE_ID,
        status: CountSessionStatus.IN_PROGRESS,
        lines: [],
      } satisfies Partial<CountSession>);
      lineRepo.findOne.mockResolvedValue({
        id: 'line-1',
        expectedQuantity: 100,
        countedQuantity: 100,
        difference: 0,
        updatedById: USER_ID,
      });

      const result = await service.updateCountLine('session-1', 'line-1', {
        countedQuantity: 98,
      });

      expect(lineRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'line-1',
          countedQuantity: 98,
          difference: -2,
          updatedById: USER_ID,
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          countedQuantity: 98,
          difference: -2,
        }),
      );
    });
  });
});
