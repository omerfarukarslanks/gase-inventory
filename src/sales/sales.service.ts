import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { Sale, PaymentStatus, SaleStatus } from './sale.entity';
import { SaleLine } from './sale-line.entity';
import { SalePayment, SalePaymentStatus } from './sale-payment.entity';
import { AddPaymentDto } from './dto/add-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { ExchangeRateService } from 'src/exchange-rate/exchange-rate.service';
import { SupportedCurrency } from 'src/common/constants/currency.constants';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { AppContextService } from '../common/context/app-context.service';
import { InventoryService } from '../inventory/inventory.service';
import { SellStockDto } from '../inventory/dto/sell-stock.dto';
import { Customer } from 'src/customer/customer.entity';
import { Store } from 'src/store/store.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { CustomerErrors } from 'src/common/errors/customer.errors';
import { StoreErrors } from 'src/common/errors/store.errors';
import { ProductErrors } from 'src/common/errors/product.errors';
import { SalesErrors } from 'src/common/errors/sale.errors';
import { calculateLineAmounts } from 'src/pricing/utils/price-calculator';
import { PriceService, EffectivePriceParams } from 'src/pricing/price.service';
import {
  ListSalesForStoreQueryDto,
  PaginatedSalesResponse,
} from './dto/list-sales.dto';
import { CancelSaleDto } from './dto/cancel-sale.dto';
import { ProductPackageService } from 'src/product-package/product-package.service';
import { ProductPackage } from 'src/product-package/product-package.entity';
import { SaleReturn } from './sale-return.entity';
import { SaleReturnLine } from './sale-return-line.entity';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { SaleReceiptService, ReceiptData } from './sale-receipt.service';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(SaleLine)
    private readonly saleLineRepo: Repository<SaleLine>,
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(SalePayment)
    private readonly salePaymentRepo: Repository<SalePayment>,
    @InjectRepository(SaleReturn)
    private readonly saleReturnRepo: Repository<SaleReturn>,
    @InjectRepository(SaleReturnLine)
    private readonly saleReturnLineRepo: Repository<SaleReturnLine>,
    private readonly appContext: AppContextService,
    private readonly inventoryService: InventoryService,
    private readonly priceService: PriceService,
    private readonly dataSource: DataSource,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly packageService: ProductPackageService,
    private readonly saleReceiptService: SaleReceiptService,
  ) { }

  private getSaleRepo(manager?: EntityManager): Repository<Sale> {
    return manager ? manager.getRepository(Sale) : this.saleRepo;
  }

  private getSaleLineRepo(manager?: EntityManager): Repository<SaleLine> {
    return manager ? manager.getRepository(SaleLine) : this.saleLineRepo;
  }

  private getStoreRepo(manager?: EntityManager): Repository<Store> {
    return manager ? manager.getRepository(Store) : this.storeRepo;
  }

  private getVariantRepo(manager?: EntityManager): Repository<ProductVariant> {
    return manager ? manager.getRepository(ProductVariant) : this.variantRepo;
  }

  private getSalePaymentRepo(manager?: EntityManager): Repository<SalePayment> {
    return manager ? manager.getRepository(SalePayment) : this.salePaymentRepo;
  }

  private computePaymentStatus(paidAmount: number, lineTotal: number): PaymentStatus {
    const paid = Number(paidAmount || 0);
    const total = Number(lineTotal || 0);
    if (paid <= 0) return PaymentStatus.UNPAID;
    if (paid >= total) return PaymentStatus.PAID;
    return PaymentStatus.PARTIAL;
  }

  /**
   * Bir SaleLine için stok iade hareketi oluşturur.
   * Paket satır ise her paket item için ayrı IN hareketi yaratır.
   */
  private async returnLineStock(
    line: SaleLine,
    saleId: string,
    storeId: string,
    manager: EntityManager,
  ): Promise<void> {
    if (line.productPackage) {
      const pkg = line.productPackage as ProductPackage;
      for (const item of pkg.items ?? []) {
        const totalQty = Number(line.quantity) * Number(item.quantity);
        await this.inventoryService.createReturnMovementForSaleLine(
          {
            saleId,
            saleLineId: line.id,
            storeId,
            productVariantId: item.productVariant.id,
            quantity: totalQty,
            currency: line.currency,
            unitPrice: undefined,
            lineTotal: undefined,
          },
          manager,
        );
      }
    } else if (line.productVariant) {
      await this.inventoryService.createReturnMovementForSaleLine(
        {
          saleId,
          saleLineId: line.id,
          storeId,
          productVariantId: line.productVariant.id,
          quantity: Number(line.quantity),
          currency: line.currency,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent,
          discountAmount: line.discountAmount,
          taxPercent: line.taxPercent,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
          campaignCode: line.campaignCode,
        },
        manager,
      );
    }
  }

  /**
   * Tekil variant satırı için: efektif fiyat uygula → miktarları hesapla →
   * SaleLine kaydet → stok düş. createSaleInternal ve updateSaleInternal
   * her ikisinde de aynı mantık çalışır; bu metot tekrarı ortadan kaldırır.
   */
  private async processVariantLine(
    lineInput: {
      productVariantId: string;
      quantity: number;
      currency?: string | null;
      unitPrice?: number | null;
      discountPercent?: number | null;
      discountAmount?: number | null;
      taxPercent?: number | null;
      taxAmount?: number | null;
      lineTotal?: number | null;
      campaignCode?: string | null;
    },
    priceParams: EffectivePriceParams | undefined,
    variant: ProductVariant,
    saleId: string,
    receiptNo: string | null | undefined,
    storeId: string,
    userId: string,
    editMode: boolean,
    manager: EntityManager,
  ): Promise<{ net: number; lineTotal: number; currency: string }> {
    const saleLineRepo = manager.getRepository(SaleLine);

    // Efektif fiyat parametrelerini uygula (sadece unitPrice gönderilmemişse)
    const w = { ...lineInput } as Required<typeof lineInput>;
    if (w.unitPrice == null) {
      w.unitPrice = priceParams?.unitPrice ?? 0;
      if (w.taxPercent == null && priceParams?.taxPercent != null) w.taxPercent = priceParams.taxPercent;
      if (w.discountPercent == null && priceParams?.discountPercent != null) w.discountPercent = priceParams.discountPercent;
      if (w.discountPercent == null && w.discountAmount == null && priceParams?.discountAmount != null) w.discountAmount = priceParams.discountAmount;
      if (w.taxPercent == null && w.taxAmount == null && priceParams?.taxAmount != null) w.taxAmount = priceParams.taxAmount;
      if (w.lineTotal == null && priceParams?.lineTotal != null) w.lineTotal = priceParams.lineTotal;
    }
    w.currency = w.currency ?? priceParams?.currency ?? 'TRY';

    const { net, discountPercent, taxPercent, lineTotal } = calculateLineAmounts({
      quantity: w.quantity,
      unitPrice: w.unitPrice ?? 0,
      discountPercent: w.discountPercent ?? null,
      discountAmount: w.discountPercent != null ? null : (w.discountAmount ?? null),
      taxPercent: w.taxPercent ?? null,
      taxAmount: w.taxPercent != null ? null : (w.taxAmount ?? null),
    });

    const persistedDiscountPercent = w.discountPercent != null ? (discountPercent ?? null) : null;
    const persistedDiscountAmount = w.discountPercent != null ? null : (w.discountAmount ?? null);
    const persistedTaxPercent = w.taxPercent != null ? (taxPercent ?? null) : null;
    const persistedTaxAmount = w.taxPercent != null ? null : (w.taxAmount ?? null);

    const line = saleLineRepo.create();
    line.sale = { id: saleId } as any;
    line.productVariant = { id: variant.id } as any;
    line.productPackage = null;
    line.quantity = w.quantity;
    line.currency = w.currency;
    line.unitPrice = w.unitPrice ?? undefined;
    line.discountPercent = persistedDiscountPercent ?? undefined;
    line.discountAmount = persistedDiscountAmount ?? undefined;
    line.taxPercent = persistedTaxPercent ?? undefined;
    line.taxAmount = persistedTaxAmount ?? undefined;
    line.lineTotal = lineTotal;
    line.campaignCode = w.campaignCode ?? undefined;
    line.createdById = userId;
    line.updatedById = userId;

    const savedLine = await saleLineRepo.save(line);

    await this.inventoryService.sellFromStore(
      {
        storeId,
        productVariantId: variant.id,
        quantity: w.quantity,
        reference: receiptNo ?? `SALE-${saleId}`,
        meta: { saleId, saleLineId: savedLine.id, ...(editMode ? { edited: true } : {}) },
        currency: w.currency,
        unitPrice: w.unitPrice ?? undefined,
        discountPercent: persistedDiscountPercent ?? undefined,
        discountAmount: persistedDiscountAmount ?? undefined,
        taxPercent: persistedTaxPercent ?? undefined,
        taxAmount: persistedTaxAmount ?? undefined,
        lineTotal,
        campaignCode: w.campaignCode ?? undefined,
        saleId,
        saleLineId: savedLine.id,
      },
      manager,
    );

    return { net, lineTotal, currency: w.currency };
  }

  /**
   * Paket satır için SaleLine oluşturur ve her paket item'ı için stok düşer.
   * Dönen değer: { net, lineTotal, currency }
   */
  private async createPackageLineAndDeductStock(
    lineDto: { productPackageId: string; quantity: number; unitPrice?: number; currency?: string; discountPercent?: number; discountAmount?: number; taxPercent?: number; taxAmount?: number; lineTotal?: number; campaignCode?: string },
    savedSale: Sale,
    store: Store,
    tenantId: string,
    userId: string,
    manager: EntityManager,
  ): Promise<{ net: number; lineTotal: number; currency: string }> {
    const pkg = await this.packageService.findForSaleOrThrow(lineDto.productPackageId, tenantId);

    const unitPrice = lineDto.unitPrice ?? Number(pkg.defaultSalePrice ?? 0);
    const currency = lineDto.currency ?? pkg.defaultCurrency ?? 'TRY';
    const discountPercent = lineDto.discountPercent ?? (pkg.defaultDiscountPercent != null ? Number(pkg.defaultDiscountPercent) : null);
    const discountAmount = discountPercent != null ? null : (lineDto.discountAmount ?? null);
    const taxPercent = lineDto.taxPercent ?? (pkg.defaultTaxPercent != null ? Number(pkg.defaultTaxPercent) : null);
    const taxAmount = taxPercent != null ? null : (lineDto.taxAmount ?? null);

    const { net, lineTotal } = calculateLineAmounts({
      quantity: lineDto.quantity,
      unitPrice,
      discountPercent,
      discountAmount,
      taxPercent,
      taxAmount,
    });

    const saleLineRepo = manager.getRepository(SaleLine);
    const line = saleLineRepo.create();
    line.sale = { id: savedSale.id } as any;
    line.productPackage = { id: pkg.id } as any;
    line.productVariant = null;
    line.quantity = lineDto.quantity;
    line.currency = currency;
    line.unitPrice = unitPrice;
    line.discountPercent = discountPercent ?? undefined;
    line.discountAmount = discountAmount ?? undefined;
    line.taxPercent = taxPercent ?? undefined;
    line.taxAmount = taxAmount ?? undefined;
    line.lineTotal = lineTotal;
    line.campaignCode = lineDto.campaignCode;
    line.createdById = userId;
    line.updatedById = userId;

    const savedLine = await saleLineRepo.save(line);

    // Her paket item için stok düş
    for (const item of pkg.items) {
      const itemQty = Number(lineDto.quantity) * Number(item.quantity);
      await this.inventoryService.sellFromStore(
        {
          storeId: store.id,
          productVariantId: item.productVariant.id,
          quantity: itemQty,
          reference: savedSale.receiptNo ?? `SALE-${savedSale.id}`,
          meta: {
            saleId: savedSale.id,
            saleLineId: savedLine.id,
            packageId: pkg.id,
            packageItemId: item.id,
          },
          saleId: savedSale.id,
          saleLineId: savedLine.id,
        },
        manager,
      );
    }

    return { net, lineTotal, currency };
  }

  private async getTenantCustomerOrThrow(
    customerId: string,
    manager: EntityManager,
  ): Promise<Customer> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const repo = manager.getRepository(Customer);
    const customer = await repo.findOne({
      where: { id: customerId, tenant: { id: tenantId } },
      select: {
        id: true,
        name: true,
        surname: true,
        phoneNumber: true,
        email: true,
      },
    });

    if (!customer) {
      throw new NotFoundException(CustomerErrors.CUSTOMER_NOT_FOUND);
    }

    return customer;
  }

  private async getTenantStoreOrThrow(storeId: string, manager?: EntityManager): Promise<Store> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const repo = this.getStoreRepo(manager);

    const store = await repo.findOne({
      where: { id: storeId, tenant: { id: tenantId } },
      relations: ['tenant'],
    });

    if (!store) {
      throw new NotFoundException(StoreErrors.STORE_NOT_IN_TENANT);
    }

    return store;
  }

  private async getTenantVariantOrThrow(
    variantId: string,
    manager?: EntityManager
  ): Promise<ProductVariant> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const variant = await this.getVariantRepo(manager).findOne({
      where: {
        id: variantId,
        product: { tenant: { id: tenantId } },
      },
      relations: ['product', 'product.tenant'],
    });

    if (!variant) {
      throw new NotFoundException(ProductErrors.VARIANT_NOT_FOUND);
    }

    return variant;
  }

  private buildSaleReceiptNo(saleId: string, createdAt?: Date): string {
    const date = createdAt ?? new Date();
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const shortId = saleId.replace(/-/g, '').slice(0, 8).toUpperCase();

    return `SF-${yyyy}${mm}${dd}-${shortId}`;
  }

  // ---- Satış oluştur + stok düş ----

  async createSale(dto: CreateSaleDto, manager?: EntityManager): Promise<Sale> {
    // Eğer dışarıdan manager geldiyse mevcut transaction'a katıl,
    // gelmediyse kendi transaction'ını yarat.
    if (manager) {
      return this.createSaleInternal(dto, manager);
    }

    return this.dataSource.transaction((txManager) =>
      this.createSaleInternal(dto, txManager),
    );
  }

  // 🔒 Asıl iş burada, her zaman bir EntityManager ile çalışıyor
  private async createSaleInternal(
    dto: CreateSaleDto,
    manager: EntityManager,
  ): Promise<Sale> {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException(SalesErrors.SALE_MUST_HAVE_LINES);
    }

    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();

    const saleRepo = manager.getRepository(Sale);

    const store = await this.getTenantStoreOrThrow(
      dto.storeId ?? this.appContext.getStoreIdOrThrow(),
      manager,
    );

    const variantIds = [...new Set(
      dto.lines
        .filter((l) => l.productVariantId)
        .map((l) => l.productVariantId!),
    )];

    const variants = variantIds.length > 0
      ? await manager.getRepository(ProductVariant).find({
          where: {
            id: In(variantIds),
            product: { tenant: { id: tenantId } },
          },
          relations: ['product', 'product.tenant'],
        })
      : [];

    if (variants.length !== variantIds.length) {
      throw new NotFoundException(ProductErrors.VARIANT_NOT_FOUND);
    }

    // Paket olmayan satırlar için en az bir productVariantId veya productPackageId olmalı
    for (const l of dto.lines) {
      if (!l.productVariantId && !l.productPackageId) {
        throw new BadRequestException('Her satır için productVariantId veya productPackageId gönderilmelidir.');
      }
      if (l.productVariantId && l.productPackageId) {
        throw new BadRequestException('Bir satırda hem productVariantId hem productPackageId olamaz.');
      }
    }

    const variantMap = new Map<string, ProductVariant>(
      variants.map((variant) => [variant.id, variant]),
    );

    const effectivePrices = variantIds.length > 0
      ? await this.priceService.getEffectiveSaleParamsForStoreBulk(
          store.id,
          variantIds,
          manager,
        )
      : new Map();

    let customerRelation: { id: string } | null = null;
    if (dto.customerId) {
      const customer = await this.getTenantCustomerOrThrow(dto.customerId, manager);
      customerRelation = { id: customer.id };
    }

    // 1) Sale kaydı — id önceden üretilir, receiptNo tek seferde yazılır
    const saleId = uuidv4();
    const sale = saleRepo.create({
      id: saleId,
      tenant: { id: tenantId } as any,
      store: { id: store.id } as any,
      ...(customerRelation ? { customer: customerRelation as any } : {}),
      status: SaleStatus.CONFIRMED,
      receiptNo: this.buildSaleReceiptNo(saleId, new Date()),
      meta: dto.meta,
      createdById: userId,
      updatedById: userId,
    });

    const savedSale = await saleRepo.save(sale);

    let totalUnitPrice = 0;
    let totalLineTotal = 0;
    const saleCurrencies = new Set<string>();

    // 2) Satırları oluştur + stok düş
    for (const lineDto of dto.lines) {
      if (lineDto.productPackageId) {
        // --- Paket satır ---
        const { net, lineTotal, currency } = await this.createPackageLineAndDeductStock(
          lineDto as any,
          savedSale,
          store,
          tenantId,
          userId,
          manager,
        );
        totalUnitPrice += net;
        totalLineTotal += lineTotal;
        saleCurrencies.add(currency);
      } else {
        // --- Tekil variant satır ---
        const variantId = lineDto.productVariantId!;
        const variant = variantMap.get(variantId)!;
        const { net, lineTotal, currency } = await this.processVariantLine(
          { ...lineDto, productVariantId: variantId },
          effectivePrices.get(variantId),
          variant,
          savedSale.id,
          savedSale.receiptNo,
          store.id,
          userId,
          false,
          manager,
        );
        saleCurrencies.add(currency);
        totalUnitPrice += net;
        totalLineTotal += lineTotal;
      }
    }

    // 4) Satış toplamlarını güncelle
    savedSale.unitPrice = totalUnitPrice;
    savedSale.lineTotal = totalLineTotal;
    savedSale.currency = saleCurrencies.size === 1
      ? Array.from(saleCurrencies)[0]
      : null;

    // 5) Başlangıç ödemesi varsa kaydet
    if (dto.initialPayment) {
      const storeCurrency = store.currency ?? SupportedCurrency.TRY;
      const paymentCurrency = dto.initialPayment.currency ?? storeCurrency;
      const exchangeRate = await this.resolveExchangeRate(paymentCurrency, storeCurrency);
      const amountInBaseCurrency = Number(dto.initialPayment.amount) * exchangeRate;

      const payment = manager.getRepository(SalePayment).create({
        sale: { id: savedSale.id } as any,
        amount: dto.initialPayment.amount,
        paymentMethod: dto.initialPayment.paymentMethod,
        note: dto.initialPayment.note,
        paidAt: dto.initialPayment.paidAt ? new Date(dto.initialPayment.paidAt) : new Date(),
        status: SalePaymentStatus.ACTIVE,
        currency: paymentCurrency,
        exchangeRate,
        amountInBaseCurrency,
        createdById: userId,
        updatedById: userId,
      });
      await manager.getRepository(SalePayment).save(payment);
      savedSale.paidAmount = amountInBaseCurrency;
    }

    savedSale.paymentStatus = this.computePaymentStatus(savedSale.paidAmount ?? 0, totalLineTotal);
    savedSale.updatedById = userId;

    return saleRepo.save(savedSale);
  }

  async updateSale(
    id: string,
    dto: UpdateSaleDto,
    manager?: EntityManager,
  ): Promise<any> {
    if (manager) {
      return this.updateSaleInternal(id, dto, manager);
    }

    return this.dataSource.transaction((txManager) =>
      this.updateSaleInternal(id, dto, txManager),
    );
  }

  private async updateSaleInternal(
    id: string,
    dto: UpdateSaleDto,
    manager: EntityManager,
  ): Promise<any> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();

    const saleRepo = manager.getRepository(Sale);
    const saleLineRepo = manager.getRepository(SaleLine);

    const sale = await saleRepo.findOne({
      where: { id, tenant: { id: tenantId } },
      relations: [
        'store',
        'lines',
        'lines.productVariant',
        'lines.productPackage',
        'lines.productPackage.items',
        'lines.productPackage.items.productVariant',
      ],
    });

    if (!sale) {
      throw new NotFoundException(SalesErrors.SALE_NOT_FOUND);
    }

    if (sale.status === SaleStatus.CANCELLED) {
      throw new BadRequestException(SalesErrors.SALE_ALREADY_CANCELLED);
    }

    if (dto.customerId === null) {
      sale.customer = null;
    } else if (dto.customerId !== undefined) {
      const customer = await this.getTenantCustomerOrThrow(dto.customerId, manager);
      sale.customer = { id: customer.id } as any;
    }
    if (dto.meta !== undefined) {
      sale.meta = dto.meta;
    }

    if (dto.lines !== undefined) {
      if (dto.lines.length === 0) {
        throw new BadRequestException(SalesErrors.SALE_MUST_HAVE_LINES);
      }

      // 1) Eski satirlari stok olarak iade et (IN) — paket satırlar da dahil
      for (const oldLine of sale.lines ?? []) {
        await this.returnLineStock(oldLine, sale.id, sale.store.id, manager);
      }

      // 2) Eski satirlari sil ve yeni satirlari yeniden yaz
      await saleLineRepo
        .createQueryBuilder()
        .delete()
        .from(SaleLine)
        .where('saleId = :saleId', { saleId: sale.id })
        .execute();

      // Satır validasyonu
      for (const l of dto.lines) {
        if (!l.productVariantId && !l.productPackageId) {
          throw new BadRequestException('Her satır için productVariantId veya productPackageId gönderilmelidir.');
        }
        if (l.productVariantId && l.productPackageId) {
          throw new BadRequestException('Bir satırda hem productVariantId hem productPackageId olamaz.');
        }
      }

      const variantIds = [...new Set(
        dto.lines
          .filter((l) => l.productVariantId)
          .map((l) => l.productVariantId!),
      )];

      const variants = variantIds.length > 0
        ? await manager.getRepository(ProductVariant).find({
            where: {
              id: In(variantIds),
              product: { tenant: { id: tenantId } },
            },
            relations: ['product', 'product.tenant'],
          })
        : [];

      if (variants.length !== variantIds.length) {
        throw new NotFoundException(ProductErrors.VARIANT_NOT_FOUND);
      }

      const variantMap = new Map<string, ProductVariant>(
        variants.map((variant) => [variant.id, variant]),
      );

      const effectivePrices = variantIds.length > 0
        ? await this.priceService.getEffectiveSaleParamsForStoreBulk(
            sale.store.id,
            variantIds,
            manager,
          )
        : new Map();

      let totalUnitPrice = 0;
      let totalLineTotal = 0;
      const saleCurrencies = new Set<string>();

      // Yeni satış satırı ile referans satışı oluştur
      const referenceSale = { id: sale.id, receiptNo: sale.receiptNo } as Sale;

      for (const lineDto of dto.lines) {
        if (lineDto.productPackageId) {
          // --- Paket satır ---
          const { net, lineTotal, currency } = await this.createPackageLineAndDeductStock(
            lineDto as any,
            referenceSale,
            sale.store,
            tenantId,
            userId,
            manager,
          );
          totalUnitPrice += net;
          totalLineTotal += lineTotal;
          saleCurrencies.add(currency);
        } else {
          // --- Tekil variant satır ---
          const variantId = lineDto.productVariantId!;
          const variant = variantMap.get(variantId)!;
          const { net, lineTotal, currency } = await this.processVariantLine(
            { ...lineDto, productVariantId: variantId },
            effectivePrices.get(variantId),
            variant,
            sale.id,
            sale.receiptNo,
            sale.store.id,
            userId,
            true,
            manager,
          );
          saleCurrencies.add(currency);
          totalUnitPrice += net;
          totalLineTotal += lineTotal;
        }
      }

      sale.unitPrice = totalUnitPrice;
      sale.lineTotal = totalLineTotal;
      sale.currency =
        saleCurrencies.size === 1 ? Array.from(saleCurrencies)[0] : null;
      sale.paymentStatus = this.computePaymentStatus(sale.paidAmount ?? 0, totalLineTotal);
    }

    sale.updatedById = userId;
    await saleRepo.save(sale);

    return this.findOne(sale.id, manager);
  }



  /**
   * Satış iptali / iadesi:
   * - Sale.status = CANCELLED
   * - Her satır için IN hareketi (stok iadesi)
   */

  async cancelSale(
    id: string,
    dto?: CancelSaleDto,
    manager?: EntityManager,
  ): Promise<Sale> {
    if (manager) {
      return this.cancelSaleInternal(id, dto, manager);
    }

    return this.dataSource.transaction((txManager) =>
      this.cancelSaleInternal(id, dto, txManager),
    );
  }

  private async cancelSaleInternal(
    id: string,
    dto: CancelSaleDto | undefined,
    manager: EntityManager,
  ): Promise<Sale> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();

    const saleRepo = manager.getRepository(Sale);

    const sale = await saleRepo.findOne({
      where: { id, tenant: { id: tenantId } },
      relations: [
        'store',
        'lines',
        'lines.productVariant',
        'lines.productPackage',
        'lines.productPackage.items',
        'lines.productPackage.items.productVariant',
      ],
    });

    if (!sale) {
      throw new NotFoundException(SalesErrors.SALE_NOT_FOUND);
    }

    if (sale.status === SaleStatus.CANCELLED) {
      throw new BadRequestException(SalesErrors.SALE_ALREADY_CANCELLED);
    }

    if (sale.status !== SaleStatus.CONFIRMED) {
      throw new BadRequestException({
        ...SalesErrors.SALE_STATUS_NOT_CONFIRMABLE,
        details: { currentStatus: sale.status },
      });
    }

    // Her satır için iade (IN) — paket satırlar da dahil
    for (const line of sale.lines) {
      await this.returnLineStock(line, sale.id, sale.store.id, manager);
    }

    sale.status = SaleStatus.CANCELLED;
    sale.updatedById = userId;
    sale.cancelledById = userId;
    sale.cancelledAt = new Date();
    if (dto?.meta !== undefined) {
      sale.meta = {
        ...(sale.meta ?? {}),
        cancelMeta: dto.meta,
      };
    }

    return saleRepo.save(sale);
  }

  async findOne(id: string, manager?: EntityManager): Promise<any> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const sale = await this.getSaleRepo(manager).findOne({
      where: {
        id,
        tenant: { id: tenantId },
      },
      relations: [
        'store',
        'customer',
        'lines',
        'lines.productVariant',
        'lines.productVariant.product',
        'lines.productPackage',
        'lines.productPackage.items',
        'lines.productPackage.items.productVariant',
      ],
    });

    if (!sale) {
      throw new NotFoundException(SalesErrors.SALE_NOT_FOUND);
    }

    const recalculatedPaidAmount = await this.recalcPaidAmount(sale.id);
    sale.paidAmount = recalculatedPaidAmount;
    sale.paymentStatus = this.computePaymentStatus(
      recalculatedPaidAmount,
      Number(sale.lineTotal || 0),
    );

    return {
      id: sale.id,
      createdAt: sale.createdAt,
      createdById: sale.createdById,
      updatedAt: sale.updatedAt,
      updatedById: sale.updatedById,
      store: sale.store
        ? {
            id: sale.store.id,
            name: sale.store.name,
            address: sale.store.address ?? null,
            slug: sale.store.slug ?? null,
          }
        : null,
      status: sale.status,
      receiptNo: sale.receiptNo ?? null,
      currency: sale.currency ?? null,
      customerId: sale.customer?.id ?? sale.customerId ?? null,
      customer: sale.customer
        ? {
            id: sale.customer.id,
            name: sale.customer.name ?? null,
            surname: sale.customer.surname ?? null,
            phoneNumber: sale.customer.phoneNumber ?? null,
            email: sale.customer.email ?? null,
          }
        : null,
      meta: sale.meta ?? null,
      unitPrice: String(sale.unitPrice ?? 0),
      lineTotal: String(sale.lineTotal ?? 0),
      paidAmount: String(sale.paidAmount ?? 0),
      remainingAmount: String(sale.remainingAmount),
      paymentStatus: sale.paymentStatus,
      lines: (sale.lines ?? []).map((line) => ({
        id: line.id,
        // Tekil variant satırı
        productId: line.productVariant?.product?.id ?? null,
        productName: line.productVariant?.product?.name ?? null,
        productVariant: line.productVariant
          ? {
              id: line.productVariant.id,
              name: line.productVariant.name,
              code: line.productVariant.code,
            }
          : null,
        // Paket satırı
        productPackage: line.productPackage
          ? {
              id: line.productPackage.id,
              name: line.productPackage.name,
              code: line.productPackage.code ?? null,
              items: (line.productPackage.items ?? []).map((item) => ({
                variantId: item.productVariant.id,
                variantName: item.productVariant.name,
                qtyPerPackage: String(item.quantity),
              })),
            }
          : null,
        quantity: String(line.quantity ?? 0),
        currency: line.currency ?? null,
        unitPrice: line.unitPrice != null ? String(line.unitPrice) : null,
        discountPercent: line.discountPercent != null ? String(line.discountPercent) : null,
        discountAmount: line.discountAmount != null ? String(line.discountAmount) : null,
        taxPercent: line.taxPercent != null ? String(line.taxPercent) : null,
        taxAmount: line.taxAmount != null ? String(line.taxAmount) : null,
        lineTotal: line.lineTotal != null ? String(line.lineTotal) : null,
        campaignCode: line.campaignCode ?? null,
      })),
      cancelledAt: sale.cancelledAt ?? null,
      cancelledById: sale.cancelledById ?? null,
    };
  }

  async findAllForStore(
    query: ListSalesForStoreQueryDto,
    manager?: EntityManager,
  ): Promise<PaginatedSalesResponse> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const contextStoreId = this.appContext.getStoreId();

    let requestedStoreIds: string[] = [];
    if (contextStoreId) {
      await this.getTenantStoreOrThrow(contextStoreId, manager);
      requestedStoreIds = [contextStoreId];
    } else {
      requestedStoreIds = Array.from(
        new Set(
          (query.storeIds ?? [])
            .map((id) => id?.trim())
            .filter((id): id is string => Boolean(id)),
        ),
      );

      if (requestedStoreIds.length > 0) {
        const stores = await this.getStoreRepo(manager).find({
          where: {
            id: In(requestedStoreIds),
            tenant: { id: tenantId },
          },
          select: { id: true },
        });

        if (stores.length !== requestedStoreIds.length) {
          throw new NotFoundException(StoreErrors.STORE_NOT_IN_TENANT);
        }
      }
    }

    const qb = this.getSaleRepo(manager)
      .createQueryBuilder('sale')
      .leftJoin('sale.store', 'store')
      .leftJoin('sale.customer', 'customer')
      .select([
        'sale.id',
        'sale.receiptNo',
        'sale.currency',
        'sale.status',
        'sale.unitPrice',
        'sale.lineTotal',
        'sale.paidAmount',
        'sale.paymentStatus',
        'sale.meta',
        'sale.createdAt',
      ])
      .addSelect(['store.id', 'store.name', 'store.code'])
      .addSelect([
        'customer.id',
        'customer.name',
        'customer.surname',
        'customer.phoneNumber',
        'customer.email',
      ])
      .where('sale.tenantId = :tenantId', { tenantId })
      .loadRelationIdAndMap('sale.customerId', 'sale.customer')
      .orderBy('sale.createdAt', 'DESC');

    if (requestedStoreIds.length > 0) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: requestedStoreIds });
    }

    if (query.receiptNo?.trim()) {
      qb.andWhere('sale.receiptNo ILIKE :receiptNo', {
        receiptNo: `%${query.receiptNo.trim()}%`,
      });
    }

    if (query.customerId) {
      qb.andWhere('sale."customerId" = :customerId', { customerId: query.customerId });
    }

    if (query.name?.trim()) {
      qb.andWhere('customer.name ILIKE :name', { name: `%${query.name.trim()}%` });
    }

    if (query.surname?.trim()) {
      qb.andWhere('customer.surname ILIKE :surname', {
        surname: `%${query.surname.trim()}%`,
      });
    }

    if (query.status) {
      qb.andWhere('sale.status = :status', { status: query.status });
    }

    if (
      query.minUnitPrice !== undefined &&
      query.maxUnitPrice !== undefined &&
      query.minUnitPrice > query.maxUnitPrice
    ) {
      throw new BadRequestException('minUnitPrice, maxUnitPrice değerinden büyük olamaz');
    }

    if (
      query.minLineTotal !== undefined &&
      query.maxLineTotal !== undefined &&
      query.minLineTotal > query.maxLineTotal
    ) {
      throw new BadRequestException('minLineTotal, maxLineTotal değerinden büyük olamaz');
    }

    if (query.minUnitPrice !== undefined) {
      qb.andWhere('sale.unitPrice >= :minUnitPrice', {
        minUnitPrice: query.minUnitPrice,
      });
    }

    if (query.maxUnitPrice !== undefined) {
      qb.andWhere('sale.unitPrice <= :maxUnitPrice', {
        maxUnitPrice: query.maxUnitPrice,
      });
    }

    if (query.minLineTotal !== undefined) {
      qb.andWhere('sale.lineTotal >= :minLineTotal', {
        minLineTotal: query.minLineTotal,
      });
    }

    if (query.maxLineTotal !== undefined) {
      qb.andWhere('sale.lineTotal <= :maxLineTotal', {
        maxLineTotal: query.maxLineTotal,
      });
    }

    if (query.includeLines) {
      qb
        .leftJoin('sale.lines', 'line')
        .leftJoin('line.productVariant', 'productVariant')
        .addSelect([
          'line.id',
          'line.quantity',
          'line.currency',
          'line.unitPrice',
          'line.discountPercent',
          'line.discountAmount',
          'line.taxPercent',
          'line.taxAmount',
          'line.lineTotal',
          'line.campaignCode',
        ])
        .addSelect([
          'productVariant.id',
          'productVariant.name',
          'productVariant.code',
        ]);
    }

    const exposeRemaining = async (sales: Sale[]) => {
      const paidAmountBySaleId = await this.recalcPaidAmountsBySaleIds(
        sales.map((sale) => sale.id),
      );

      for (const s of sales) {
        const recalculatedPaidAmount = paidAmountBySaleId.get(s.id) ?? 0;
        s.paidAmount = recalculatedPaidAmount;
        s.paymentStatus = this.computePaymentStatus(
          recalculatedPaidAmount,
          Number(s.lineTotal || 0),
        );

        Object.defineProperty(s, 'remainingAmount', {
          value: s.remainingAmount,
          enumerable: true,
          configurable: true,
        });
      }
      return sales;
    };

    if (!query.hasPagination) {
      const sales = await qb.getMany();
      return { data: await exposeRemaining(sales) };
    }

    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.trunc(query.limit ?? 10)));
    const skip = (page - 1) * limit;

    const [sales, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      data: await exposeRemaining(sales),
      meta: {
        total,
        limit,
        page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ---- Ödeme işlemleri ----

  /**
   * ACTIVE + UPDATED statüsündeki ödemelerin mağaza baz para birimindeki
   * toplamını (amountInBaseCurrency) DB'den çeker.
   */
  private async recalcPaidAmountsBySaleIds(
    saleIds: string[],
  ): Promise<Map<string, number>> {
    const uniqueSaleIds = Array.from(new Set(saleIds.filter(Boolean)));
    if (uniqueSaleIds.length === 0) {
      return new Map();
    }

    const rows = await this.getSalePaymentRepo()
      .createQueryBuilder('p')
      .select('p.saleId', 'saleId')
      .addSelect(
        `COALESCE(
          SUM(
            CASE
              WHEN COALESCE(p."amountInBaseCurrency", 0) > 0
                THEN p."amountInBaseCurrency"
              ELSE COALESCE(p.amount, 0) * COALESCE(NULLIF(p."exchangeRate", 0), 1)
            END
          ),
          0
        )`,
        'total',
      )
      .where('p.saleId IN (:...saleIds)', { saleIds: uniqueSaleIds })
      .andWhere('p.status IN (:...statuses)', {
        statuses: [SalePaymentStatus.ACTIVE, SalePaymentStatus.UPDATED],
      })
      .groupBy('p.saleId')
      .getRawMany<{ saleId: string; total: string }>();

    return new Map(rows.map((row) => [row.saleId, Number(row.total ?? 0)]));
  }

  private async recalcPaidAmount(saleId: string): Promise<number> {
    const paidAmountBySaleId = await this.recalcPaidAmountsBySaleIds([saleId]);
    return paidAmountBySaleId.get(saleId) ?? 0;
  }

  /**
   * Ödeme para birimi ile mağaza baz para birimi arasındaki kuru döner.
   * Kur snapshot'ı ödeme anına aittir; TRY-TRY için 1.0 döner.
   */
  private async resolveExchangeRate(
    paymentCurrency: SupportedCurrency,
    storeCurrency: SupportedCurrency,
  ): Promise<number> {
    return this.exchangeRateService.getExchangeRate(paymentCurrency, storeCurrency);
  }

  async listPayments(saleId: string): Promise<SalePayment[]> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const sale = await this.getSaleRepo().findOne({
      where: { id: saleId, tenant: { id: tenantId } },
      select: { id: true },
    });

    if (!sale) {
      throw new NotFoundException(SalesErrors.SALE_NOT_FOUND);
    }

    return this.getSalePaymentRepo().find({
      where: { sale: { id: saleId } },
      order: { updatedAt: 'DESC' },
    });
  }

  async addPayment(
    saleId: string,
    dto: AddPaymentDto,
  ): Promise<{ payment: SalePayment; sale: Pick<Sale, 'paidAmount' | 'paymentStatus'> & { remainingAmount: number } }> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();

    const saleRepo = this.getSaleRepo();
    const sale = await saleRepo.findOne({
      where: { id: saleId, tenant: { id: tenantId } },
      relations: ['store'],
    });

    if (!sale) {
      throw new NotFoundException(SalesErrors.SALE_NOT_FOUND);
    }

    const storeCurrency = (sale.store?.currency ?? SupportedCurrency.TRY) as SupportedCurrency;
    const paymentCurrency = dto.currency ?? storeCurrency;
    const exchangeRate = await this.resolveExchangeRate(paymentCurrency, storeCurrency);
    const amountInBaseCurrency = Number(dto.amount) * exchangeRate;

    const payment = this.getSalePaymentRepo().create({
      sale: { id: saleId } as any,
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      note: dto.note,
      paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
      status: SalePaymentStatus.ACTIVE,
      currency: paymentCurrency,
      exchangeRate,
      amountInBaseCurrency,
      createdById: userId,
      updatedById: userId,
    });

    await this.getSalePaymentRepo().save(payment);

    sale.paidAmount = await this.recalcPaidAmount(saleId);
    sale.paymentStatus = this.computePaymentStatus(sale.paidAmount, Number(sale.lineTotal || 0));
    sale.updatedById = userId;
    await saleRepo.save(sale);

    return {
      payment,
      sale: {
        paidAmount: sale.paidAmount,
        paymentStatus: sale.paymentStatus,
        remainingAmount: sale.remainingAmount,
      },
    };
  }

  async updatePayment(
    saleId: string,
    paymentId: string,
    dto: UpdatePaymentDto,
  ): Promise<{ payment: SalePayment; sale: Pick<Sale, 'paidAmount' | 'paymentStatus'> & { remainingAmount: number } }> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();

    const saleRepo = this.getSaleRepo();
    const sale = await saleRepo.findOne({
      where: { id: saleId, tenant: { id: tenantId } },
      relations: ['store'],
    });

    if (!sale) {
      throw new NotFoundException(SalesErrors.SALE_NOT_FOUND);
    }

    const old = await this.getSalePaymentRepo().findOne({
      where: {
        id: paymentId,
        sale: { id: saleId },
        status: SalePaymentStatus.ACTIVE,
      },
    });

    if (!old) {
      throw new NotFoundException(SalesErrors.PAYMENT_NOT_FOUND);
    }

    // Eski kaydı iptal et
    old.status = SalePaymentStatus.CANCELLED;
    old.cancelledAt = new Date();
    old.cancelledById = userId;
    old.updatedById = userId;
    await this.getSalePaymentRepo().save(old);

    // Yeni değerler üzerinden kur hesapla
    const storeCurrency = (sale.store?.currency ?? SupportedCurrency.TRY) as SupportedCurrency;
    const newPaymentCurrency = dto.currency ?? old.currency ?? storeCurrency;
    const newExchangeRate = await this.resolveExchangeRate(newPaymentCurrency, storeCurrency);
    const newAmount = dto.amount ?? Number(old.amount);
    const newAmountInBase = newAmount * newExchangeRate;

    // Güncel değerlerle yeni kayıt aç
    const updated = this.getSalePaymentRepo().create({
      sale: { id: saleId } as any,
      amount: newAmount,
      paymentMethod: dto.paymentMethod ?? old.paymentMethod,
      note: dto.note !== undefined ? dto.note : old.note,
      paidAt: dto.paidAt ? new Date(dto.paidAt) : old.paidAt,
      status: SalePaymentStatus.UPDATED,
      currency: newPaymentCurrency,
      exchangeRate: newExchangeRate,
      amountInBaseCurrency: newAmountInBase,
      createdById: userId,
      updatedById: userId,
    });

    await this.getSalePaymentRepo().save(updated);

    sale.paidAmount = await this.recalcPaidAmount(saleId);
    sale.paymentStatus = this.computePaymentStatus(sale.paidAmount, Number(sale.lineTotal || 0));
    sale.updatedById = userId;
    await saleRepo.save(sale);

    return {
      payment: updated,
      sale: {
        paidAmount: sale.paidAmount,
        paymentStatus: sale.paymentStatus,
        remainingAmount: sale.remainingAmount,
      },
    };
  }

  async deletePayment(saleId: string, paymentId: string): Promise<void> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();

    const saleRepo = this.getSaleRepo();
    const sale = await saleRepo.findOne({
      where: { id: saleId, tenant: { id: tenantId } },
    });

    if (!sale) {
      throw new NotFoundException(SalesErrors.SALE_NOT_FOUND);
    }

    const payment = await this.getSalePaymentRepo().findOne({
      where: {
        id: paymentId,
        sale: { id: saleId },
        status: SalePaymentStatus.ACTIVE,
      },
    });

    if (!payment) {
      throw new NotFoundException(SalesErrors.PAYMENT_NOT_FOUND);
    }

    // Hard-delete yerine soft-cancel
    payment.status = SalePaymentStatus.CANCELLED;
    payment.cancelledAt = new Date();
    payment.cancelledById = userId;
    payment.updatedById = userId;
    await this.getSalePaymentRepo().save(payment);

    sale.paidAmount = await this.recalcPaidAmount(saleId);
    sale.paymentStatus = this.computePaymentStatus(sale.paidAmount, Number(sale.lineTotal || 0));
    sale.updatedById = userId;
    await saleRepo.save(sale);
  }

  // ---- Kısmi İade ----

  /**
   * Bir satıştan seçili satırları kısmen iade eder.
   * Orijinal satış CONFIRMED kalır, stoklar geri yüklenir.
   */
  async createSaleReturn(saleId: string, dto: CreateSaleReturnDto): Promise<SaleReturn> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();

    return this.dataSource.transaction(async (manager) => {
      const sale = await manager.getRepository(Sale).findOne({
        where: { id: saleId, tenant: { id: tenantId } },
        relations: [
          'store',
          'lines',
          'lines.productVariant',
          'lines.productPackage',
          'lines.productPackage.items',
          'lines.productPackage.items.productVariant',
        ],
      });

      if (!sale) throw new NotFoundException(SalesErrors.SALE_NOT_FOUND);
      if (sale.status !== SaleStatus.CONFIRMED) {
        throw new BadRequestException('Yalnızca CONFIRMED durumdaki satışlarda iade yapılabilir.');
      }

      // Her satırda kaç adet daha iade edilebileceğini hesapla
      const alreadyReturnedMap = await this.getAlreadyReturnedQuantities(saleId, manager);

      const lineMap = new Map(sale.lines.map((l) => [l.id, l]));
      let totalRefund = 0;

      const returnLineEntities: SaleReturnLine[] = [];

      for (const item of dto.lines) {
        const saleLine = lineMap.get(item.saleLineId);
        if (!saleLine) {
          throw new BadRequestException(`Satır ${item.saleLineId} bu satışa ait değil.`);
        }

        const alreadyReturned = alreadyReturnedMap.get(item.saleLineId) ?? 0;
        const maxReturnable = Number(saleLine.quantity) - alreadyReturned;

        if (item.quantity > maxReturnable) {
          throw new BadRequestException(
            `Satır ${item.saleLineId}: iade miktarı (${item.quantity}) izin verilenin üzerinde (${maxReturnable}).`,
          );
        }

        // Stok iadesi
        if (saleLine.productPackage) {
          const pkg = saleLine.productPackage as ProductPackage;
          for (const pkgItem of pkg.items ?? []) {
            const returnQty = item.quantity * Number(pkgItem.quantity);
            await this.inventoryService.createReturnMovementForSaleLine(
              {
                saleId,
                saleLineId: saleLine.id,
                storeId: sale.store.id,
                productVariantId: pkgItem.productVariant.id,
                quantity: returnQty,
                currency: saleLine.currency,
                unitPrice: undefined,
                lineTotal: undefined,
              },
              manager,
            );
          }
        } else if (saleLine.productVariant) {
          await this.inventoryService.createReturnMovementForSaleLine(
            {
              saleId,
              saleLineId: saleLine.id,
              storeId: sale.store.id,
              productVariantId: saleLine.productVariant.id,
              quantity: item.quantity,
              currency: saleLine.currency,
              unitPrice: saleLine.unitPrice,
              discountPercent: saleLine.discountPercent,
              discountAmount: saleLine.discountAmount,
              taxPercent: saleLine.taxPercent,
              taxAmount: saleLine.taxAmount,
              lineTotal: saleLine.lineTotal,
              campaignCode: saleLine.campaignCode,
            },
            manager,
          );
        }

        totalRefund += item.refundAmount ?? 0;

        const returnLine = manager.getRepository(SaleReturnLine).create({
          saleLine: { id: saleLine.id } as any,
          quantity: item.quantity,
          refundAmount: item.refundAmount ?? 0,
          createdById: userId,
          updatedById: userId,
        });
        returnLineEntities.push(returnLine);
      }

      const returnNo = `RET-${saleId.replace(/-/g, '').slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

      const saleReturn = manager.getRepository(SaleReturn).create({
        tenant: { id: tenantId } as any,
        sale: { id: saleId } as any,
        store: { id: sale.store.id } as any,
        returnNo,
        notes: dto.notes,
        totalRefundAmount: totalRefund,
        lines: returnLineEntities,
        createdById: userId,
        updatedById: userId,
      });

      return manager.getRepository(SaleReturn).save(saleReturn);
    });
  }

  async listSaleReturns(saleId: string): Promise<SaleReturn[]> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const sale = await this.saleRepo.findOne({
      where: { id: saleId, tenant: { id: tenantId } },
      select: { id: true },
    });
    if (!sale) throw new NotFoundException(SalesErrors.SALE_NOT_FOUND);

    return this.saleReturnRepo.find({
      where: { sale: { id: saleId }, tenant: { id: tenantId } },
      relations: ['lines', 'lines.saleLine', 'lines.saleLine.productVariant'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Bir satışta her satır için daha önce iade edilmiş toplam miktarı döner.
   */
  private async getAlreadyReturnedQuantities(
    saleId: string,
    manager: EntityManager,
  ): Promise<Map<string, number>> {
    const rows = await manager
      .getRepository(SaleReturnLine)
      .createQueryBuilder('rl')
      .select('rl.saleLineId', 'saleLineId')
      .addSelect('SUM(rl.quantity)', 'total')
      .innerJoin('rl.saleReturn', 'sr')
      .where('sr.saleId = :saleId', { saleId })
      .groupBy('rl.saleLineId')
      .getRawMany<{ saleLineId: string; total: string }>();

    return new Map(rows.map((r) => [r.saleLineId, Number(r.total)]));
  }

  // ---- PDF Fiş ----

  async generateReceipt(saleId: string): Promise<{ buffer: Buffer; receiptNo: string }> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const sale = await this.saleRepo.findOne({
      where: { id: saleId, tenant: { id: tenantId } },
      relations: [
        'store',
        'customer',
        'lines',
        'lines.productVariant',
        'lines.productVariant.product',
        'lines.productPackage',
      ],
    });

    if (!sale) throw new NotFoundException(SalesErrors.SALE_NOT_FOUND);

    const paidAmount = await this.recalcPaidAmount(saleId);
    const grandTotal = Number(sale.lineTotal ?? 0);
    const subtotal = Number(sale.unitPrice ?? grandTotal);
    const totalDiscount = grandTotal < subtotal ? subtotal - grandTotal : 0;

    const receiptData: ReceiptData = {
      receiptNo: sale.receiptNo ?? saleId.slice(0, 8).toUpperCase(),
      storeName: sale.store?.name ?? 'Mağaza',
      storeAddress: sale.store?.address ?? null,
      createdAt: sale.createdAt,
      customerName: sale.customer
        ? `${sale.customer.name ?? ''}${sale.customer.surname ? ' ' + sale.customer.surname : ''}`.trim() || null
        : null,
      customerPhone: sale.customer?.phoneNumber ?? null,
      lines: (sale.lines ?? []).map((line) => {
        const name = line.productVariant?.product?.name
          ?? line.productVariant?.name
          ?? line.productPackage?.name
          ?? '—';
        return {
          name,
          quantity: Number(line.quantity ?? 1),
          unitPrice: line.unitPrice != null ? Number(line.unitPrice) : null,
          lineTotal: line.lineTotal != null ? Number(line.lineTotal) : null,
          discountAmount: line.discountAmount != null ? Number(line.discountAmount) : null,
          taxAmount: line.taxAmount != null ? Number(line.taxAmount) : null,
        };
      }),
      subtotal,
      totalDiscount,
      totalTax: (sale.lines ?? []).reduce((sum, l) => sum + Number(l.taxAmount ?? 0), 0),
      grandTotal,
      paidAmount,
      remainingAmount: Math.max(0, grandTotal - paidAmount),
      currency: sale.currency ?? 'TRY',
      paymentStatus: this.computePaymentStatus(paidAmount, grandTotal),
    };

    const buffer = await this.saleReceiptService.generateReceiptPdf(receiptData);
    return { buffer, receiptNo: receiptData.receiptNo };
  }
}
