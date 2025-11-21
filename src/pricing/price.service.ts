import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, In } from 'typeorm';

import { StoreProductPrice } from './store-product-price.entity';
import { ProductVariant } from '../product/product-variant.entity';
import { AppContextService } from '../common/context/app-context.service';
import { ProductErrors } from '../common/errors/product.errors';

@Injectable()
export class PriceService {
  constructor(
    @InjectRepository(StoreProductPrice)
    private readonly sppRepo: Repository<StoreProductPrice>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    private readonly appContext: AppContextService,
  ) {}

  private getTenantIdOrThrow() {
    return this.appContext.getTenantIdOrThrow();
  }

  private getUserIdOrThrow() {
    return this.appContext.getUserIdOrThrow();
  }

  /**
   * Store + variant için "efektif" fiyat parametreleri:
   * - Önce StoreProductPrice override'a bakar
   * - Yoksa ProductVariant default değerlerini kullanır.
   */
  async getEffectiveSaleParamsForStore(
    storeId: string,
    productVariantId: string,
    manager?: EntityManager,
  ): Promise<{
    unitPrice: number | null;
    currency: string;
    taxPercent: number | null;
    discountPercent: number | null;
    isStoreOverride: boolean;
  }> {
    const tenantId = this.getTenantIdOrThrow();

    const variantRepo: Repository<ProductVariant> = manager
      ? manager.getRepository<ProductVariant>(ProductVariant)
      : this.variantRepo;

    const sppRepo: Repository<StoreProductPrice> = manager
      ? manager.getRepository<StoreProductPrice>(StoreProductPrice)
      : this.sppRepo;

    // Önce varyantın tenant’a ait olduğundan emin ol
    const variant = await variantRepo.findOne({
      where: {
        id: productVariantId,
        product: { tenant: { id: tenantId } },
      },
      relations: ['product', 'product.tenant'],
    });

    if (!variant) {
      throw new NotFoundException(ProductErrors.VARIANT_NOT_FOUND);
    }

    // Mağaza override var mı?
    const storePrice = await sppRepo.findOne({
      where: {
        tenant: { id: tenantId },
        store: { id: storeId },
        productVariant: { id: productVariantId },
        isActive: true,
      },
    });

    if (storePrice) {
      return {
        unitPrice:
          storePrice.salePrice != null
            ? Number(storePrice.salePrice)
            : variant.defaultSalePrice ?? null,
        currency:
          storePrice.currency ??
          variant.defaultCurrency ??
          'TRY',
        taxPercent:
          storePrice.taxPercent != null
            ? Number(storePrice.taxPercent)
            : variant.defaultTaxPercent ?? null,
        discountPercent:
          storePrice.discountPercent != null
            ? Number(storePrice.discountPercent)
            : null,
        isStoreOverride: true,
      };
    }

    // Override yoksa: tenant default
    return {
      unitPrice: variant.defaultSalePrice ?? null,
      currency: variant.defaultCurrency ?? 'TRY',
      taxPercent: variant.defaultTaxPercent ?? null,
      discountPercent: null, // tenant level default indirim yok varsayalım
      isStoreOverride: false,
    };
  }

  async getEffectiveSaleParamsForStoreBulk(
    storeId: string,
    productVariantIds: string[],
    manager?: EntityManager,
  ): Promise<
    Map<
      string,
      {
        unitPrice: number | null;
        currency: string;
        taxPercent: number | null;
        discountPercent: number | null;
        isStoreOverride: boolean;
      }
    >
  > {
    const tenantId = this.getTenantIdOrThrow();

    if (productVariantIds.length === 0) {
      return new Map();
    }

    const variantRepo: Repository<ProductVariant> = manager
      ? manager.getRepository<ProductVariant>(ProductVariant)
      : this.variantRepo;

    const sppRepo: Repository<StoreProductPrice> = manager
      ? manager.getRepository<StoreProductPrice>(StoreProductPrice)
      : this.sppRepo;

    const variants = await variantRepo.find({
      where: {
        id: In(productVariantIds),
        product: { tenant: { id: tenantId } },
      },
      relations: ['product', 'product.tenant'],
    });

    if (variants.length !== new Set(productVariantIds).size) {
      throw new NotFoundException(ProductErrors.VARIANT_NOT_FOUND);
    }

    const storePrices = await sppRepo.find({
      where: {
        tenant: { id: tenantId },
        store: { id: storeId },
        productVariant: { id: In(productVariantIds) },
        isActive: true,
      },
      relations: ['productVariant'],
    });

    const result = new Map<
      string,
      {
        unitPrice: number | null;
        currency: string;
        taxPercent: number | null;
        discountPercent: number | null;
        isStoreOverride: boolean;
      }
    >();

    for (const variant of variants) {
      const storePrice = storePrices.find(
        (sp) => sp.productVariant.id === variant.id,
      );

      if (storePrice) {
        result.set(variant.id, {
          unitPrice:
            storePrice.salePrice != null
              ? Number(storePrice.salePrice)
              : variant.defaultSalePrice ?? null,
          currency:
            storePrice.currency ??
            variant.defaultCurrency ??
            'TRY',
          taxPercent:
            storePrice.taxPercent != null
              ? Number(storePrice.taxPercent)
              : variant.defaultTaxPercent ?? null,
          discountPercent:
            storePrice.discountPercent != null
              ? Number(storePrice.discountPercent)
              : null,
          isStoreOverride: true,
        });
      } else {
        result.set(variant.id, {
          unitPrice: variant.defaultSalePrice ?? null,
          currency: variant.defaultCurrency ?? 'TRY',
          taxPercent: variant.defaultTaxPercent ?? null,
          discountPercent: null,
          isStoreOverride: false,
        });
      }
    }

    return result;
  }

  /**
   * Mağaza için özel fiyat + vergi + indirim yüzdesi set et.
   * - salePrice null verilirse override pasif olabilir (isActive false)
   */
  async setStorePriceForVariant(params: {
    storeId: string;
    productVariantId: string;
    salePrice: number | null;
    currency?: string;
    taxPercent?: number | null;
    discountPercent?: number | null;
    manager?: EntityManager;
  }): Promise<StoreProductPrice> {
    const tenantId = this.getTenantIdOrThrow();
    const userId = this.getUserIdOrThrow();

    const sppRepo: Repository<StoreProductPrice> = params.manager
      ? params.manager.getRepository<StoreProductPrice>(StoreProductPrice)
      : this.sppRepo;

    let spp = await sppRepo.findOne({
      where: {
        tenant: { id: tenantId },
        store: { id: params.storeId },
        productVariant: { id: params.productVariantId },
      },
      relations: ['tenant', 'store', 'productVariant'],
    });

    if (!spp) {
      spp = sppRepo.create({
        tenant: { id: tenantId } as any,
        store: { id: params.storeId } as any,
        productVariant: { id: params.productVariantId } as any,
        createdById: userId,
        updatedById: userId,
        isActive: true,
      });
    }

    spp.salePrice = params.salePrice;
    if (params.currency !== undefined) {
      spp.currency = params.currency;
    }
    if (params.taxPercent !== undefined) {
      spp.taxPercent = params.taxPercent;
    }
    if (params.discountPercent !== undefined) {
      spp.discountPercent = params.discountPercent;
    }

    // salePrice null ise override’ı pasif kabul edebiliriz
    spp.isActive = params.salePrice != null;
    spp.updatedById = userId;

    return sppRepo.save(spp);
  }

  /**
   * Mağaza override'ını tamamen kaldır
   * (sonra tenant default fiyat devreye girer)
   */
  async clearStoreOverride(
    storeId: string,
    productVariantId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const tenantId = this.getTenantIdOrThrow();

    const sppRepo: Repository<StoreProductPrice> = manager
      ? manager.getRepository<StoreProductPrice>(StoreProductPrice)
      : this.sppRepo;

    const spp = await sppRepo.findOne({
      where: {
        tenant: { id: tenantId },
        store: { id: storeId },
        productVariant: { id: productVariantId },
      },
    });

    if (!spp) {
      return;
    }

    await sppRepo.remove(spp);
  }
}
