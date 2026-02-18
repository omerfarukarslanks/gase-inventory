import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { InventoryMovement, MovementType } from './inventory-movement.entity';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { AppContextService } from '../common/context/app-context.service';
import { Store } from 'src/store/store.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { SellStockDto } from './dto/sell-stock.dto';
import { AdjustStockDto, AdjustStockItemDto } from './dto/adjust-stock.dto';
import { InventoryErrors } from 'src/common/errors/inventory.errors';
import { StoreVariantStock } from './store-variant-stock.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import { ListMovementsQueryDto, PaginatedMovementsResponse } from './dto/list-movements.dto';
import { BulkReceiveStockDto } from './dto/bulk-receive-stock.dto';
import { LowStockQueryDto } from './dto/low-stock-query.dto';
import { StoreProductPrice } from 'src/pricing/store-product-price.entity';
import { OptionalPaginationQueryDto } from './dto/optional-pagination.dto';
import { StockSummaryDto } from './dto/stock-summary.dto';

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
        isActiveStore: true,
        isActive: true,
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

    const delta = Number(quantityDelta);
    if (!Number.isFinite(delta)) {
      throw new BadRequestException(InventoryErrors.INVALID_QUANTITY);
    }

    summary.quantity = Number(summary.quantity) + delta;
    summary.updatedById = this.getUserIdOrThrow();

    return repo.save(summary);
  }

  private async ensureStoreProductVariantsScopeForStockAction(
    tenantId: string,
    storeId: string,
    variantId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = this.getStockSummaryRepository(manager);
    const userId = this.getUserIdOrThrow();
    const targetVariant = await this.getTenantVariantOrThrow(variantId, manager);

    const variantRows = await this.getVariantRepo(manager)
      .createQueryBuilder('variant')
      .innerJoin('variant.product', 'product')
      .select('variant.id', 'id')
      .where('product.id = :productId', { productId: targetVariant.product.id })
      .andWhere('product.tenantId = :tenantId', { tenantId })
      .getRawMany<{ id: string }>();

    const productVariantIds = variantRows.map((row) => row.id);
    if (productVariantIds.length === 0) {
      return;
    }

    const existingRows = await repo.find({
      where: {
        tenant: { id: tenantId },
        store: { id: storeId },
        productVariant: { id: In(productVariantIds) },
      },
      relations: ['productVariant'],
    });

    const existingByVariantId = new Map<string, StoreVariantStock>();
    for (const row of existingRows) {
      if (row.productVariant?.id) {
        existingByVariantId.set(row.productVariant.id, row);
      }
    }

    const hasAnyActiveStoreLink = existingRows.some((row) => row.isActiveStore === true);
    const rowsToSave: StoreVariantStock[] = [];

    for (const productVariantId of productVariantIds) {
      let row = existingByVariantId.get(productVariantId);
      if (!row) {
        row = repo.create({
          tenant: { id: tenantId } as Tenant,
          store: { id: storeId } as Store,
          productVariant: { id: productVariantId } as ProductVariant,
          isActiveStore: true,
          isActive: false,
          quantity: 0,
          createdById: userId,
          updatedById: userId,
        });
        existingByVariantId.set(productVariantId, row);
        rowsToSave.push(row);
        continue;
      }

      let changed = false;
      if (!row.isActiveStore) {
        row.isActiveStore = true;
        changed = true;
      }
      if (!hasAnyActiveStoreLink && row.isActive) {
        row.isActive = false;
        changed = true;
      }

      if (changed) {
        row.updatedById = userId;
        rowsToSave.push(row);
      }
    }

    const targetRow = existingByVariantId.get(variantId);
    if (targetRow) {
      let changed = false;
      if (!targetRow.isActiveStore) {
        targetRow.isActiveStore = true;
        changed = true;
      }
      if (!targetRow.isActive) {
        targetRow.isActive = true;
        changed = true;
      }

      if (changed) {
        targetRow.updatedById = userId;
        if (!rowsToSave.includes(targetRow)) {
          rowsToSave.push(targetRow);
        }
      }
    }

    if (rowsToSave.length > 0) {
      await repo.save(rowsToSave);
    }
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
      const movementMeta = {
        ...(params.meta ?? {}),
        ...(params.reference ? { reference: params.reference } : {}),
      };

      const repo = this.getMovementRepo(txManager);

      const movement = repo.create({
        tenant: { id: params.tenantId } as any,
        store: { id: params.store.id } as any,
        productVariant: { id: params.variant.id } as any,
        type: params.type,
        quantity: params.quantity,
        meta: Object.keys(movementMeta).length > 0 ? movementMeta : undefined,

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
    const quantity = Number(params.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
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
      quantity, // pozitif

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
    return this.runInTransaction(manager, async (txManager) => {
      if (dto.quantity <= 0) {
        throw new BadRequestException(InventoryErrors.INVALID_QUANTITY);
      }

      const tenantId = this.getTenantIdOrThrow();
      const store = await this.getTenantStoreOrThrow(dto.storeId, txManager);
      const variant = await this.getTenantVariantOrThrow(dto.productVariantId, txManager);

      await this.ensureStoreProductVariantsScopeForStockAction(
        tenantId,
        store.id,
        variant.id,
        txManager,
      );

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
        txManager,
      );
    });
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

  private async adjustStockSingle(
    dto: AdjustStockItemDto,
    manager?: EntityManager,
  ): Promise<{
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

  /**
   * Tek endpoint ile stok düzeltme:
   * - items gönderilirse mağaza bazlı toplu işlem
   * - items yoksa tekil/toplu-store senaryosu
   */
  async adjustStock(
    dto: AdjustStockDto,
    manager?: EntityManager,
  ): Promise<
    | {
      movement: InventoryMovement | null;
      previousQuantity: number;
      newQuantity: number;
      difference: number;
    }
    | {
      movement: InventoryMovement | null;
      previousQuantity: number;
      newQuantity: number;
      difference: number;
    }[]
  > {
    return this.runInTransaction(manager, async (txManager) => {
      const tenantId = this.getTenantIdOrThrow();
      const hasItems = Array.isArray(dto.items) && dto.items.length > 0;

      if (hasItems) {
        const results: {
          movement: InventoryMovement | null;
          previousQuantity: number;
          newQuantity: number;
          difference: number;
        }[] = [];

        for (const item of dto.items!) {
          await this.ensureStoreProductVariantsScopeForStockAction(
            tenantId,
            item.storeId,
            item.productVariantId,
            txManager,
          );
          const result = await this.adjustStockSingle(item, txManager);
          results.push(result);
        }

        return results;
      }

      if (!dto.productVariantId || dto.newQuantity === undefined) {
        throw new BadRequestException(
          'items gonderilmiyorsa productVariantId ve newQuantity zorunludur.',
        );
      }

      let targetStoreIds: string[] = [];

      if (dto.applyToAllStores === true) {
        const stores = await this.getStoreRepo(txManager).find({
          where: {
            tenant: { id: tenantId },
            isActive: true,
          },
          select: { id: true },
        });

        if (stores.length === 0) {
          throw new NotFoundException(InventoryErrors.STORE_NOT_FOUND_FOR_TENANT);
        }

        targetStoreIds = stores.map((store) => store.id);
      } else if (dto.storeId) {
        await this.getTenantStoreOrThrow(dto.storeId, txManager);
        targetStoreIds = [dto.storeId];
      } else {
        const contextStoreId = this.appContext.getStoreId();
        if (!contextStoreId) {
          throw new BadRequestException(
            'storeId yoksa token icinde storeId olmali veya applyToAllStores=true gonderilmelidir.',
          );
        }
        targetStoreIds = [contextStoreId];
      }

      const results: {
        movement: InventoryMovement | null;
        previousQuantity: number;
        newQuantity: number;
        difference: number;
      }[] = [];

      for (const storeId of targetStoreIds) {
        await this.ensureStoreProductVariantsScopeForStockAction(
          tenantId,
          storeId,
          dto.productVariantId,
          txManager,
        );
        const result = await this.adjustStockSingle(
          {
            storeId,
            productVariantId: dto.productVariantId,
            newQuantity: dto.newQuantity,
            reference: dto.reference,
            meta: dto.meta,
          },
          txManager,
        );
        results.push(result);
      }

      return results.length === 1 ? results[0] : results;
    });
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
        unitPrice: number | null;
        purchasePrice: number | null;
        currency: string;
        taxPercent: number | null;
        discountPercent: number | null;
        discountAmount: number | null;
        taxAmount: number | null;
        lineTotal: number | null;
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
      .addSelect('COALESCE(spp."salePrice", variant."defaultSalePrice")', 'unitPrice')
      .addSelect('COALESCE(spp."purchasePrice", variant."defaultPurchasePrice")', 'purchasePrice')
      .addSelect('COALESCE(spp."currency", variant."defaultCurrency", \'TRY\')', 'currency')
      .addSelect('COALESCE(spp."taxPercent", variant."defaultTaxPercent")', 'taxPercent')
      .addSelect('spp."discountPercent"', 'discountPercent')
      .addSelect('spp."discountAmount"', 'discountAmount')
      .addSelect('spp."taxAmount"', 'taxAmount')
      .addSelect('spp."lineTotal"', 'lineTotal')
      .addSelect('CASE WHEN spp."id" IS NULL THEN false ELSE true END', 'isStoreOverride')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s."isActiveStore" = true')
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
        unitPrice: string | null;
        purchasePrice: string | null;
        currency: string | null;
        taxPercent: string | null;
        discountPercent: string | null;
        discountAmount: string | null;
        taxAmount: string | null;
        lineTotal: string | null;
        isStoreOverride: boolean | string;
      }>();

    const items = rows.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      productVariantId: row.productVariantId,
      variantName: row.variantName,
      variantCode: row.variantCode,
      quantity: Number(row.quantity),
      unitPrice: row.unitPrice !== null ? Number(row.unitPrice) : null,
      purchasePrice: row.purchasePrice !== null ? Number(row.purchasePrice) : null,
      currency: row.currency ?? 'TRY',
      taxPercent: row.taxPercent !== null ? Number(row.taxPercent) : null,
      discountPercent: row.discountPercent !== null ? Number(row.discountPercent) : null,
      discountAmount: row.discountAmount !== null ? Number(row.discountAmount) : null,
      taxAmount: row.taxAmount !== null ? Number(row.taxAmount) : null,
      lineTotal: row.lineTotal !== null ? Number(row.lineTotal) : null,
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
  async getStockSummary(
    body?: StockSummaryDto,
    manager?: EntityManager,
  ): Promise<
    {
      data: {
        productId: string;
        productName: string;
        totalQuantity: number;
        variants: {
          productVariantId: string;
          variantName: string;
          variantCode: string;
          totalQuantity: number;
          stores: {
            storeId: string;
            storeName: string;
            quantity: number;
            totalQuantity: number;
            unitPrice: number | null;
            purchasePrice: number | null;
            currency: string;
            taxPercent: number | null;
            discountPercent: number | null;
            discountAmount: number | null;
            taxAmount: number | null;
            lineTotal: number | null;
            isStoreOverride: boolean;
          }[];
        }[];
      }[];
      meta?: {
        total: number;
        limit: number;
        page: number;
        totalPages: number;
      };
      totalQuantity: number;
    }
  > {
    const tenantId = this.getTenantIdOrThrow();
    const contextStoreId = this.appContext.getStoreId();
    const search = body?.search?.trim();
    let requestedStoreIds: string[] = [];

    if (contextStoreId) {
      await this.getTenantStoreOrThrow(contextStoreId, manager);
      requestedStoreIds = [contextStoreId];
    } else {
      requestedStoreIds = Array.from(
        new Set(
          (body?.storeIds ?? [])
            .map((id) => id?.trim())
            .filter((id): id is string => Boolean(id)),
        ),
      );
    }

    if (requestedStoreIds.length) {
      const stores = await this.getStoreRepo(manager).find({
        where: {
          id: In(requestedStoreIds),
          tenant: { id: tenantId },
        },
        select: { id: true },
      });

      if (stores.length !== requestedStoreIds.length) {
        throw new NotFoundException(InventoryErrors.STORE_NOT_FOUND_FOR_TENANT);
      }
    }

    const repo = this.getStockSummaryRepository(manager);
    const sppTableName = this.storeProductPriceRepo.metadata.tableName;

    const qb = repo
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
      .addSelect('COALESCE(spp."salePrice", variant."defaultSalePrice")', 'unitPrice')
      .addSelect('COALESCE(spp."purchasePrice", variant."defaultPurchasePrice")', 'purchasePrice')
      .addSelect('COALESCE(spp."currency", variant."defaultCurrency", \'TRY\')', 'currency')
      .addSelect('COALESCE(spp."taxPercent", variant."defaultTaxPercent")', 'taxPercent')
      .addSelect('spp."discountPercent"', 'discountPercent')
      .addSelect('spp."discountAmount"', 'discountAmount')
      .addSelect('spp."taxAmount"', 'taxAmount')
      .addSelect('spp."lineTotal"', 'lineTotal')
      .addSelect('CASE WHEN spp."id" IS NULL THEN false ELSE true END', 'isStoreOverride')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s."isActiveStore" = true');

    if (requestedStoreIds.length) {
      qb.andWhere('s.storeId IN (:...storeIds)', { storeIds: requestedStoreIds });
    }

    if (search) {
      qb.andWhere(
        '(product.name ILIKE :search OR variant.name ILIKE :search OR variant.code ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const rows = await qb
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
        unitPrice: string | null;
        purchasePrice: string | null;
        currency: string | null;
        taxPercent: string | null;
        discountPercent: string | null;
        discountAmount: string | null;
        taxAmount: string | null;
        lineTotal: string | null;
        isStoreOverride: boolean | string;
      }>();

    const byProduct = new Map<
      string,
      {
        productId: string;
        productName: string;
        totalQuantity: number;
        variants: Array<{
          productVariantId: string;
          variantName: string;
          variantCode: string;
          totalQuantity: number;
          stores: {
            storeId: string;
            storeName: string;
            quantity: number;
            totalQuantity: number;
            unitPrice: number | null;
            purchasePrice: number | null;
            currency: string;
            taxPercent: number | null;
            discountPercent: number | null;
            discountAmount: number | null;
            taxAmount: number | null;
            lineTotal: number | null;
            isStoreOverride: boolean;
          }[];
        }>;
      }
    >();

    for (const row of rows) {
      const productKey = row.productId;
      const quantity = Number(row.quantity);
      if (!byProduct.has(productKey)) {
        byProduct.set(productKey, {
          productId: row.productId,
          productName: row.productName,
          totalQuantity: 0,
          variants: [],
        });
      }

      const productItem = byProduct.get(productKey)!;
      productItem.totalQuantity += quantity;

      let variantItem = productItem.variants.find(
        (v) => v.productVariantId === row.productVariantId,
      );

      if (!variantItem) {
        variantItem = {
          productVariantId: row.productVariantId,
          variantName: row.variantName,
          variantCode: row.variantCode,
          totalQuantity: 0,
          stores: [],
        };
        productItem.variants.push(variantItem);
      }

      variantItem.totalQuantity += quantity;
      variantItem.stores.push({
        storeId: row.storeId,
        storeName: row.storeName,
        quantity,
        totalQuantity: quantity,
        unitPrice: row.unitPrice !== null ? Number(row.unitPrice) : null,
        purchasePrice: row.purchasePrice !== null ? Number(row.purchasePrice) : null,
        currency: row.currency ?? 'TRY',
        taxPercent: row.taxPercent !== null ? Number(row.taxPercent) : null,
        discountPercent: row.discountPercent !== null ? Number(row.discountPercent) : null,
        discountAmount: row.discountAmount !== null ? Number(row.discountAmount) : null,
        taxAmount: row.taxAmount !== null ? Number(row.taxAmount) : null,
        lineTotal: row.lineTotal !== null ? Number(row.lineTotal) : null,
        isStoreOverride: row.isStoreOverride === true || row.isStoreOverride === 'true',
      });
    }

    const items = Array.from(byProduct.values());
    const totalQuantity = items.reduce((sum, item) => sum + item.totalQuantity, 0);

    const total = items.length;
    const hasPagination = body?.hasPagination === true;

    if (!hasPagination) {
      return {
        data: items,
        totalQuantity,
      };
    }

    const page = Math.max(1, Math.trunc(body?.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.trunc(body?.limit ?? 10)));
    const skip = (page - 1) * limit;
    const data = items.slice(skip, skip + limit);

    return {
      data,
      meta: {
        total,
        limit,
        page,
        totalPages: Math.ceil(total / limit),
      },
      totalQuantity,
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
    query?: OptionalPaginationQueryDto,
    manager?: EntityManager,
  ): Promise<
    {
      product: {
        productId: string;
        productName: string;
        totalQuantity: number;
        variants: {
          productVariantId: string;
          variantName: string;
          variantCode: string;
          totalQuantity: number;
          stores: {
            storeId: string;
            storeName: string;
            quantity: number;
            totalQuantity: number;
          }[];
        }[];
      };
      data: {
        storeId: string;
        storeName: string;
        quantity: number;
        totalQuantity: number;
      }[];
      meta: {
        total: number;
        limit: number;
        page: number;
        totalPages: number;
      };
      totalQuantity: number;
    }
  > {
    const tenantId = this.getTenantIdOrThrow();

    const variant = await this.getTenantVariantOrThrow(productVariantId, manager);

    const repo = this.getStockSummaryRepository(manager);

    const rows = await repo
      .createQueryBuilder('s')
      .innerJoin('s.store', 'store')
      .select('s.storeId', 'storeId')
      .addSelect('store.name', 'storeName')
      .addSelect('s.quantity', 'quantity')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s."isActiveStore" = true')
      .andWhere('s.productVariantId = :variantId', { variantId: productVariantId })
      .orderBy('store.name', 'ASC')
      .getRawMany<{ storeId: string; storeName: string; quantity: string }>();

    const items = rows.map((r) => ({
      storeId: r.storeId,
      storeName: r.storeName,
      quantity: Number(r.quantity),
      totalQuantity: Number(r.quantity),
    }));

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const productPayload = {
      productId: variant.product.id,
      productName: variant.product.name,
      totalQuantity,
      variants: [
        {
          productVariantId: variant.id,
          variantName: variant.name,
          variantCode: variant.code,
          totalQuantity,
          stores: items,
        },
      ],
    };

    const total = items.length;
    const parsedPage = query?.page !== undefined ? Number(query.page) : undefined;
    const parsedLimit = query?.limit !== undefined ? Number(query.limit) : undefined;
    const hasPagination =
      Number.isFinite(parsedPage) || Number.isFinite(parsedLimit);
    const page = hasPagination
      ? Math.max(1, Math.trunc(parsedPage ?? 1))
      : 1;
    const limit = hasPagination
      ? Math.min(100, Math.max(1, Math.trunc(parsedLimit ?? 10)))
      : total;
    const skip = hasPagination ? (page - 1) * limit : 0;
    const data = hasPagination ? items.slice(skip, skip + limit) : items;
    const stores = hasPagination ? items.slice(skip, skip + limit) : items;

    return {
      product: {
        ...productPayload,
        variants: [
          {
            ...productPayload.variants[0],
            stores,
          },
        ],
      },
      data,
      meta: {
        total,
        limit,
        page,
        totalPages: hasPagination ? Math.ceil(total / limit) : (total > 0 ? 1 : 0),
      },
      totalQuantity,
    };
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
      .andWhere('s."isActiveStore" = true')
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
