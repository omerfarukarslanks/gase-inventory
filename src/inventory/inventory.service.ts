import {
  Injectable,
  BadRequestException,
  NotFoundException,
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

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryMovement)
    private readonly movementRepo: Repository<InventoryMovement>,
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    private readonly appContext: AppContextService,
  ) {}

  // ---- Helpers ----

  private getTenantIdOrThrow(): string {
    return this.appContext.getTenantIdOrThrow();
  }

  private getUserIdOrThrow(): string {
    return this.appContext.getUserIdOrThrow();
  }

  private async getTenantStoreOrThrow(storeId: string, manager?: EntityManager): Promise<Store> {
    const tenantId = this.getTenantIdOrThrow();

    const repo = manager ? manager.getRepository(Store) : this.storeRepo;

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
    const repo = manager ? manager.getRepository(ProductVariant) : this.variantRepo;

    const variant = await repo.findOne({
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

  // ---- Hareket yazma helper'ı ----

private async createMovement(params: {
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
}, manager?: EntityManager): Promise<InventoryMovement> {
  const userId = this.getUserIdOrThrow();

   const repo: Repository<InventoryMovement> = manager
      ? manager.getRepository<InventoryMovement>(InventoryMovement)
      : this.movementRepo;

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

  return repo.save(movement);
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

async receiveStock(dto: ReceiveStockDto, manager?: EntityManager): Promise<InventoryMovement> {
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


  return this.createMovement({
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
  }, manager);
}


async sellFromStore(dto: SellStockDto, manager?: EntityManager): Promise<InventoryMovement> {
  if (dto.quantity <= 0) {
    throw new BadRequestException(InventoryErrors.INVALID_QUANTITY);
  }

  const tenantId = this.getTenantIdOrThrow();
  const store = await this.getTenantStoreOrThrow(dto.storeId, manager);
  const variant = await this.getTenantVariantOrThrow(dto.productVariantId, manager);

  // Önce stok yeterli mi kontrol et
  const currentStock = await this.getStockForVariantInStore(
    store.id,
    variant.id,
    manager
  );

  if (currentStock < dto.quantity) {
    throw new BadRequestException({
    ...InventoryErrors.NOT_ENOUGH_STOCK,
    details: { currentStock, requested: dto.quantity },
  });
}

  // OUT hareketi: quantity negatif
  return this.createMovement({
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
  }, manager);
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
    if (dto.quantity <= 0) {
      throw new BadRequestException(InventoryErrors.INVALID_QUANTITY);
    }
    if (dto.fromStoreId === dto.toStoreId) {
      throw new BadRequestException(InventoryErrors.SAME_SOURCE_AND_TARGET_STORE);
    }

    const tenantId = this.getTenantIdOrThrow();

    const fromStore = await this.getTenantStoreOrThrow(dto.fromStoreId, manager);
    const toStore = await this.getTenantStoreOrThrow(dto.toStoreId, manager);
    const variant = await this.getTenantVariantOrThrow(dto.productVariantId, manager);

    // İstersen burada fromStore stok yeterli mi diye kontrol de yapabiliriz:
    const currentFromStock = await this.getStockForVariantInStore(
      fromStore.id,
      variant.id,
      manager
    );
    if (currentFromStock < dto.quantity) {
      throw new BadRequestException({
        ...InventoryErrors.NOT_ENOUGH_STOCK,details: { currentFromStock, requested: dto.quantity },
      });
    }

    const outMovement = await this.createMovement({
      tenantId,
      store: fromStore,
      variant,
      type: MovementType.TRANSFER_OUT,
      quantity: -dto.quantity, // OUT -> negatif
      reference: dto.reference,
      meta: dto.meta,
    }, manager);

    const inMovement = await this.createMovement({
      tenantId,
      store: toStore,
      variant,
      type: MovementType.TRANSFER_IN,
      quantity: dto.quantity, // IN -> pozitif
      reference: dto.reference,
      meta: dto.meta,
    }, manager);

    return [outMovement, inMovement];
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

    const repo = manager ? manager.getRepository(InventoryMovement) : this.movementRepo;

    const row = await repo
      .createQueryBuilder('m')
      .select('COALESCE(SUM(m.quantity), 0)', 'sum')
      .where('m.tenantId = :tenantId', { tenantId })
      .andWhere('m.storeId = :storeId', { storeId })
      .andWhere('m.productVariantId = :variantId', { variantId })
      .getRawOne<{ sum: string | null }>();

    const sum = row?.sum ?? '0';

    return Number(sum);
  }

  /**
   * Belirli bir store için, variant bazlı stok listesi
   * (ör: mağazadaki tüm ürünlerin stok listesi)
   */
  async getStoreStockSummary(storeId: string, manager?: EntityManager): Promise<
    {
      productVariantId: string;
      quantity: number;
    }[]
  > {
    const tenantId = this.getTenantIdOrThrow();
    await this.getTenantStoreOrThrow(storeId, manager);
    const repo = manager ? manager.getRepository(InventoryMovement) : this.movementRepo;

    const rows = await repo
      .createQueryBuilder('m')
      .select('m.productVariantId', 'productVariantId')
      .addSelect('COALESCE(SUM(m.quantity), 0)', 'quantity')
      .where('m.tenantId = :tenantId', { tenantId })
      .andWhere('m.storeId = :storeId', { storeId })
      .groupBy('m.productVariantId')
      .getRawMany<{ productVariantId: string; quantity: string }>();

    return rows.map((r) => ({
      productVariantId: r.productVariantId,
      quantity: Number(r.quantity),
    }));
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
      productVariantId: string;
      quantity: number;
    }[]
  > {
    const tenantId = this.getTenantIdOrThrow();

    const repo: Repository<InventoryMovement> = manager
      ? manager.getRepository<InventoryMovement>(InventoryMovement)
      : this.movementRepo;

    const rows = await repo
      .createQueryBuilder('m')
      .select('m.productVariantId', 'productVariantId')
      .addSelect('COALESCE(SUM(m.quantity), 0)', 'quantity')
      .where('m.tenantId = :tenantId', { tenantId })
      .groupBy('m.productVariantId')
      .getRawMany<{ productVariantId: string; quantity: string }>();

    return rows.map((r) => ({
      productVariantId: r.productVariantId,
      quantity: Number(r.quantity),
    }));
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

  const repo: Repository<InventoryMovement> = manager
    ? manager.getRepository<InventoryMovement>(InventoryMovement)
    : this.movementRepo;

  const rows = await repo
    .createQueryBuilder('m')
    .select('m.storeId', 'storeId')
    .addSelect('COALESCE(SUM(m.quantity), 0)', 'quantity')
    .where('m.tenantId = :tenantId', { tenantId })
    .andWhere('m.productVariantId = :variantId', { variantId: productVariantId })
    .groupBy('m.storeId')
    .getRawMany<{ storeId: string; quantity: string }>();

  return rows.map((r) => ({
    storeId: r.storeId,
    quantity: Number(r.quantity),
  }));
}


}
