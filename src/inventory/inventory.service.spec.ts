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
