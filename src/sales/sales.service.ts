import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { Sale, SaleStatus } from './sale.entity';
import { SaleLine } from './sale-line.entity';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { AppContextService } from '../common/context/app-context.service';
import { InventoryService } from '../inventory/inventory.service';
import { SellStockDto } from '../inventory/dto/sell-stock.dto';
import { Store } from 'src/store/store.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { StoreErrors } from 'src/common/errors/store.errors';
import { ProductErrors } from 'src/common/errors/product.errors';
import { SalesErrors } from 'src/common/errors/sale.errors';
import { calculateLineAmounts } from 'src/pricing/utils/price-calculator';
import { PriceService } from 'src/pricing/price.service';
import {
  ListSalesForStoreQueryDto,
  PaginatedSalesResponse,
} from './dto/list-sales.dto';
import { CancelSaleDto } from './dto/cancel-sale.dto';

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
    private readonly appContext: AppContextService,
    private readonly inventoryService: InventoryService,
    private readonly priceService: PriceService,
    private readonly dataSource: DataSource,
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
    const saleLineRepo = manager.getRepository(SaleLine);

    const store = await this.getTenantStoreOrThrow(
      dto.storeId ?? this.appContext.getStoreIdOrThrow(),
      manager,
    );

    const variantIds = [...new Set(dto.lines.map((line) => line.productVariantId))];

    const variants = await manager.getRepository(ProductVariant).find({
      where: {
        id: In(variantIds),
        product: { tenant: { id: tenantId } },
      },
      relations: ['product', 'product.tenant'],
    });

    if (variants.length !== variantIds.length) {
      throw new NotFoundException(ProductErrors.VARIANT_NOT_FOUND);
    }

    const variantMap = new Map<string, ProductVariant>(
      variants.map((variant) => [variant.id, variant]),
    );

    const effectivePrices = await this.priceService.getEffectiveSaleParamsForStoreBulk(
      store.id,
      variantIds,
      manager,
    );

    // 1) Sale kaydı
    const sale = saleRepo.create({
      tenant: { id: tenantId } as any,
      store: { id: store.id } as any,
      status: SaleStatus.CONFIRMED,
      name: dto.name,
      surname: dto.surname,
      phoneNumber: dto.phoneNumber,
      email: dto.email,
      meta: dto.meta,
      createdById: userId,
      updatedById: userId,
    });

    const savedSale = await saleRepo.save(sale);
    savedSale.receiptNo = this.buildSaleReceiptNo(savedSale.id, savedSale.createdAt);
    savedSale.updatedById = userId;
    await saleRepo.save(savedSale);

    let totalUnitPrice = 0;
    let totalLineTotal = 0;
    const saleCurrencies = new Set<string>();

    const saleLines: SaleLine[] = [];

    // 2) Satırları oluştur + stok düş
    for (const lineDto of dto.lines) {
      const variant = variantMap.get(lineDto.productVariantId)!;
      const priceParams = effectivePrices.get(lineDto.productVariantId);

      // 🔹 1) PriceService ile mağaza bazlı efektif parametreleri al
      if (lineDto.unitPrice == null) {
        lineDto.unitPrice = priceParams?.unitPrice ?? 0;

        if (lineDto.taxPercent == null && priceParams?.taxPercent != null) {
          lineDto.taxPercent = priceParams.taxPercent;
        }

        if (
          lineDto.discountPercent == null &&
          priceParams?.discountPercent != null
        ) {
          lineDto.discountPercent = priceParams.discountPercent;
        }

        if (
          lineDto.discountPercent == null &&
          lineDto.discountAmount == null &&
          priceParams?.discountAmount != null
        ) {
          lineDto.discountAmount = priceParams.discountAmount;
        }

        if (
          lineDto.taxPercent == null &&
          lineDto.taxAmount == null &&
          priceParams?.taxAmount != null
        ) {
          lineDto.taxAmount = priceParams.taxAmount;
        }

        if (lineDto.lineTotal == null && priceParams?.lineTotal != null) {
          lineDto.lineTotal = priceParams.lineTotal;
        }
      }

      lineDto.currency = lineDto.currency ?? priceParams?.currency ?? 'TRY';

      const {
        net,
        discountPercent,
        taxPercent,
        lineTotal,
      } = calculateLineAmounts({
        quantity: lineDto.quantity,
        unitPrice: lineDto.unitPrice ?? 0,
        discountPercent: lineDto.discountPercent ?? null,
        discountAmount: lineDto.discountPercent != null ? null : (lineDto.discountAmount ?? null),
        taxPercent: lineDto.taxPercent ?? null,
        taxAmount: lineDto.taxPercent != null ? null : (lineDto.taxAmount ?? null),
      });

      const persistedDiscountPercent =
        lineDto.discountPercent != null ? (discountPercent ?? null) : null;
      const persistedDiscountAmount =
        lineDto.discountPercent != null ? null : (lineDto.discountAmount ?? null);
      const persistedTaxPercent =
        lineDto.taxPercent != null ? (taxPercent ?? null) : null;
      const persistedTaxAmount =
        lineDto.taxPercent != null ? null : (lineDto.taxAmount ?? null);

      const line = saleLineRepo.create({
        sale: { id: savedSale.id } as any,
        productVariant: { id: variant.id } as any,
        quantity: lineDto.quantity,
        currency: lineDto.currency,
        unitPrice: lineDto.unitPrice,
        discountPercent: persistedDiscountPercent,
        discountAmount: persistedDiscountAmount,
        taxPercent: persistedTaxPercent,
        taxAmount: persistedTaxAmount,
        lineTotal,
        campaignCode: lineDto.campaignCode,
        createdById: userId,
        updatedById: userId,
      });

      const savedLine = await saleLineRepo.save(line);
      saleLines.push(savedLine);
      saleCurrencies.add(lineDto.currency);

      totalUnitPrice += net;
      totalLineTotal += lineTotal;

      // 3) Stok düş (OUT) – transaction-aware InventoryService
      const sellDto: SellStockDto = {
        storeId: store.id,
        productVariantId: variant.id,
        quantity: lineDto.quantity,
        reference: savedSale.receiptNo ?? `SALE-${savedSale.id}`,
        meta: { saleId: savedSale.id, saleLineId: savedLine.id },
        currency: lineDto.currency,
        unitPrice: lineDto.unitPrice,
        discountPercent: persistedDiscountPercent ?? undefined,
        discountAmount: persistedDiscountAmount ?? undefined,
        taxPercent: persistedTaxPercent ?? undefined,
        taxAmount: persistedTaxAmount ?? undefined,
        lineTotal,
        campaignCode: lineDto.campaignCode,
        saleId: savedSale.id,
        saleLineId: savedLine.id,
      };

      await this.inventoryService.sellFromStore(sellDto, manager);
    }

    // 4) Satış toplamlarını güncelle
    savedSale.unitPrice = totalUnitPrice;
    savedSale.lineTotal = totalLineTotal;
    savedSale.currency = saleCurrencies.size === 1
      ? Array.from(saleCurrencies)[0]
      : null;
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
      relations: ['store', 'lines', 'lines.productVariant'],
    });

    if (!sale) {
      throw new NotFoundException(SalesErrors.SALE_NOT_FOUND);
    }

    if (sale.status === SaleStatus.CANCELLED) {
      throw new BadRequestException(SalesErrors.SALE_ALREADY_CANCELLED);
    }

    if (dto.name !== undefined) {
      sale.name = dto.name;
    }
    if (dto.surname !== undefined) {
      sale.surname = dto.surname;
    }
    if (dto.phoneNumber !== undefined) {
      sale.phoneNumber = dto.phoneNumber;
    }
    if (dto.email !== undefined) {
      sale.email = dto.email;
    }
    if (dto.meta !== undefined) {
      sale.meta = dto.meta;
    }

    if (dto.lines !== undefined) {
      if (dto.lines.length === 0) {
        throw new BadRequestException(SalesErrors.SALE_MUST_HAVE_LINES);
      }

      // 1) Eski satirlari stok olarak iade et (IN)
      for (const oldLine of sale.lines ?? []) {
        await this.inventoryService.createReturnMovementForSaleLine(
          {
            saleId: sale.id,
            saleLineId: oldLine.id,
            storeId: sale.store.id,
            productVariantId: oldLine.productVariant.id,
            quantity: oldLine.quantity,
            currency: oldLine.currency,
            unitPrice: oldLine.unitPrice,
            discountPercent: oldLine.discountPercent,
            discountAmount: oldLine.discountAmount,
            taxPercent: oldLine.taxPercent,
            taxAmount: oldLine.taxAmount,
            lineTotal: oldLine.lineTotal,
            campaignCode: oldLine.campaignCode,
          },
          manager,
        );
      }

      // 2) Eski satirlari sil ve yeni satirlari yeniden yaz
      await saleLineRepo
        .createQueryBuilder()
        .delete()
        .from(SaleLine)
        .where('saleId = :saleId', { saleId: sale.id })
        .execute();

      const variantIds = [...new Set(dto.lines.map((line) => line.productVariantId))];
      const variants = await manager.getRepository(ProductVariant).find({
        where: {
          id: In(variantIds),
          product: { tenant: { id: tenantId } },
        },
        relations: ['product', 'product.tenant'],
      });

      if (variants.length !== variantIds.length) {
        throw new NotFoundException(ProductErrors.VARIANT_NOT_FOUND);
      }

      const variantMap = new Map<string, ProductVariant>(
        variants.map((variant) => [variant.id, variant]),
      );

      const effectivePrices = await this.priceService.getEffectiveSaleParamsForStoreBulk(
        sale.store.id,
        variantIds,
        manager,
      );

      let totalUnitPrice = 0;
      let totalLineTotal = 0;
      const saleCurrencies = new Set<string>();

      for (const lineDto of dto.lines) {
        const variant = variantMap.get(lineDto.productVariantId)!;
        const priceParams = effectivePrices.get(lineDto.productVariantId);
        const workingLine = { ...lineDto };

        if (workingLine.unitPrice == null) {
          workingLine.unitPrice = priceParams?.unitPrice ?? 0;

          if (workingLine.taxPercent == null && priceParams?.taxPercent != null) {
            workingLine.taxPercent = priceParams.taxPercent;
          }

          if (
            workingLine.discountPercent == null &&
            priceParams?.discountPercent != null
          ) {
            workingLine.discountPercent = priceParams.discountPercent;
          }

          if (
            workingLine.discountPercent == null &&
            workingLine.discountAmount == null &&
            priceParams?.discountAmount != null
          ) {
            workingLine.discountAmount = priceParams.discountAmount;
          }

          if (
            workingLine.taxPercent == null &&
            workingLine.taxAmount == null &&
            priceParams?.taxAmount != null
          ) {
            workingLine.taxAmount = priceParams.taxAmount;
          }

          if (workingLine.lineTotal == null && priceParams?.lineTotal != null) {
            workingLine.lineTotal = priceParams.lineTotal;
          }
        }

        workingLine.currency = workingLine.currency ?? priceParams?.currency ?? 'TRY';
        const lineCurrency = workingLine.currency ?? 'TRY';

        const {
          net,
          discountPercent,
          taxPercent,
          lineTotal,
        } = calculateLineAmounts({
          quantity: workingLine.quantity,
          unitPrice: workingLine.unitPrice ?? 0,
          discountPercent: workingLine.discountPercent ?? null,
          discountAmount:
            workingLine.discountPercent != null
              ? null
              : (workingLine.discountAmount ?? null),
          taxPercent: workingLine.taxPercent ?? null,
          taxAmount:
            workingLine.taxPercent != null
              ? null
              : (workingLine.taxAmount ?? null),
        });

        const persistedDiscountPercent =
          workingLine.discountPercent != null ? (discountPercent ?? null) : null;
        const persistedDiscountAmount =
          workingLine.discountPercent != null
            ? null
            : (workingLine.discountAmount ?? null);
        const persistedTaxPercent =
          workingLine.taxPercent != null ? (taxPercent ?? null) : null;
        const persistedTaxAmount =
          workingLine.taxPercent != null ? null : (workingLine.taxAmount ?? null);

        const line = saleLineRepo.create({
          sale: { id: sale.id } as any,
          productVariant: { id: variant.id } as any,
          quantity: workingLine.quantity,
          currency: lineCurrency,
          unitPrice: workingLine.unitPrice,
          discountPercent: persistedDiscountPercent,
          discountAmount: persistedDiscountAmount,
          taxPercent: persistedTaxPercent,
          taxAmount: persistedTaxAmount,
          lineTotal,
          campaignCode: workingLine.campaignCode,
          createdById: userId,
          updatedById: userId,
        });

        const savedLine = await saleLineRepo.save(line);
        saleCurrencies.add(lineCurrency);
        totalUnitPrice += net;
        totalLineTotal += lineTotal;

        await this.inventoryService.sellFromStore(
          {
            storeId: sale.store.id,
            productVariantId: variant.id,
            quantity: workingLine.quantity,
            reference: sale.receiptNo ?? `SALE-${sale.id}`,
            meta: { saleId: sale.id, saleLineId: savedLine.id, edited: true },
            currency: lineCurrency,
            unitPrice: workingLine.unitPrice,
            discountPercent: persistedDiscountPercent ?? undefined,
            discountAmount: persistedDiscountAmount ?? undefined,
            taxPercent: persistedTaxPercent ?? undefined,
            taxAmount: persistedTaxAmount ?? undefined,
            lineTotal,
            campaignCode: workingLine.campaignCode,
            saleId: sale.id,
            saleLineId: savedLine.id,
          },
          manager,
        );
      }

      sale.unitPrice = totalUnitPrice;
      sale.lineTotal = totalLineTotal;
      sale.currency =
        saleCurrencies.size === 1 ? Array.from(saleCurrencies)[0] : null;
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
      relations: ['store', 'lines', 'lines.productVariant'],
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

    // Her satır için iade (IN)
    for (const line of sale.lines) {
      await this.inventoryService.createReturnMovementForSaleLine(
        {
          saleId: sale.id,
          saleLineId: line.id,
          storeId: sale.store.id,
          productVariantId: line.productVariant.id,
          quantity: line.quantity,
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
      relations: ['store', 'lines', 'lines.productVariant', 'lines.productVariant.product'],
    });

    if (!sale) {
      throw new NotFoundException(SalesErrors.SALE_NOT_FOUND);
    }

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
      name: sale.name ?? null,
      surname: sale.surname ?? null,
      phoneNumber: sale.phoneNumber ?? null,
      email: sale.email ?? null,
      meta: sale.meta ?? null,
      unitPrice: String(sale.unitPrice ?? 0),
      lineTotal: String(sale.lineTotal ?? 0),
      lines: (sale.lines ?? []).map((line) => ({
        id: line.id,
        productId: line.productVariant?.product?.id ?? null,
        productName: line.productVariant?.product?.name ?? null,
        productVariant: line.productVariant
          ? {
              id: line.productVariant.id,
              name: line.productVariant.name,
              code: line.productVariant.code,
            }
          : null,
        quantity: String(line.quantity ?? 0),
        currency: line.currency ?? null,
        unitPrice: line.unitPrice != null ? String(line.unitPrice) : null,
        discountPercent:
          line.discountPercent != null ? String(line.discountPercent) : null,
        discountAmount:
          line.discountAmount != null ? String(line.discountAmount) : null,
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
      .select([
        'sale.id',
        'sale.receiptNo',
        'sale.currency',
        'sale.status',
        'sale.unitPrice',
        'sale.lineTotal',
        'sale.name',
        'sale.surname',
        'sale.phoneNumber',
        'sale.email',
        'sale.meta',
        'sale.createdAt',
      ])
      .addSelect(['store.id', 'store.name', 'store.code'])
      .where('sale.tenantId = :tenantId', { tenantId })
      .orderBy('sale.createdAt', 'DESC');

    if (requestedStoreIds.length > 0) {
      qb.andWhere('sale.storeId IN (:...storeIds)', { storeIds: requestedStoreIds });
    }

    if (query.receiptNo?.trim()) {
      qb.andWhere('sale.receiptNo ILIKE :receiptNo', {
        receiptNo: `%${query.receiptNo.trim()}%`,
      });
    }

    if (query.name?.trim()) {
      qb.andWhere('sale.name ILIKE :name', { name: `%${query.name.trim()}%` });
    }

    if (query.surname?.trim()) {
      qb.andWhere('sale.surname ILIKE :surname', {
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

    if (!query.hasPagination) {
      const sales = await qb.getMany();
      return { data: sales };
    }

    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.trunc(query.limit ?? 10)));
    const skip = (page - 1) * limit;

    const [sales, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      data: sales,
      meta: {
        total,
        limit,
        page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
