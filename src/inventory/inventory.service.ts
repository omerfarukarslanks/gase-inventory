import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';

import { InventoryMovement, MovementType } from './inventory-movement.entity';
import { ReceiveStockDto, ReceiveStockItemDto } from './dto/receive-stock.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { AppContextService } from '../common/context/app-context.service';
import { Store } from 'src/store/store.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { SellStockDto } from './dto/sell-stock.dto';
import { AdjustStockDto, AdjustStockItemDto } from './dto/adjust-stock.dto';
import { InventoryErrors } from 'src/common/errors/inventory.errors';
import { StoreVariantStock } from './store-variant-stock.entity';
import { StockBalance } from './stock-balance.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import {
  InventoryMovementHistoryItemResponse,
  ListMovementsQueryDto,
  PaginatedMovementsResponse,
} from './dto/list-movements.dto';
import { LowStockQueryDto } from './dto/low-stock-query.dto';
import { StoreProductPrice } from 'src/pricing/store-product-price.entity';
import { OptionalPaginationQueryDto } from './dto/optional-pagination.dto';
import { StockSummaryDto } from './dto/stock-summary.dto';
import { calculateLineAmounts } from 'src/pricing/utils/price-calculator';
import { Supplier } from 'src/supplier/supplier.entity';
import { Location } from 'src/warehouse/entities/location.entity';

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
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(StockBalance)
    private readonly stockBalanceRepo: Repository<StockBalance>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
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

  private getLocationRepo(manager?: EntityManager): Repository<Location> {
    return manager ? manager.getRepository(Location) : this.locationRepo;
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

  private async getTenantSupplierOrThrow(supplierId: string, manager?: EntityManager): Promise<Supplier> {
    const tenantId = this.getTenantIdOrThrow();
    const repo = manager ? manager.getRepository(Supplier) : this.supplierRepo;
    const supplier = await repo.findOne({
      where: { id: supplierId, tenant: { id: tenantId } },
    });
    if (!supplier) {
      throw new NotFoundException({
        code: 'INVENTORY_SUPPLIER_NOT_FOUND',
        message: 'Bu kuruma ait tedarikçi bulunamadı.',
      });
    }
    return supplier;
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

  /**
   * Lot × lokasyon bazlı granüler bakiyeyi günceller.
   * Lot veya lokasyon bilgisi olan hareketler için createMovement() tarafından çağrılır.
   */
  private async applyMovementToStockBalance(
    params: {
      tenantId: string;
      storeId: string;
      productVariantId: string;
      quantity: number; // signed
      lotNumber?: string;
      expiryDate?: Date;
      locationId?: string;
    },
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(StockBalance)
      : this.stockBalanceRepo;

    // Mevcut satırı bul (lot + location kombinasyonuna göre)
    let balance = await repo.findOne({
      where: {
        tenantId: params.tenantId,
        storeId: params.storeId,
        productVariantId: params.productVariantId,
        ...(params.lotNumber !== undefined ? { lotNumber: params.lotNumber } : { lotNumber: undefined }),
        ...(params.locationId !== undefined ? { locationId: params.locationId } : { locationId: undefined }),
      },
    });

    if (!balance) {
      balance = repo.create({
        tenantId: params.tenantId,
        storeId: params.storeId,
        productVariantId: params.productVariantId,
        lotNumber: params.lotNumber,
        expiryDate: params.expiryDate,
        locationId: params.locationId,
        quantity: 0,
      });
    }

    const delta = Number(params.quantity);
    if (!Number.isFinite(delta)) {
      throw new BadRequestException(InventoryErrors.INVALID_QUANTITY);
    }

    balance.quantity = Number(balance.quantity) + delta;
    await repo.save(balance);
  }

  /**
   * Lot/lokasyon bazlı stok bakiyelerini listeler.
   * Tenant izolasyonu zorunludur.
   */
  async getStockBalances(query: {
    storeId?: string;
    productVariantId?: string;
    lotNumber?: string;
    locationId?: string;
  }): Promise<StockBalance[]> {
    const tenantId = this.getTenantIdOrThrow();
    const qb = this.stockBalanceRepo
      .createQueryBuilder('sb')
      .where('sb.tenantId = :tenantId', { tenantId })
      .orderBy('sb.createdAt', 'ASC');

    if (query.storeId) {
      qb.andWhere('sb.storeId = :storeId', { storeId: query.storeId });
    }
    if (query.productVariantId) {
      qb.andWhere('sb.productVariantId = :productVariantId', {
        productVariantId: query.productVariantId,
      });
    }
    if (query.lotNumber) {
      qb.andWhere('sb.lotNumber = :lotNumber', { lotNumber: query.lotNumber });
    }
    if (query.locationId) {
      qb.andWhere('sb.locationId = :locationId', { locationId: query.locationId });
    }

    return qb.getMany();
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
      supplierId?: string;

      // Lot / lokasyon / seri (Faz 2)
      lotNumber?: string;
      expiryDate?: Date;
      locationId?: string;
      serialNumber?: string;
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
        supplierId: params.supplierId,

        lotNumber: params.lotNumber,
        expiryDate: params.expiryDate,
        locationId: params.locationId,
        serialNumber: params.serialNumber,

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

      // Lot veya lokasyon bilgisi varsa granüler bakiyeyi de güncelle
      if (params.lotNumber || params.locationId) {
        await this.applyMovementToStockBalance(
          {
            tenantId: params.tenantId,
            storeId: params.store.id,
            productVariantId: params.variant.id,
            quantity: params.quantity,
            lotNumber: params.lotNumber,
            expiryDate: params.expiryDate,
            locationId: params.locationId,
          },
          txManager,
        );
      }

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
   * Tenant'a ait bir ürünün tüm varyantlarını döner.
   * Hiç varyant yoksa NotFoundException fırlatır.
   */
  private async getVariantsByProductId(
    productId: string,
    manager?: EntityManager,
  ): Promise<ProductVariant[]> {
    const tenantId = this.getTenantIdOrThrow();
    const variants = await this.getVariantRepo(manager)
      .createQueryBuilder('v')
      .innerJoin('v.product', 'p')
      .where('p.id = :productId', { productId })
      .andWhere('p.tenantId = :tenantId', { tenantId })
      .getMany();

    if (variants.length === 0) {
      throw new NotFoundException(InventoryErrors.VARIANT_NOT_FOUND_FOR_TENANT);
    }

    return variants;
  }

  /**
   * Storeları çözer:
   * - applyToAllStores=true → tenant'ın tüm aktif mağazaları
   * - storeId verilirse → o mağaza
   * - hiçbiri yoksa → JWT context'teki mağaza
   */
  private async resolveTargetStoreIds(
    dto: { storeId?: string; applyToAllStores?: boolean },
    txManager: EntityManager,
  ): Promise<string[]> {
    const tenantId = this.getTenantIdOrThrow();

    if (dto.applyToAllStores === true) {
      const stores = await this.getStoreRepo(txManager).find({
        where: { tenant: { id: tenantId }, isActive: true },
        select: { id: true },
      });
      if (stores.length === 0) {
        throw new NotFoundException(InventoryErrors.STORE_NOT_FOUND_FOR_TENANT);
      }
      return stores.map((s) => s.id);
    }

    if (dto.storeId) {
      await this.getTenantStoreOrThrow(dto.storeId, txManager);
      return [dto.storeId];
    }

    const contextStoreId = this.appContext.getStoreId();
    if (!contextStoreId) {
      throw new BadRequestException(
        'storeId yoksa token icinde storeId olmali veya applyToAllStores=true gonderilmelidir.',
      );
    }
    return [contextStoreId];
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

  /**
   * Sayım düzeltmesi — signed quantity delta (+ arttır, - azalt).
   * Warehouse count session kapatma akışında çağrılır.
   * diff = 0 ise hareket oluşturulmaz.
   */
  async createCountAdjustment(
    params: {
      storeId: string;
      productVariantId: string;
      quantityDelta: number; // signed
      reference?: string;
      meta?: Record<string, any>;
      lotNumber?: string;
      locationId?: string;
    },
    manager?: EntityManager,
  ): Promise<InventoryMovement | null> {
    const delta = Number(params.quantityDelta);
    if (!Number.isFinite(delta) || delta === 0) return null;

    const tenantId = this.getTenantIdOrThrow();
    const store = await this.getTenantStoreOrThrow(params.storeId, manager);
    const variant = await this.getTenantVariantOrThrow(params.productVariantId, manager);

    return this.createMovement(
      {
        tenantId,
        store,
        variant,
        type: MovementType.ADJUSTMENT,
        quantity: delta,
        reference: params.reference,
        meta: params.meta,
        lotNumber: params.lotNumber,
        locationId: params.locationId,
      },
      manager,
    );
  }

  // ---- Use-case: tedarik / stok girişi ----

  /**
   * Stok girişi — birleşik endpoint:
   * - items[] gönderilirse toplu giriş (her item ayrı hareket)
   * - items yoksa tekil giriş (storeId + productVariantId + quantity zorunlu)
   */
  async receiveStock(
    dto: ReceiveStockDto,
    manager?: EntityManager,
  ): Promise<InventoryMovement | InventoryMovement[]> {
    return this.runInTransaction(manager, async (txManager) => {
      // Senaryo 2: Çoklu items[]
      if (Array.isArray(dto.items) && dto.items.length > 0) {
        const results: InventoryMovement[] = [];
        for (const item of dto.items) {
          results.push(await this.receiveStockItem(item, txManager));
        }
        return results;
      }

      // Ortak kontrol: storeId ve quantity zorunlu (hem Senaryo 1 hem 3 için)
      if (!dto.storeId || dto.quantity === undefined) {
        throw new BadRequestException(
          'items gönderilmiyorsa storeId ve quantity zorunludur.',
        );
      }

      // Senaryo 3: productId — ürünün tüm varyantları
      if (dto.productId) {
        const variants = await this.getVariantsByProductId(dto.productId, txManager);
        const results: InventoryMovement[] = [];
        for (const variant of variants) {
          results.push(await this.receiveStockItem(
            {
              storeId: dto.storeId,
              productVariantId: variant.id,
              quantity: dto.quantity,
              supplierId: dto.supplierId,
              reference: dto.reference,
              meta: dto.meta,
              lotNumber: dto.lotNumber,
              expiryDate: dto.expiryDate,
              locationId: dto.locationId,
              serialNumber: dto.serialNumber,
            },
            txManager,
          ));
        }
        return results;
      }

      // Senaryo 1: Tekli productVariantId
      if (!dto.productVariantId) {
        throw new BadRequestException(
          'items gönderilmiyorsa productVariantId veya productId zorunludur.',
        );
      }

      return this.receiveStockItem(
        {
          storeId: dto.storeId,
          productVariantId: dto.productVariantId,
          quantity: dto.quantity,
          supplierId: dto.supplierId,
          reference: dto.reference,
          meta: dto.meta,
          lotNumber: dto.lotNumber,
          expiryDate: dto.expiryDate,
          locationId: dto.locationId,
          serialNumber: dto.serialNumber,
        },
        txManager,
      );
    });
  }

  private async receiveStockItem(
    item: ReceiveStockItemDto,
    manager?: EntityManager,
  ): Promise<InventoryMovement> {
    return this.runInTransaction(manager, async (txManager) => {
      if (item.quantity <= 0) {
        throw new BadRequestException(InventoryErrors.INVALID_QUANTITY);
      }

      const tenantId = this.getTenantIdOrThrow();
      const store = await this.getTenantStoreOrThrow(item.storeId, txManager);
      const variant = await this.getTenantVariantOrThrow(item.productVariantId, txManager);

      // supplierId verilmişse tenant'a ait olduğunu doğrula
      if (item.supplierId) {
        await this.getTenantSupplierOrThrow(item.supplierId, txManager);
      }

      await this.ensureStoreProductVariantsScopeForStockAction(
        tenantId,
        store.id,
        variant.id,
        txManager,
      );

      return this.createMovement(
        {
          tenantId,
          store,
          variant,
          type: MovementType.IN,
          quantity: item.quantity,
          reference: item.reference,
          meta: item.meta,
          supplierId: item.supplierId,
          lotNumber: item.lotNumber,
          expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
          locationId: item.locationId,
          serialNumber: item.serialNumber,
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

      // lineTotal her zaman sunucu tarafında hesaplanır
      const sellDiscountPercent = dto.discountPercent ?? null;
      const sellDiscountAmount = sellDiscountPercent != null ? null : (dto.discountAmount ?? null);
      const sellTaxPercent = dto.taxPercent ?? null;
      const sellTaxAmount = sellTaxPercent != null ? null : (dto.taxAmount ?? null);
      const { lineTotal } = calculateLineAmounts({
        quantity: dto.quantity,
        unitPrice: dto.unitPrice ?? 0,
        discountPercent: sellDiscountPercent,
        discountAmount: sellDiscountAmount,
        taxPercent: sellTaxPercent,
        taxAmount: sellTaxAmount,
      });

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
          discountPercent: sellDiscountPercent ?? undefined,
          discountAmount: sellDiscountAmount ?? undefined,
          taxPercent: sellTaxPercent ?? undefined,
          taxAmount: sellTaxAmount ?? undefined,
          lineTotal,
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
   * Stok düzeltme — 3 senaryo:
   * 1) Tekli: productVariantId + newQuantity
   * 2) Çoklu: items[] (her öğede storeId + productVariantId + newQuantity)
   * 3) Ürün bazlı: productId + newQuantity (ürünün tüm varyantları)
   */
  async adjustStock(
    dto: AdjustStockDto,
    manager?: EntityManager,
  ): Promise<
    { movement: InventoryMovement | null; previousQuantity: number; newQuantity: number; difference: number } |
    { movement: InventoryMovement | null; previousQuantity: number; newQuantity: number; difference: number }[]
  > {
    type R = { movement: InventoryMovement | null; previousQuantity: number; newQuantity: number; difference: number };

    return this.runInTransaction(manager, async (txManager) => {
      const tenantId = this.getTenantIdOrThrow();
      const hasItems = Array.isArray(dto.items) && dto.items.length > 0;
      const hasVariantId = Boolean(dto.productVariantId);
      const hasProductId = Boolean(dto.productId);

      if ([hasItems, hasVariantId, hasProductId].filter(Boolean).length > 1) {
        throw new BadRequestException(
          'items, productVariantId ve productId den yalnizca biri gonderilebilir.',
        );
      }

      // Senaryo 2: Çoklu items[]
      if (hasItems) {
        const results: R[] = [];
        for (const item of dto.items!) {
          await this.ensureStoreProductVariantsScopeForStockAction(
            tenantId, item.storeId, item.productVariantId, txManager,
          );
          results.push(await this.adjustStockSingle(item, txManager));
        }
        return results;
      }

      if (dto.newQuantity === undefined) {
        throw new BadRequestException('items gonderilmiyorsa newQuantity zorunludur.');
      }

      const targetStoreIds = await this.resolveTargetStoreIds(dto, txManager);
      const results: R[] = [];

      // Senaryo 3: productId — ürünün tüm varyantları
      if (hasProductId) {
        const variants = await this.getVariantsByProductId(dto.productId!, txManager);
        for (const variant of variants) {
          for (const storeId of targetStoreIds) {
            await this.ensureStoreProductVariantsScopeForStockAction(
              tenantId, storeId, variant.id, txManager,
            );
            results.push(await this.adjustStockSingle(
              { storeId, productVariantId: variant.id, newQuantity: dto.newQuantity!, reference: dto.reference, meta: dto.meta },
              txManager,
            ));
          }
        }
        return results;
      }

      // Senaryo 1: Tekli productVariantId
      if (!dto.productVariantId) {
        throw new BadRequestException('items, productVariantId veya productId gonderilmelidir.');
      }

      for (const storeId of targetStoreIds) {
        await this.ensureStoreProductVariantsScopeForStockAction(
          tenantId, storeId, dto.productVariantId, txManager,
        );
        results.push(await this.adjustStockSingle(
          { storeId, productVariantId: dto.productVariantId, newQuantity: dto.newQuantity, reference: dto.reference, meta: dto.meta },
          txManager,
        ));
      }

      return results.length === 1 ? results[0] : results;
    });
  }


  // ---- Use-case: mağazalar arası transfer ----

  /**
   * Tek varyant için transfer hareketi çifti (TRANSFER_OUT + TRANSFER_IN) oluşturur.
   * Stok yeterliliği kontrol edilir; yetersizse BadRequestException fırlatılır.
   */
  private async transferStockSingle(
    fromStore: Store,
    toStore: Store,
    variant: ProductVariant,
    quantity: number,
    reference: string | undefined,
    meta: Record<string, any> | undefined,
    txManager: EntityManager,
  ): Promise<InventoryMovement[]> {
    const tenantId = this.getTenantIdOrThrow();

    const currentFromStock = await this.getLockedStockForVariantInStore(
      txManager,
      fromStore.id,
      variant.id,
    );

    if (currentFromStock < quantity) {
      this.logger.warn('Insufficient stock for transfer', {
        tenantId,
        fromStoreId: fromStore.id,
        toStoreId: toStore.id,
        variantId: variant.id,
        currentFromStock,
        requested: quantity,
      });
      throw new BadRequestException({
        ...InventoryErrors.NOT_ENOUGH_STOCK,
        details: { currentFromStock, requested: quantity },
      });
    }

    const outMovement = await this.createMovement(
      { tenantId, store: fromStore, variant, type: MovementType.TRANSFER_OUT, quantity: -quantity, reference, meta },
      txManager,
    );
    const inMovement = await this.createMovement(
      { tenantId, store: toStore, variant, type: MovementType.TRANSFER_IN, quantity, reference, meta },
      txManager,
    );

    return [outMovement, inMovement];
  }

  /**
   * Mağazalar arası stok transferi — 3 senaryo:
   * 1) Tekli: productVariantId + quantity
   * 2) Çoklu: items[] (her satırda productVariantId + quantity; ortak fromStoreId/toStoreId)
   * 3) Ürün bazlı: productId (+ opsiyonel quantity; verilmezse mevcut stok tamamı transfer edilir)
   */
  async transferStock(dto: TransferStockDto, manager?: EntityManager): Promise<InventoryMovement[]> {
    return this.runInTransaction(manager, async (txManager) => {
      if (dto.fromStoreId === dto.toStoreId) {
        throw new BadRequestException(InventoryErrors.SAME_SOURCE_AND_TARGET_STORE);
      }

      const fromStore = await this.getTenantStoreOrThrow(dto.fromStoreId, txManager);
      const toStore = await this.getTenantStoreOrThrow(dto.toStoreId, txManager);

      const hasItems = Array.isArray(dto.items) && dto.items.length > 0;
      const hasVariantId = Boolean(dto.productVariantId);
      const hasProductId = Boolean(dto.productId);

      if ([hasItems, hasVariantId, hasProductId].filter(Boolean).length > 1) {
        throw new BadRequestException(
          'items, productVariantId ve productId den yalnizca biri gonderilebilir.',
        );
      }

      // Senaryo 2: Çoklu items[]
      if (hasItems) {
        const results: InventoryMovement[] = [];
        for (const item of dto.items!) {
          if (item.quantity <= 0) throw new BadRequestException(InventoryErrors.INVALID_QUANTITY);
          const variant = await this.getTenantVariantOrThrow(item.productVariantId, txManager);
          const movements = await this.transferStockSingle(
            fromStore, toStore, variant, item.quantity, dto.reference, dto.meta, txManager,
          );
          results.push(...movements);
        }
        return results;
      }

      // Senaryo 3: productId — ürünün tüm varyantları
      if (hasProductId) {
        const variants = await this.getVariantsByProductId(dto.productId!, txManager);
        const results: InventoryMovement[] = [];
        for (const variant of variants) {
          const transferQty = dto.quantity !== undefined
            ? dto.quantity
            : await this.getLockedStockForVariantInStore(txManager, fromStore.id, variant.id);

          if (transferQty === 0) continue; // stok yoksa bu varyantı atla
          if (transferQty < 0) continue;

          const movements = await this.transferStockSingle(
            fromStore, toStore, variant, transferQty, dto.reference, dto.meta, txManager,
          );
          results.push(...movements);
        }
        return results;
      }

      // Senaryo 1: Tekli productVariantId
      if (!dto.productVariantId || dto.quantity === undefined) {
        throw new BadRequestException('productVariantId ve quantity zorunludur.');
      }
      if (dto.quantity <= 0) throw new BadRequestException(InventoryErrors.INVALID_QUANTITY);

      const variant = await this.getTenantVariantOrThrow(dto.productVariantId, txManager);
      return this.transferStockSingle(
        fromStore, toStore, variant, dto.quantity, dto.reference, dto.meta, txManager,
      );
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

  // -------------------------------------------------------------------------
  // Stok özet sorgusu için paylaşılan yardımcılar
  // -------------------------------------------------------------------------

  /**
   * Her iki stok özet metodunun (getStoreStockSummary / getStockSummary) ortak
   * JOIN + SELECT zincirini kurar. Çağıran metot tenant/store WHERE koşullarını
   * ve sıralama/filtre eklemelerini kendi üzerine alır.
   */
  private buildVariantStockQb(
    manager?: EntityManager,
  ): SelectQueryBuilder<StoreVariantStock> {
    const tenantId = this.getTenantIdOrThrow();
    const repo = this.getStockSummaryRepository(manager);
    const sppTableName = this.storeProductPriceRepo.metadata.tableName;

    return repo
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
  }

  /**
   * Ham DB satırının sayısal/boolean alanlarını tiplendirir.
   * Ham string → number dönüşümleri tek yerde yapılır.
   */
  private mapStockRow(row: {
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
  }): {
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
  } {
    return {
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
    };
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
    const store = await this.getTenantStoreOrThrow(storeId, manager);

    const rows = await this.buildVariantStockQb(manager)
      .andWhere('s.storeId = :storeId', { storeId })
      .orderBy('product.name', 'ASC')
      .addOrderBy('variant.name', 'ASC')
      .getRawMany<{
        productId: string; productName: string;
        productVariantId: string; variantName: string; variantCode: string;
        storeId: string; storeName: string;
        quantity: string; unitPrice: string | null; purchasePrice: string | null;
        currency: string | null; taxPercent: string | null;
        discountPercent: string | null; discountAmount: string | null;
        taxAmount: string | null; lineTotal: string | null;
        isStoreOverride: boolean | string;
      }>();

    const items = rows.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      productVariantId: row.productVariantId,
      variantName: row.variantName,
      variantCode: row.variantCode,
      ...this.mapStockRow(row),
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

    const qb = this.buildVariantStockQb(manager);

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
        productId: string; productName: string;
        productVariantId: string; variantName: string; variantCode: string;
        storeId: string; storeName: string;
        quantity: string; unitPrice: string | null; purchasePrice: string | null;
        currency: string | null; taxPercent: string | null;
        discountPercent: string | null; discountAmount: string | null;
        taxAmount: string | null; lineTotal: string | null;
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
        totalQuantity: quantity,
        ...this.mapStockRow(row),
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
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoin(
        Location,
        'locationFilter',
        'locationFilter.id = m.locationId AND locationFilter.tenantId = :tenantId',
        { tenantId },
      )
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

    if (query.warehouseId) {
      qb.andWhere('locationFilter.warehouseId = :warehouseId', {
        warehouseId: query.warehouseId,
      });
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

    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;
      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where('store.name ILIKE :search', { search })
            .orWhere('variant.name ILIKE :search', { search })
            .orWhere('variant.code ILIKE :search', { search })
            .orWhere('product.name ILIKE :search', { search })
            .orWhere('locationFilter.name ILIKE :search', { search })
            .orWhere('locationFilter.code ILIKE :search', { search })
            .orWhere('CAST(m.meta AS text) ILIKE :search', { search });
        }),
      );
    }

    const [data, total] = await qb.getManyAndCount();
    const enrichedData = await this.enrichMovementHistory(data, tenantId, manager);

    return {
      data: enrichedData,
      meta: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + data.length < total,
      },
    };
  }

  private async enrichMovementHistory(
    movements: InventoryMovement[],
    tenantId: string,
    manager?: EntityManager,
  ): Promise<InventoryMovementHistoryItemResponse[]> {
    if (movements.length === 0) {
      return [];
    }

    const locationIds = Array.from(
      new Set(
        movements
          .map((movement) => movement.locationId)
          .filter((locationId): locationId is string => Boolean(locationId)),
      ),
    );

    const locationById = new Map<string, Location>();

    if (locationIds.length > 0) {
      const locations = await this.getLocationRepo(manager).find({
        where: {
          id: In(locationIds),
          tenant: { id: tenantId },
        },
      });

      for (const location of locations) {
        locationById.set(location.id, location);
      }
    }

    return movements.map((movement) => {
      const location = movement.locationId
        ? locationById.get(movement.locationId)
        : undefined;

      return {
        ...movement,
        productId: movement.productVariant?.product?.id ?? null,
        productName: movement.productVariant?.product?.name ?? null,
        locationName: location ? (location.name ?? location.code) : null,
        warehouseId: location?.warehouse?.id ?? null,
        warehouseName: location?.warehouse?.name ?? null,
        reason:
          typeof movement.meta?.reason === 'string'
            ? movement.meta.reason
            : null,
      };
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
