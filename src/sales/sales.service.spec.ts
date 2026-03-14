import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppContextService } from 'src/common/context/app-context.service';
import { InventoryService } from 'src/inventory/inventory.service';
import { PriceService } from 'src/pricing/price.service';
import { ExchangeRateService } from 'src/exchange-rate/exchange-rate.service';
import { ProductPackageService } from 'src/product-package/product-package.service';
import { SalesService } from './sales.service';
import { Sale } from './sale.entity';
import { SaleLine } from './sale-line.entity';
import { PaymentMethod, SalePayment, SalePaymentStatus } from './sale-payment.entity';
import { SaleReturn } from './sale-return.entity';
import { SaleReturnLine } from './sale-return-line.entity';
import { Store } from 'src/store/store.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { SaleReceiptService } from './sale-receipt.service';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'generated-uuid'),
}));

const TENANT_ID = 'tenant-uuid-1111';
const STORE_ID = '1292efb0-ca75-4951-9641-8a75f47cf015';
const SALE_ID = 'sale-uuid-2222';
const RETURN_ID = 'return-uuid-3333';
const PACKAGE_VARIANT_ID = 'variant-uuid-5555';

describe('SalesService', () => {
  let service: SalesService;
  let appContext: jest.Mocked<AppContextService>;
  let saleReturnRepo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
  };
  let salePaymentRepo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
  };
  let storeRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let variantRepo: {
    find: jest.Mock;
  };

  beforeEach(async () => {
    appContext = {
      getTenantIdOrThrow: jest.fn().mockReturnValue(TENANT_ID),
      getStoreId: jest.fn().mockReturnValue(undefined),
      getUserIdOrThrow: jest.fn(),
      getUserIdOrNull: jest.fn(),
    } as any;

    saleReturnRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
    };
    salePaymentRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
    };
    storeRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    variantRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: getRepositoryToken(Sale), useValue: {} },
        { provide: getRepositoryToken(SaleLine), useValue: {} },
        { provide: getRepositoryToken(Store), useValue: storeRepo },
        { provide: getRepositoryToken(ProductVariant), useValue: variantRepo },
        { provide: getRepositoryToken(SalePayment), useValue: salePaymentRepo },
        { provide: getRepositoryToken(SaleReturn), useValue: saleReturnRepo },
        { provide: getRepositoryToken(SaleReturnLine), useValue: {} },
        { provide: AppContextService, useValue: appContext },
        { provide: InventoryService, useValue: {} },
        { provide: PriceService, useValue: {} },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        { provide: ExchangeRateService, useValue: {} },
        { provide: ProductPackageService, useValue: {} },
        { provide: SaleReceiptService, useValue: {} },
      ],
    }).compile();

    service = module.get(SalesService);
  });

  describe('central sale return endpoints', () => {
    it('listAllSaleReturns responseunda merkezi liste alanlarini doner', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: RETURN_ID,
            returnNo: 'RET-SALE-1234',
            createdAt: new Date('2026-03-14T09:00:00.000Z'),
            notes: 'Musteri degisim istedi',
            totalRefundAmount: 150,
            lineCount: 2,
            store: { id: STORE_ID, name: 'Merkez Magaza' },
            sale: {
              id: SALE_ID,
              receiptNo: 'SF-20260314-0001',
              customer: {
                id: 'customer-1',
                name: 'Ada',
                surname: 'Yilmaz',
              },
            },
          },
        ]),
      };
      saleReturnRepo.createQueryBuilder.mockReturnValue(qb);
      storeRepo.find.mockResolvedValue([{ id: STORE_ID }]);

      const result = await service.listAllSaleReturns({
        page: 1,
        limit: 10,
        storeId: STORE_ID,
        hasPagination: true,
        skip: 0,
      } as any);

      expect(result).toEqual({
        data: [
          {
            id: RETURN_ID,
            returnNo: 'RET-SALE-1234',
            saleId: SALE_ID,
            saleReference: 'SF-20260314-0001',
            returnedAt: new Date('2026-03-14T09:00:00.000Z'),
            notes: 'Musteri degisim istedi',
            lineCount: 2,
            totalRefundAmount: '150',
            store: {
              id: STORE_ID,
              name: 'Merkez Magaza',
            },
            customer: {
              id: 'customer-1',
              name: 'Ada',
              surname: 'Yilmaz',
            },
          },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      });
    });

    it('getSaleReturn responseunda merkezi detay alanlarini doner', async () => {
      saleReturnRepo.findOne.mockResolvedValue({
        id: RETURN_ID,
        returnNo: 'RET-SALE-1234',
        createdAt: new Date('2026-03-14T09:00:00.000Z'),
        notes: 'Kismi iade',
        totalRefundAmount: 180,
        store: { id: STORE_ID, name: 'Merkez Magaza' },
        sale: {
          id: SALE_ID,
          receiptNo: 'SF-20260314-0001',
          customer: {
            id: 'customer-1',
            name: 'Ada',
            surname: 'Yilmaz',
            phoneNumber: '5550000000',
            email: 'ada@example.com',
          },
        },
        lines: [
          {
            id: 'return-line-1',
            quantity: 2,
            refundAmount: 150,
            packageVariantReturns: null,
            saleLine: {
              id: 'sale-line-1',
              currency: 'TRY',
              productVariant: {
                id: 'variant-1',
                name: 'Kirmizi / M',
                product: {
                  id: 'product-1',
                  name: 'Tisort',
                },
              },
              productPackage: null,
            },
          },
          {
            id: 'return-line-2',
            quantity: 0,
            refundAmount: 30,
            packageVariantReturns: [
              {
                productVariantId: PACKAGE_VARIANT_ID,
                quantity: 1,
              },
            ],
            saleLine: {
              id: 'sale-line-2',
              currency: 'TRY',
              productVariant: null,
              productPackage: {
                id: 'package-1',
                name: '3lu Paket',
              },
            },
          },
        ],
      });
      variantRepo.find.mockResolvedValue([
        {
          id: PACKAGE_VARIANT_ID,
          name: 'Mavi / L',
          product: { name: 'Tisort' },
        },
      ]);

      const result = await service.getSaleReturn(RETURN_ID);

      expect(result).toEqual({
        id: RETURN_ID,
        returnNo: 'RET-SALE-1234',
        saleId: SALE_ID,
        saleReference: 'SF-20260314-0001',
        returnedAt: new Date('2026-03-14T09:00:00.000Z'),
        notes: 'Kismi iade',
        totalRefundAmount: '180',
        store: {
          id: STORE_ID,
          name: 'Merkez Magaza',
        },
        customer: {
          id: 'customer-1',
          name: 'Ada',
          surname: 'Yilmaz',
          phoneNumber: '5550000000',
          email: 'ada@example.com',
        },
        lines: [
          {
            id: 'return-line-1',
            saleLineId: 'sale-line-1',
            quantity: '2',
            refundAmount: '150',
            packageVariantReturns: null,
            saleLine: {
              id: 'sale-line-1',
              productType: 'VARIANT',
              productId: 'product-1',
              productName: 'Tisort',
              productVariantId: 'variant-1',
              variantName: 'Kirmizi / M',
              productPackageId: null,
              packageName: null,
              currency: 'TRY',
            },
          },
          {
            id: 'return-line-2',
            saleLineId: 'sale-line-2',
            quantity: '0',
            refundAmount: '30',
            packageVariantReturns: [
              {
                productVariantId: PACKAGE_VARIANT_ID,
                productName: 'Tisort',
                variantName: 'Mavi / L',
                quantity: 1,
              },
            ],
            saleLine: {
              id: 'sale-line-2',
              productType: 'PACKAGE',
              productId: null,
              productName: null,
              productVariantId: null,
              variantName: null,
              productPackageId: 'package-1',
              packageName: '3lu Paket',
              currency: 'TRY',
            },
          },
        ],
      });
    });

    it('getSaleReturn aktif store scope ile kaydi sinirlar', async () => {
      appContext.getStoreId.mockReturnValue(STORE_ID);
      saleReturnRepo.findOne.mockResolvedValue(null);

      await expect(service.getSaleReturn(RETURN_ID)).rejects.toThrow(NotFoundException);
      expect(saleReturnRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: RETURN_ID,
            tenant: { id: TENANT_ID },
            store: { id: STORE_ID },
          }),
        }),
      );
    });
  });

  describe('central sale payment endpoints', () => {
    it('listAllSalePayments responseunda merkezi liste alanlarini doner ve varsayilan ACTIVE filtresini kullanir', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'payment-uuid-1',
            amount: 150,
            paymentMethod: PaymentMethod.CARD,
            note: 'POS tahsilati',
            paidAt: new Date('2026-03-14T10:00:00.000Z'),
            status: SalePaymentStatus.ACTIVE,
            currency: 'TRY',
            sale: {
              id: SALE_ID,
              receiptNo: 'SF-20260314-0001',
              customer: {
                name: 'Ada',
                surname: 'Yilmaz',
              },
              store: {
                id: STORE_ID,
                name: 'Merkez Magaza',
              },
            },
          },
        ]),
      };
      salePaymentRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listAllSalePayments({
        page: 1,
        limit: 10,
        hasPagination: true,
        skip: 0,
      } as any);

      expect(qb.andWhere).toHaveBeenCalledWith('salePayment.status = :status', {
        status: SalePaymentStatus.ACTIVE,
      });
      expect(result).toEqual({
        data: [
          {
            id: 'payment-uuid-1',
            paymentReference: 'PAY-PAYMENTU',
            saleId: SALE_ID,
            saleReference: 'SF-20260314-0001',
            customerName: 'Ada Yilmaz',
            store: {
              id: STORE_ID,
              name: 'Merkez Magaza',
            },
            paymentMethod: PaymentMethod.CARD,
            amount: '150',
            currency: 'TRY',
            paidAt: new Date('2026-03-14T10:00:00.000Z'),
            status: SalePaymentStatus.ACTIVE,
            note: 'POS tahsilati',
          },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      });
    });

    it('getSalePayment responseunda merkezi detay alanlarini doner', async () => {
      salePaymentRepo.findOne.mockResolvedValue({
        id: 'payment-uuid-1',
        amount: 150,
        paymentMethod: PaymentMethod.CARD,
        note: 'POS tahsilati',
        paidAt: new Date('2026-03-14T10:00:00.000Z'),
        status: SalePaymentStatus.UPDATED,
        currency: 'USD',
        exchangeRate: 38.5,
        amountInBaseCurrency: 5775,
        cancelledAt: new Date('2026-03-14T11:00:00.000Z'),
        cancelledById: 'user-1',
        sale: {
          id: SALE_ID,
          receiptNo: null,
          customer: {
            name: 'Ada',
            surname: 'Yilmaz',
          },
          store: {
            id: STORE_ID,
            name: 'Merkez Magaza',
          },
        },
      });

      const result = await service.getSalePayment('payment-uuid-1');

      expect(result).toEqual({
        id: 'payment-uuid-1',
        paymentReference: 'PAY-PAYMENTU',
        saleId: SALE_ID,
        saleReference: 'SALE-SALE-UUI',
        customerName: 'Ada Yilmaz',
        store: {
          id: STORE_ID,
          name: 'Merkez Magaza',
        },
        paymentMethod: PaymentMethod.CARD,
        amount: '150',
        currency: 'USD',
        paidAt: new Date('2026-03-14T10:00:00.000Z'),
        status: SalePaymentStatus.UPDATED,
        note: 'POS tahsilati',
        exchangeRate: '38.5',
        amountInBaseCurrency: '5775',
        cancelledAt: new Date('2026-03-14T11:00:00.000Z'),
        cancelledById: 'user-1',
      });
    });

    it('getSalePayment aktif store scope ile kaydi sinirlar', async () => {
      appContext.getStoreId.mockReturnValue(STORE_ID);
      salePaymentRepo.findOne.mockResolvedValue(null);

      await expect(service.getSalePayment('payment-uuid-1')).rejects.toThrow(NotFoundException);
      expect(salePaymentRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'payment-uuid-1',
            sale: expect.objectContaining({
              tenant: { id: TENANT_ID },
              store: { id: STORE_ID },
            }),
          }),
        }),
      );
    });
  });
});
