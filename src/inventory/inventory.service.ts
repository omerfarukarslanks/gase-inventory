import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { InventoryMovement, MovementType } from './inventory-movement.entity';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { AppContextService } from '../common/context/app-context.service';
import { Store } from 'src/store/store.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { SellStockDto } from './dto/sell-stock.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { InventoryErrors } from 'src/common/errors/inventory.errors';
import { StoreVariantStock } from './store-variant-stock.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import { ListMovementsQueryDto, PaginatedMovementsResponse } from './dto/list-movements.dto';
import { BulkReceiveStockDto } from './dto/bulk-receive-stock.dto';
import { LowStockQueryDto } from './dto/low-stock-query.dto';
import { StoreProductPrice } from 'src/pricing/store-product-price.entity';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(InventoryMovement)
    private readonly movementRepo: Repository<InventoryMovement>,
    @InjectRepository(StoreVariantStock)
    private readonly stockSummaryRepo: Repository<StoreVariantStock>,
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(StoreProductPrice)
    private readonly storeProductPriceRepo: Repository<StoreProductPrice>,
    private readonly appContext: AppContextService,
  ) {}

  // ---- Helpers ----

  private getTenantIdOrThrow(): string {
    return this.appContext.getTenantIdOrThrow();
  }

  private getUserIdOrThrow(): string {
    return this.appContext.getUserIdOrThrow();
  }

  private async runInTransaction<T>(
    manager: EntityManager | undefined,
    handler: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (manager) {
      return handler(manager);
    }

    return this.movementRepo.manager.transaction(handler);
  }

  private getMovementRepo(manager?: EntityManager): Repository<InventoryMovement> {
    return manager ? manager.getRepository(InventoryMovement) : this.movementRepo;
  }

  private getStoreRepo(manager?: EntityManager): Repository<Store> {
    return manager ? manager.getRepository(Store) : this.storeRepo;
  }

  private getVariantRepo(manager?: EntityManager): Repository<ProductVariant> {
    return manager ? manager.getRepository(ProductVariant) : this.variantRepo;
  }

  private async getTenantStoreOrThrow(storeId: string, manager?: EntityManager): Promise<Store> {
    const tenantId = this.getTenantIdOrThrow();

    const repo = this.getStoreRepo(manager);

    const store = await repo.findOne({
      where: { id: storeId, tenant: { id: tenantId } },
    });

    if (!store) {
      throw new NotFoundException(InventoryErrors.STORE_NOT_FOUND_FOR_TENANT);
    }

    return store;
  }

  private async getTenantVariantOrThrow(variantId: string, manager?: EntityManager): Promise<ProductVariant> {
    const tenantId = this.getTenantIdOrThrow();

    // ProductVariant -> Product -> Tenant üzerinden kontrol
    const variant = await this.getVariantRepo(manager).findOne({
      where: {
        id: variantId,
        product: {
          tenant: { id: tenantId },
        },
      },
      relations: ['product', 'product.tenant'],
    });

    if (!variant) {
      throw new NotFoundException(InventoryErrors.VARIANT_NOT_FOUND_FOR_TENANT);
    }

    return variant;
  }

  private getStockSummaryRepository(manager?: EntityManager) {
    return manager
      ? manager.getRepository(StoreVariantStock)
      : this.stockSummaryRepo;
  }

  private async calculateMovementSum(
    tenantId: string,
    storeId: string,
    variantId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const row = await this.getMovementRepo(manager)
      .createQueryBuilder('m')
      .select('COALESCE(SUM(m.quantity), 0)', 'sum')
      .where('m.tenantId = :tenantId', { tenantId })
      .andWhere('m.storeId = :storeId', { storeId })
      .andWhere('m.productVariantId = :variantId', { variantId })
      .getRawOne<{ sum: string | null }>();

    const sum = row?.sum ?? '0';

    return Number(sum);
  }

  private async ensureStoreVariantStock(
    tenantId: string,
    storeId: string,
    variantId: string,
    manager?: EntityManager,
    lock = false,
    initializeWithMovementSum = true,
  ): Promise<StoreVariantStock> {
    const repo = this.getStockSummaryRepository(manager);

    const qb = repo
      .createQueryBuilder('s')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s.storeId = :storeId', { storeId })
      .andWhere('s.productVariantId = :variantId', { variantId });

    if (lock) {
      qb.setLock('pessimistic_write');
    }

    let summary = await qb.getOne();

    if (!summary) {
      const quantity = initializeWithMovementSum
        ? await this.calculateMovementSum(
            tenantId,
            storeId,
            variantId,
            manager,
          )
        : 0;

      const userId = this.getUserIdOrThrow();

      summary = repo.create({
        tenant: { id: tenantId } as Tenant,
        store: { id: storeId } as Store,
        productVariant: { id: variantId } as ProductVariant,
        quantity,
        createdById: userId,
        updatedById: userId,
      });

      summary = await repo.save(summary);
    }

    return summary;
  }

  private async applyMovementToStockSummary(
    tenantId: string,
    storeId: string,
    variantId: string,
    quantityDelta: number,
    manager?: EntityManager,
  ): Promise<StoreVariantStock> {
    const repo = this.getStockSummaryRepository(manager);
    const summary = await this.ensureStoreVariantStock(
      tenantId,
      storeId,
      variantId,
      manager,
      true,
      false,
    );

    summary.quantity = Number(summary.quantity) + quantityDelta;
    summary.updatedById = this.getUserIdOrThrow();

    return repo.save(summary);
  }

  // ---- Hareket yazma helper'ı ----

  private async createMovement(
    params: {
      tenantId: string;
      store: Store;
      variant: ProductVariant;
      type: MovementType;
      quantity: number; // signed
      reference?: string;
      meta?: Record<string, any>;

      currency?: string;
      unitPrice?: number;
      taxPercent?: number;
      discountPercent?: number;
      discountAmount?: number;

      taxAmount?: number;
      lineTotal?: number;
      campaignCode?: string;

      saleId?: string;
      saleLineId?: string;
    },
    manager?: EntityManager,
  ): Promise<InventoryMovement> {
    return this.runInTransaction(manager, async (txManager) => {
      const userId = this.getUserIdOrThrow();

      const repo = this.getMovementRepo(txManager);

      const movement = repo.create({
        tenant: { id: params.tenantId } as any,
        store: { id: params.store.id } as any,
        productVariant: { id: params.variant.id } as any,
        type: params.type,
        quantity: params.quantity,
        reference: params.reference,
        meta: params.meta,

        currency: params.currency,
        unitPrice: params.unitPrice,
        discountPercent: params.discountPercent,
        discountAmount: params.discountAmount,
        taxPercent: params.taxPercent,
        taxAmount: params.taxAmount,
        lineTotal: params.lineTotal,
        campaignCode: params.campaignCode,

        saleId: params.saleId,
        saleLineId: params.saleLineId,

        createdById: userId,
        updatedById: userId,
      });

      const savedMovement = await repo.save(movement);

      await this.applyMovementToStockSummary(
        params.tenantId,
        params.store.id,
        params.variant.id,
        params.quantity,
        txManager,
      );

      return savedMovement;
    });
  }

  private async getLockedStockForVariantInStore(
    manager: EntityManager,
    storeId: string,
    variantId: string,
  ): Promise<number> {
    const tenantId = this.getTenantIdOrThrow();

    const summary = await this.ensureStoreVariantStock(
      tenantId,
      storeId,
      variantId,
      manager,
      true,
    );

    return Number(summary.quantity);
  }

  /**
   * Satış satırı için iade (return) hareketi oluşturur.
   * - type: IN
   * - quantity: pozitif (satılan adet kadar stok geri alınır)
   */
  async createReturnMovementForSaleLine(params: {
    saleId: string;
    saleLineId: string;
    storeId: string;
    productVariantId: string;
    quantity: number;
    currency?: string;
    unitPrice?: number;
    discountPercent?: number;
    discountAmount?: number;
    taxPercent?: number;
    taxAmount?: number;
    lineTotal?: number;
    campaignCode?: string;
  }, manager?: EntityManager): Promise<InventoryMovement> {
    if (params.quantity <= 0) {
      throw new BadRequestException(InventoryErrors.INVALID_QUANTITY);
    }

    const tenantId = this.getTenantIdOrThrow();
    const store = await this.getTenantStoreOrThrow(params.storeId, manager);
    const variant = await this.getTenantVariantOrThrow(params.productVariantId, manager);

    return this.createMovement({
      tenantId,
      store,
      variant,
      type: MovementType.IN, // iade = stok geri girişi
      quantity: params.quantity, // pozitif

      reference: `SALE-RETURN-${params.saleId}`,
      meta: {
        returnOfSaleId: params.saleId,
        returnOfSaleLineId: params.saleLineId,
      },

      currency: params.currency,
      unitPrice: params.unitPrice,
      discountPercent: params.discountPercent,
      discountAmount: params.discountAmount,
      taxPercent: params.taxPercent,
      taxAmount: params.taxAmount,
      lineTotal: params.lineTotal,
      campaignCode: params.campaignCode,

      saleId: params.saleId,
      saleLineId: params.saleLineId,
    }, manager);
  }

  // ---- Use-case: tedarik / stok girişi ----

  async receiveStock(
    dto: ReceiveStockDto,
    manager?: EntityManager,
  ): Promise<InventoryMovement> {
    if (dto.quantity <= 0) {
      throw new BadRequestException(InventoryErrors.INVALID_QUANTITY);
    }

    const tenantId = this.getTenantIdOrThrow();
    const store = await this.getTenantStoreOrThrow(dto.storeId, manager);
    const variant = await this.getTenantVariantOrThrow(dto.productVariantId, manager);

    const product = variant.product; // relations aldığın yerde ürün zaten gelir

    const currency = dto.currency ?? product.defaultCurrency ?? 'TRY';
    const unitPrice = dto.unitPrice ?? product.defaultPurchasePrice ?? 0;
    const taxPercent = dto.taxPercent ?? product.defaultTaxPercent ?? 0;

    return this.createMovement(
      {
        tenantId,
        store,
        variant,
        type: MovementType.IN,
        quantity: dto.quantity, // IN -> pozitif
        reference: dto.reference,
        meta: dto.meta,

        currency,
        unitPrice,
        taxPercent,
        discountPercent: dto.discountPercent,
        discountAmount: dto.discountAmount,
        taxAmount: dto.taxAmount,
        lineTotal: dto.lineTotal,
        campaignCode: dto.campaignCode,
      },
      manager,
    );
  }

  async sellFromStore(
    dto: SellStockDto,
    manager?: EntityManager,
  ): Promise<InventoryMovement> {
    return this.runInTransaction(manager, async (txManager) => {
      if (dto.quantity <= 0) {
        throw new BadRequestException(InventoryErrors.INVALID_QUANTITY);
      }

      const tenantId = this.getTenantIdOrThrow();
      const store = await this.getTenantStoreOrThrow(dto.storeId, txManager);
      const variant = await this.getTenantVariantOrThrow(
        dto.productVariantId,
        txManager,
      );

      // Önce stok yeterli mi kontrol et (kilitlenmiş şekilde)
      const currentStock = await this.getLockedStockForVariantInStore(
        txManager,
        store.id,
        variant.id,
      );

      if (currentStock < dto.quantity) {
        this.logger.warn('Insufficient stock for sale', {
          tenantId,
          storeId: store.id,
          variantId: variant.id,
          currentStock,
          requested: dto.quantity,
        });

        throw new BadRequestException({
          ...InventoryErrors.NOT_ENOUGH_STOCK,
          details: { currentStock, requested: dto.quantity },
        });
      }

      // OUT hareketi: quantity negatif
      return this.createMovement(
        {
          tenantId,
          store,
          variant,
          type: MovementType.OUT,
          quantity: -dto.quantity,
          reference: dto.reference,
          meta: dto.meta,

          currency: dto.currency,
          unitPrice: dto.unitPrice,
          discountPercent: dto.discountPercent,
          discountAmount: dto.discountAmount,
          taxPercent: dto.taxPercent,
          taxAmount: dto.taxAmount,
          lineTotal: dto.lineTotal,
          campaignCode: dto.campaignCode,

          saleId: dto.saleId,
          saleLineId: dto.saleLineId,
        },
        txManager,
      );
    });
  }

/**
   * Sayım sonrası fiili stok ile sistem stokunu eşitlemek için:
   * newQuantity = hedef stok
   * ADJUSTMENT movement = newQuantity - currentStock
   */
  async adjustStock(dto: AdjustStockDto, manager?: EntityManager): Promise<{
    movement: InventoryMovement | null;
    previousQuantity: number;
    newQuantity: number;
    difference: number;
  }> {
    const tenantId = this.getTenantIdOrThrow();
    const store = await this.getTenantStoreOrThrow(dto.storeId, manager);
    const variant = await this.getTenantVariantOrThrow(dto.productVariantId, manager);

    // Mevcut stok
    const currentStock = await this.getStockForVariantInStore(
      store.id,
      variant.id,
      manager
    );

    const diff = dto.newQuantity - currentStock;

    // Fark yoksa hareket yazmaya gerek olmayabilir
    if (diff === 0) {
      return {
        movement: null,
        previousQuantity: currentStock,
        newQuantity: dto.newQuantity,
        difference: 0,
      };
    }

    const movement = await this.createMovement({
      tenantId,
      store,
      variant,
      type: MovementType.ADJUSTMENT,
      quantity: diff, // pozitifse ekleme, negatifse eksiltme
      reference: dto.reference,
      meta: {
        ...(dto.meta || {}),
        adjustmentFrom: currentStock,
        adjustmentTo: dto.newQuantity,
      },
      // Fiyat alanlarını ADJUSTMENT için boş bırakıyoruz (genelde gerek yok)
    }, manager);

    return {
      movement,
      previousQuantity: currentStock,
      newQuantity: dto.newQuantity,
      difference: diff,
    };
  }


  // ---- Use-case: mağazalar arası transfer ----

  async transferStock(dto: TransferStockDto, manager?: EntityManager): Promise<InventoryMovement[]> {
    return this.runInTransaction(manager, async (txManager) => {
      if (dto.quantity <= 0) {
        throw new BadRequestException(InventoryErrors.INVALID_QUANTITY);
      }
      if (dto.fromStoreId === dto.toStoreId) {
        throw new BadRequestException(InventoryErrors.SAME_SOURCE_AND_TARGET_STORE);
      }

      const tenantId = this.getTenantIdOrThrow();

      const fromStore = await this.getTenantStoreOrThrow(dto.fromStoreId, txManager);
      const toStore = await this.getTenantStoreOrThrow(dto.toStoreId, txManager);
      const variant = await this.getTenantVariantOrThrow(dto.productVariantId, txManager);

      const currentFromStock = await this.getLockedStockForVariantInStore(
        txManager,
        fromStore.id,
        variant.id,
      );
      if (currentFromStock < dto.quantity) {
        this.logger.warn('Insufficient stock for transfer', {
          tenantId,
          fromStoreId: fromStore.id,
          toStoreId: toStore.id,
          variantId: variant.id,
          currentFromStock,
          requested: dto.quantity,
        });

        throw new BadRequestException({
          ...InventoryErrors.NOT_ENOUGH_STOCK,
          details: { currentFromStock, requested: dto.quantity },
        });
      }

      const outMovement = await this.createMovement(
        {
          tenantId,
          store: fromStore,
          variant,
          type: MovementType.TRANSFER_OUT,
          quantity: -dto.quantity, // OUT -> negatif
          reference: dto.reference,
          meta: dto.meta,
        },
        txManager,
      );

      const inMovement = await this.createMovement(
        {
          tenantId,
          store: toStore,
          variant,
          type: MovementType.TRANSFER_IN,
          quantity: dto.quantity, // IN -> pozitif
          reference: dto.reference,
          meta: dto.meta,
        },
        txManager,
      );

      return [outMovement, inMovement];
    });
  }

  // ---- Stok sorguları ----

  /**
   * Belirli bir store + variant için net stok
   */
  async getStockForVariantInStore(
    storeId: string,
    variantId: string,
    manager?: EntityManager
  ): Promise<number> {
    const tenantId = this.getTenantIdOrThrow();

    // store & variant gerçekten bu tenanta mı? emin olalım
    await this.getTenantStoreOrThrow(storeId, manager);
    await this.getTenantVariantOrThrow(variantId, manager);

    const summary = await this.ensureStoreVariantStock(
      tenantId,
      storeId,
      variantId,
      manager,
    );

    return Number(summary.quantity);
  }

  /**
   * Belirli bir store için, variant bazlı stok listesi
   * (ör: mağazadaki tüm ürünlerin stok listesi)
   */
  async getStoreStockSummary(storeId: string, manager?: EntityManager): Promise<
    {
      items: {
        productId: string;
        productName: string;
        productVariantId: string;
        variantName: string;
        variantCode: string;
        quantity: number;
        salePrice: number | null;
        purchasePrice: number | null;
        currency: string;
        taxPercent: number | null;
        discountPercent: number | null;
        isStoreOverride: boolean;
      }[];
      totalQuantity: number;
      storeId: string;
      storeName: string;
    }
  > {
    const tenantId = this.getTenantIdOrThrow();
    const store = await this.getTenantStoreOrThrow(storeId, manager);
    const repo = this.getStockSummaryRepository(manager);
    const sppTableName = this.storeProductPriceRepo.metadata.tableName;

    const rows = await repo
      .createQueryBuilder('s')
      .innerJoin('s.productVariant', 'variant')
      .innerJoin('variant.product', 'product')
      .innerJoin('s.store', 'store')
      .leftJoin(
        sppTableName,
        'spp',
        [
          'spp."tenantId" = s."tenantId"',
          'spp."storeId" = s."storeId"',
          'spp."productVariantId" = s."productVariantId"',
          'spp."isActive" = true',
        ].join(' AND '),
      )
      .select('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('s.productVariantId', 'productVariantId')
      .addSelect('variant.name', 'variantName')
      .addSelect('variant.code', 'variantCode')
      .addSelect('store.id', 'storeId')
      .addSelect('store.name', 'storeName')
      .addSelect('s.quantity', 'quantity')
      .addSelect('COALESCE(spp."salePrice", variant."defaultSalePrice")', 'salePrice')
      .addSelect('COALESCE(spp."purchasePrice", variant."defaultPurchasePrice")', 'purchasePrice')
      .addSelect('COALESCE(spp."currency", variant."defaultCurrency", \'TRY\')', 'currency')
      .addSelect('COALESCE(spp."taxPercent", variant."defaultTaxPercent")', 'taxPercent')
      .addSelect('spp."discountPercent"', 'discountPercent')
      .addSelect('CASE WHEN spp."id" IS NULL THEN false ELSE true END', 'isStoreOverride')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s.storeId = :storeId', { storeId })
      .orderBy('product.name', 'ASC')
      .addOrderBy('variant.name', 'ASC')
      .getRawMany<{
        productId: string;
        productName: string;
        productVariantId: string;
        variantName: string;
        variantCode: string;
        storeId: string;
        storeName: string;
        quantity: string;
        salePrice: string | null;
        purchasePrice: string | null;
        currency: string | null;
        taxPercent: string | null;
        discountPercent: string | null;
        isStoreOverride: boolean | string;
      }>();

    const items = rows.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      productVariantId: row.productVariantId,
      variantName: row.variantName,
      variantCode: row.variantCode,
      quantity: Number(row.quantity),
      salePrice: row.salePrice !== null ? Number(row.salePrice) : null,
      purchasePrice: row.purchasePrice !== null ? Number(row.purchasePrice) : null,
      currency: row.currency ?? 'TRY',
      taxPercent: row.taxPercent !== null ? Number(row.taxPercent) : null,
      discountPercent: row.discountPercent !== null ? Number(row.discountPercent) : null,
      isStoreOverride: row.isStoreOverride === true || row.isStoreOverride === 'true',
    }));

    return {
      items,
      totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      storeId: store.id,
      storeName: store.name,
    };
  }

    /**
   * Tenant bazlı stok özeti:
   * - Tüm mağazalar (stores) üzerinden
   * - productVariantId bazında toplam quantity
   */
  async getTenantStockSummary(
    manager?: EntityManager,
  ): Promise<
    {
      items: {
        productId: string;
        productName: string;
        productVariantId: string;
        variantName: string;
        variantCode: string;
        totalQuantity: number;
        stores: {
          storeId: string;
          storeName: string;
          quantity: number;
          salePrice: number | null;
          purchasePrice: number | null;
          currency: string;
          taxPercent: number | null;
          discountPercent: number | null;
          isStoreOverride: boolean;
        }[];
      }[];
      totalQuantity: number;
    }
  > {
    const tenantId = this.getTenantIdOrThrow();

    const repo = this.getStockSummaryRepository(manager);
    const sppTableName = this.storeProductPriceRepo.metadata.tableName;

    const rows = await repo
      .createQueryBuilder('s')
      .innerJoin('s.productVariant', 'variant')
      .innerJoin('variant.product', 'product')
      .innerJoin('s.store', 'store')
      .leftJoin(
        sppTableName,
        'spp',
        [
          'spp."tenantId" = s."tenantId"',
          'spp."storeId" = s."storeId"',
          'spp."productVariantId" = s."productVariantId"',
          'spp."isActive" = true',
        ].join(' AND '),
      )
      .select('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('s.productVariantId', 'productVariantId')
      .addSelect('variant.name', 'variantName')
      .addSelect('variant.code', 'variantCode')
      .addSelect('store.id', 'storeId')
      .addSelect('store.name', 'storeName')
      .addSelect('s.quantity', 'quantity')
      .addSelect('COALESCE(spp."salePrice", variant."defaultSalePrice")', 'salePrice')
      .addSelect('COALESCE(spp."purchasePrice", variant."defaultPurchasePrice")', 'purchasePrice')
      .addSelect('COALESCE(spp."currency", variant."defaultCurrency", \'TRY\')', 'currency')
      .addSelect('COALESCE(spp."taxPercent", variant."defaultTaxPercent")', 'taxPercent')
      .addSelect('spp."discountPercent"', 'discountPercent')
      .addSelect('CASE WHEN spp."id" IS NULL THEN false ELSE true END', 'isStoreOverride')
      .where('s.tenantId = :tenantId', { tenantId })
      .orderBy('product.name', 'ASC')
      .addOrderBy('variant.name', 'ASC')
      .addOrderBy('store.name', 'ASC')
      .getRawMany<{
        productId: string;
        productName: string;
        productVariantId: string;
        variantName: string;
        variantCode: string;
        storeId: string;
        storeName: string;
        quantity: string;
        salePrice: string | null;
        purchasePrice: string | null;
        currency: string | null;
        taxPercent: string | null;
        discountPercent: string | null;
        isStoreOverride: boolean | string;
      }>();

    const byVariant = new Map<
      string,
      {
        productId: string;
        productName: string;
        productVariantId: string;
        variantName: string;
        variantCode: string;
        totalQuantity: number;
        stores: {
          storeId: string;
          storeName: string;
          quantity: number;
          salePrice: number | null;
          purchasePrice: number | null;
          currency: string;
          taxPercent: number | null;
          discountPercent: number | null;
          isStoreOverride: boolean;
        }[];
      }
    >();

    for (const row of rows) {
      const key = row.productVariantId;
      const quantity = Number(row.quantity);
      if (!byVariant.has(key)) {
        byVariant.set(key, {
          productId: row.productId,
          productName: row.productName,
          productVariantId: row.productVariantId,
          variantName: row.variantName,
          variantCode: row.variantCode,
          totalQuantity: 0,
          stores: [],
        });
      }

      const item = byVariant.get(key)!;
      item.totalQuantity += quantity;
      item.stores.push({
        storeId: row.storeId,
        storeName: row.storeName,
        quantity,
        salePrice: row.salePrice !== null ? Number(row.salePrice) : null,
        purchasePrice: row.purchasePrice !== null ? Number(row.purchasePrice) : null,
        currency: row.currency ?? 'TRY',
        taxPercent: row.taxPercent !== null ? Number(row.taxPercent) : null,
        discountPercent: row.discountPercent !== null ? Number(row.discountPercent) : null,
        isStoreOverride: row.isStoreOverride === true || row.isStoreOverride === 'true',
      });
    }

    const items = Array.from(byVariant.values());

    return {
      items,
      totalQuantity: items.reduce((sum, item) => sum + item.totalQuantity, 0),
    };
  }

  /**
   * Bir ürün varyantının, tenant içindeki tüm mağazalarda
   * ne kadar stoğu olduğunu döner.
   *
   * Çıktı örneği:
   * [
   *   { storeId: '...', quantity: 10 },
   *   { storeId: '...', quantity: 25 },
   * ]
   */
  async getVariantStockByStore(
    productVariantId: string,
    manager?: EntityManager,
  ): Promise<{ storeId: string; quantity: number }[]> {
    const tenantId = this.getTenantIdOrThrow();

    await this.getTenantVariantOrThrow(productVariantId, manager);

    const repo = this.getStockSummaryRepository(manager);

    const rows = await repo
      .createQueryBuilder('s')
      .select('s.storeId', 'storeId')
      .addSelect('s.quantity', 'quantity')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s.productVariantId = :variantId', { variantId: productVariantId })
      .getRawMany<{ storeId: string; quantity: string }>();

    return rows.map((r) => ({
      storeId: r.storeId,
      quantity: Number(r.quantity),
    }));
  }

  // ---- Hareket geçmişi ----

  async getMovementHistory(
    query: ListMovementsQueryDto,
    manager?: EntityManager,
  ): Promise<PaginatedMovementsResponse> {
    const tenantId = this.getTenantIdOrThrow();
    const qb = this.getMovementRepo(manager)
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.store', 'store')
      .leftJoinAndSelect('m.productVariant', 'variant')
      .where('m.tenantId = :tenantId', { tenantId })
      .orderBy('m.createdAt', 'DESC')
      .skip(query.offset)
      .take(query.limit);

    if (query.storeId) {
      qb.andWhere('m.storeId = :storeId', { storeId: query.storeId });
    }

    if (query.productVariantId) {
      qb.andWhere('m.productVariantId = :variantId', { variantId: query.productVariantId });
    }

    if (query.type) {
      qb.andWhere('m.type = :type', { type: query.type });
    }

    if (query.startDate) {
      qb.andWhere('m.createdAt >= :startDate', { startDate: new Date(query.startDate) });
    }

    if (query.endDate) {
      qb.andWhere('m.createdAt <= :endDate', { endDate: new Date(query.endDate) });
    }

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + data.length < total,
      },
    };
  }

  // ---- Toplu stok girişi ----

  async bulkReceiveStock(
    dto: BulkReceiveStockDto,
    manager?: EntityManager,
  ): Promise<InventoryMovement[]> {
    return this.runInTransaction(manager, async (txManager) => {
      const results: InventoryMovement[] = [];

      for (const item of dto.items) {
        const movement = await this.receiveStock(item, txManager);
        results.push(movement);
      }

      return results;
    });
  }

  // ---- Düşük stok uyarıları ----

  async getLowStockAlerts(
    query: LowStockQueryDto,
    manager?: EntityManager,
  ): Promise<{
    storeId: string;
    storeName: string;
    productVariantId: string;
    variantName: string;
    quantity: number;
  }[]> {
    const tenantId = this.getTenantIdOrThrow();
    const repo = this.getStockSummaryRepository(manager);

    const qb = repo
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.store', 'store')
      .innerJoinAndSelect('s.productVariant', 'variant')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s.quantity <= :threshold', { threshold: query.threshold })
      .orderBy('s.quantity', 'ASC');

    if (query.storeId) {
      qb.andWhere('s.storeId = :storeId', { storeId: query.storeId });
    }

    const rows = await qb.getMany();

    return rows.map((r) => ({
      storeId: r.store.id,
      storeName: r.store.name,
      productVariantId: r.productVariant.id,
      variantName: r.productVariant.name,
      quantity: Number(r.quantity),
    }));
  }
}
