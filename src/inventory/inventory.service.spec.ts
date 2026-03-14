import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InventoryService } from './inventory.service';
import { InventoryMovement, MovementType } from './inventory-movement.entity';
import { StoreVariantStock } from './store-variant-stock.entity';
import { StockBalance } from './stock-balance.entity';
import { Store } from 'src/store/store.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { StoreProductPrice } from 'src/pricing/store-product-price.entity';
import { Supplier } from 'src/supplier/supplier.entity';
import { SerialNumber } from './serial-number.entity';
import { AppContextService } from 'src/common/context/app-context.service';
import { Location } from 'src/warehouse/entities/location.entity';

const TENANT_ID  = 'tenant-aaa';
const STORE_ID   = 'store-bbb';
const VARIANT_ID = 'variant-ccc';
const USER_ID    = 'user-ddd';

function makeTxManager(overrides: Record<string, Partial<ReturnType<any['getRepository']>>> = {}) {
  const defaultRepo = {
    findOne:   jest.fn(),
    find:      jest.fn(),
    save:      jest.fn().mockImplementation((e: any) => e),
    create:    jest.fn().mockImplementation((dto: any) => dto),
    createQueryBuilder: jest.fn().mockReturnValue({
      update:    jest.fn().mockReturnThis(),
      set:       jest.fn().mockReturnThis(),
      where:     jest.fn().mockReturnThis(),
      andWhere:  jest.fn().mockReturnThis(),
      execute:   jest.fn().mockResolvedValue({ affected: 1 }),
      select:    jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      leftJoin:  jest.fn().mockReturnThis(),
      getOne:    jest.fn(),
      getMany:   jest.fn().mockResolvedValue([]),
    }),
  };

  return {
    getRepository: jest.fn().mockImplementation((entity: any) => {
      const name = entity?.name ?? entity;
      return overrides[name] ?? { ...defaultRepo };
    }),
  };
}

const defaultQb = () => ({
  where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(), leftJoin: jest.fn().mockReturnThis(),
  getOne: jest.fn().mockResolvedValue(null), getMany: jest.fn().mockResolvedValue([]),
  getRawOne: jest.fn().mockResolvedValue({ sum: '0' }),
  getRawMany: jest.fn().mockResolvedValue([]),
  update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue({}),
  limit: jest.fn().mockReturnThis(), offset: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
});

/** movementRepo mock — manager.transaction callback'i hemen çalıştırır */
function makeMovementRepo(txManager: any) {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn().mockImplementation((e: any) => e),
    create: jest.fn().mockImplementation((d: any) => d),
    createQueryBuilder: jest.fn().mockImplementation(() => defaultQb()),
    manager: {
      transaction: jest.fn(async (cb: (m: any) => any) => cb(txManager)),
    },
  };
}

describe('InventoryService — adjustStock', () => {
  let service: InventoryService;
  let appContext: jest.Mocked<AppContextService>;

  beforeEach(async () => {
    const txManager = makeTxManager();

    appContext = {
      getTenantIdOrThrow:  jest.fn().mockReturnValue(TENANT_ID),
      getUserIdOrNull:     jest.fn().mockReturnValue(USER_ID),
      getStoreId:          jest.fn().mockReturnValue(null),
      getTenantId:         jest.fn().mockReturnValue(TENANT_ID),
    } as any;

    const emptyRepo = { findOne: jest.fn(), find: jest.fn(), save: jest.fn(), create: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: getRepositoryToken(InventoryMovement),  useValue: makeMovementRepo(txManager) },
        { provide: getRepositoryToken(StoreVariantStock),  useValue: emptyRepo },
        { provide: getRepositoryToken(StockBalance),       useValue: emptyRepo },
        { provide: getRepositoryToken(Store),              useValue: emptyRepo },
        { provide: getRepositoryToken(ProductVariant),     useValue: emptyRepo },
        { provide: getRepositoryToken(StoreProductPrice),  useValue: emptyRepo },
        { provide: getRepositoryToken(Supplier),           useValue: emptyRepo },
        { provide: getRepositoryToken(SerialNumber),       useValue: emptyRepo },
        { provide: getRepositoryToken(Location),           useValue: emptyRepo },
        { provide: AppContextService, useValue: appContext },
        { provide: DataSource,        useValue: {} },
      ],
    }).compile();

    service = module.get(InventoryService);
  });

  it('servis tanımlı olmalı', () => {
    expect(service).toBeDefined();
  });

  it('adjustStock — newQuantity verilmeden items boş gönderilince BadRequestException fırlatır', async () => {
    // items boşsa hasItems=false, hasVariantId=false, hasProductId=false →
    // newQuantity undefined → BadRequestException
    await expect(
      service.adjustStock({ items: [] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('adjustStock — items ve productVariantId aynı anda gönderilince BadRequestException fırlatır', async () => {
    await expect(
      service.adjustStock({
        items: [{ storeId: STORE_ID, productVariantId: VARIANT_ID, newQuantity: 10 }],
        productVariantId: VARIANT_ID,
      } as any),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('InventoryService — receiveStock input validation', () => {
  let service: InventoryService;
  let appContext: jest.Mocked<AppContextService>;

  beforeEach(async () => {
    const qbMock = {
      where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(), leftJoin: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null), getMany: jest.fn().mockResolvedValue([]),
      getRawOne: jest.fn().mockResolvedValue(null), getRawMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(), execute: jest.fn().mockResolvedValue({}),
    };
    const fullRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((e: any) => e),
      create: jest.fn().mockImplementation((d: any) => d),
      createQueryBuilder: jest.fn().mockReturnValue(qbMock),
    };
    const txManager = { getRepository: jest.fn().mockReturnValue(fullRepo) };

    appContext = {
      getTenantIdOrThrow: jest.fn().mockReturnValue(TENANT_ID),
      getUserIdOrNull:    jest.fn().mockReturnValue(USER_ID),
      getUserIdOrThrow:   jest.fn().mockReturnValue(USER_ID),
      getStoreId:         jest.fn().mockReturnValue(null),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: getRepositoryToken(InventoryMovement),  useValue: makeMovementRepo(txManager) },
        { provide: getRepositoryToken(StoreVariantStock),  useValue: fullRepo },
        { provide: getRepositoryToken(StockBalance),       useValue: fullRepo },
        { provide: getRepositoryToken(Store),              useValue: fullRepo },
        { provide: getRepositoryToken(ProductVariant),     useValue: fullRepo },
        { provide: getRepositoryToken(StoreProductPrice),  useValue: fullRepo },
        { provide: getRepositoryToken(Supplier),           useValue: fullRepo },
        { provide: getRepositoryToken(SerialNumber),       useValue: fullRepo },
        { provide: getRepositoryToken(Location),           useValue: fullRepo },
        { provide: AppContextService, useValue: appContext },
        { provide: DataSource,        useValue: {} },
      ],
    }).compile();

    service = module.get(InventoryService);
  });

  it('receiveStock — storeId bulunamazsa NotFoundException fırlatır', async () => {
    // txManager.getRepository(...).findOne → null → NotFoundException
    await expect(
      service.receiveStock({ storeId: STORE_ID, productVariantId: VARIANT_ID, quantity: 5 }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('InventoryService — getStockForVariantInStore', () => {
  let service: InventoryService;
  let appContext: jest.Mocked<AppContextService>;

  beforeEach(async () => {
    appContext  = {
      getTenantIdOrThrow: jest.fn().mockReturnValue(TENANT_ID),
      getUserIdOrNull:    jest.fn().mockReturnValue(null),
      getUserIdOrThrow:   jest.fn().mockReturnValue(USER_ID),
      getStoreId:         jest.fn().mockReturnValue(null),
    } as any;

    const mockStore   = { id: STORE_ID,   tenant: { id: TENANT_ID } };
    const mockVariant = { id: VARIANT_ID, tenant: { id: TENANT_ID } };
    const qbMock = {
      where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null), getMany: jest.fn().mockResolvedValue([]),
      getRawOne: jest.fn().mockResolvedValue(null), getRawMany: jest.fn().mockResolvedValue([]),
    };
    const emptyRepo = { findOne: jest.fn(), find: jest.fn(), save: jest.fn(), create: jest.fn(), createQueryBuilder: jest.fn().mockReturnValue(qbMock) };
    const txManager = makeTxManager();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: getRepositoryToken(InventoryMovement),  useValue: makeMovementRepo(txManager) },
        { provide: getRepositoryToken(StoreVariantStock),  useValue: { findOne: jest.fn().mockResolvedValue(null), createQueryBuilder: jest.fn().mockReturnValue(qbMock), create: jest.fn().mockImplementation((d: any) => ({ ...d, quantity: 0 })), save: jest.fn().mockImplementation((e: any) => e) } },
        { provide: getRepositoryToken(StockBalance),       useValue: emptyRepo },
        { provide: getRepositoryToken(Store),  useValue: { findOne: jest.fn().mockResolvedValue(mockStore), createQueryBuilder: jest.fn().mockReturnValue(qbMock) } },
        { provide: getRepositoryToken(ProductVariant),  useValue: { findOne: jest.fn().mockResolvedValue(mockVariant), createQueryBuilder: jest.fn().mockReturnValue(qbMock) } },
        { provide: getRepositoryToken(StoreProductPrice),  useValue: emptyRepo },
        { provide: getRepositoryToken(Supplier),           useValue: emptyRepo },
        { provide: getRepositoryToken(SerialNumber),       useValue: emptyRepo },
        { provide: getRepositoryToken(Location),           useValue: emptyRepo },
        { provide: AppContextService, useValue: appContext },
        { provide: DataSource,        useValue: {} },
      ],
    }).compile();

    service = module.get(InventoryService);
  });

  it('stok kaydı yoksa 0 döner', async () => {
    const result = await service.getStockForVariantInStore(STORE_ID, VARIANT_ID);
    expect(result).toBe(0);
  });
});

describe('InventoryService — getMovementHistory', () => {
  let service: InventoryService;
  let appContext: jest.Mocked<AppContextService>;
  let locationRepo: { find: jest.Mock };
  let movementRepo: { createQueryBuilder: jest.Mock; manager: { transaction: jest.Mock } };

  beforeEach(async () => {
    appContext = {
      getTenantIdOrThrow: jest.fn().mockReturnValue(TENANT_ID),
      getUserIdOrNull: jest.fn().mockReturnValue(USER_ID),
      getUserIdOrThrow: jest.fn().mockReturnValue(USER_ID),
      getStoreId: jest.fn().mockReturnValue(null),
    } as any;

    const qbMock = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([
        [
          {
            id: 'movement-1',
            tenant: { id: TENANT_ID },
            store: { id: STORE_ID, name: 'Merkez Magaza' },
            productVariant: {
              id: VARIANT_ID,
              name: 'Kirmizi / M',
              product: {
                id: 'product-1',
                name: 'Tisort',
              },
            },
            type: MovementType.IN,
            quantity: 10,
            meta: { reason: 'Sayim fazlasi' },
            locationId: 'location-1',
            createdAt: new Date('2026-03-14T09:00:00.000Z'),
          },
          {
            id: 'movement-2',
            tenant: { id: TENANT_ID },
            store: { id: STORE_ID, name: 'Merkez Magaza' },
            productVariant: {
              id: VARIANT_ID,
              name: 'Kirmizi / M',
              product: {
                id: 'product-1',
                name: 'Tisort',
              },
            },
            type: MovementType.ADJUSTMENT,
            quantity: -2,
            meta: {},
            createdAt: new Date('2026-03-14T08:00:00.000Z'),
          },
        ],
        2,
      ]),
    };

    movementRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qbMock),
      manager: {
        transaction: jest.fn(async (cb: (m: any) => any) => cb({ getRepository: jest.fn() })),
      },
    };

    locationRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'location-1',
          code: 'A-01-B1',
          name: 'A Blok Raf 1',
          warehouse: {
            id: 'warehouse-1',
            name: 'Ana Depo',
          },
        },
      ]),
    };

    const emptyRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(defaultQb()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: getRepositoryToken(InventoryMovement), useValue: movementRepo },
        { provide: getRepositoryToken(StoreVariantStock), useValue: emptyRepo },
        { provide: getRepositoryToken(StockBalance), useValue: emptyRepo },
        { provide: getRepositoryToken(Store), useValue: emptyRepo },
        { provide: getRepositoryToken(ProductVariant), useValue: emptyRepo },
        { provide: getRepositoryToken(StoreProductPrice), useValue: emptyRepo },
        { provide: getRepositoryToken(Supplier), useValue: emptyRepo },
        { provide: getRepositoryToken(SerialNumber), useValue: emptyRepo },
        { provide: getRepositoryToken(Location), useValue: locationRepo },
        { provide: AppContextService, useValue: appContext },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get(InventoryService);
  });

  it('movement history responseunda location, warehouse ve reason alanlarini enrich eder', async () => {
    const result = await service.getMovementHistory({
      offset: 0,
      limit: 50,
    } as any);

    expect(locationRepo.find).toHaveBeenCalledWith({
      where: {
        id: expect.anything(),
        tenant: { id: TENANT_ID },
      },
    });
    expect(result).toEqual({
      data: [
        expect.objectContaining({
          id: 'movement-1',
          productId: 'product-1',
          productName: 'Tisort',
          locationId: 'location-1',
          locationName: 'A Blok Raf 1',
          warehouseId: 'warehouse-1',
          warehouseName: 'Ana Depo',
          reason: 'Sayim fazlasi',
        }),
        expect.objectContaining({
          id: 'movement-2',
          productId: 'product-1',
          productName: 'Tisort',
          locationName: null,
          warehouseId: null,
          warehouseName: null,
          reason: null,
        }),
      ],
      meta: {
        total: 2,
        limit: 50,
        offset: 0,
        hasMore: false,
      },
    });
  });

  it('movement history querysinde warehouseId, type ve search filtrelerini uygular', async () => {
    await service.getMovementHistory({
      warehouseId: 'warehouse-1',
      type: MovementType.IN,
      search: 'Ana Depo',
      offset: 0,
      limit: 50,
    } as any);

    const qbMock = movementRepo.createQueryBuilder.mock.results[0].value;

    expect(qbMock.andWhere).toHaveBeenCalledWith(
      'locationFilter.warehouseId = :warehouseId',
      { warehouseId: 'warehouse-1' },
    );
    expect(qbMock.andWhere).toHaveBeenCalledWith('m.type = :type', {
      type: MovementType.IN,
    });
    expect(
      qbMock.andWhere.mock.calls.some(([clause]) => typeof clause === 'object'),
    ).toBe(true);
  });
});
