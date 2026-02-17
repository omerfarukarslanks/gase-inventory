import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, In } from 'typeorm';

import { StoreProductPrice } from './store-product-price.entity';
import { ProductVariant } from '../product/product-variant.entity';
import { AppContextService } from '../common/context/app-context.service';
import { ProductErrors } from '../common/errors/product.errors';
import { Store } from 'src/store/store.entity';
import { StoreErrors } from 'src/common/errors/store.errors';

export interface EffectivePriceParams {
  unitPrice: number | null;
  currency: string;
  discountPercent: number | null;
  discountAmount: number | null;
  taxPercent: number | null;
  taxAmount: number | null;
  lineTotal: number | null;
  isStoreOverride: boolean;
}

@Injectable()
export class PriceService {
  constructor(
    @InjectRepository(StoreProductPrice)
    private readonly sppRepo: Repository<StoreProductPrice>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    private readonly appContext: AppContextService,
  ) {}

  private getSppRepo(manager?: EntityManager): Repository<StoreProductPrice> {
    return manager ? manager.getRepository(StoreProductPrice) : this.sppRepo;
  }

  private getVariantRepo(manager?: EntityManager): Repository<ProductVariant> {
    return manager ? manager.getRepository(ProductVariant) : this.variantRepo;
  }

  private getStoreRepo(manager?: EntityManager): Repository<Store> {
    return manager ? manager.getRepository(Store) : this.storeRepo;
  }

  private getTenantIdOrThrow() {
    return this.appContext.getTenantIdOrThrow();
  }

  private getUserIdOrThrow() {
    return this.appContext.getUserIdOrThrow();
  }

  private buildEffectivePrice(
    variant: ProductVariant,
    storePrice?: StoreProductPrice | null,
  ): EffectivePriceParams {
    if (storePrice) {
      return {
        unitPrice:
          storePrice.unitPrice != null
            ? Number(storePrice.unitPrice)
            : variant.defaultSalePrice ?? null,
        currency: storePrice.currency ?? variant.defaultCurrency ?? 'TRY',
        discountPercent:
          storePrice.discountPercent != null
            ? Number(storePrice.discountPercent)
            : null,
        discountAmount:
          storePrice.discountAmount != null
            ? Number(storePrice.discountAmount)
            : null,
        taxPercent:
          storePrice.taxPercent != null
            ? Number(storePrice.taxPercent)
            : variant.defaultTaxPercent ?? null,
        taxAmount:
          storePrice.taxAmount != null
            ? Number(storePrice.taxAmount)
            : null,
        lineTotal:
          storePrice.lineTotal != null
            ? Number(storePrice.lineTotal)
            : null,
        isStoreOverride: true,
      };
    }

    return {
      unitPrice: variant.defaultSalePrice ?? null,
      currency: variant.defaultCurrency ?? 'TRY',
      discountPercent: null,
      discountAmount: null,
      taxPercent: variant.defaultTaxPercent ?? null,
      taxAmount: null,
      lineTotal: null,
      isStoreOverride: false,
    };
  }

  async getEffectiveSaleParamsForStore(
    storeId: string,
    productVariantId: string,
    manager?: EntityManager,
  ): Promise<EffectivePriceParams> {
    const tenantId = this.getTenantIdOrThrow();
    const variantRepo = this.getVariantRepo(manager);
    const sppRepo = this.getSppRepo(manager);

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

    const storePrice = await sppRepo.findOne({
      where: {
        tenant: { id: tenantId },
        store: { id: storeId },
        productVariant: { id: productVariantId },
        isActive: true,
      },
    });

    return this.buildEffectivePrice(variant, storePrice);
  }

  async getEffectiveSaleParamsForStoreBulk(
    storeId: string,
    productVariantIds: string[],
    manager?: EntityManager,
  ): Promise<
    Map<
      string,
      EffectivePriceParams
    >
  > {
    const tenantId = this.getTenantIdOrThrow();

    if (productVariantIds.length === 0) {
      return new Map();
    }

    const variantRepo = this.getVariantRepo(manager);
    const sppRepo = this.getSppRepo(manager);

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
      EffectivePriceParams
    >();

    const storePriceByVariantId = new Map(
      storePrices.map((price) => [price.productVariant.id, price]),
    );

    for (const variant of variants) {
      const storePrice = storePriceByVariantId.get(variant.id);
      result.set(variant.id, this.buildEffectivePrice(variant, storePrice));
    }

    return result;
  }

  async setStorePriceForVariant(params: {
    storeId: string;
    productVariantId: string;
    unitPrice?: number | null;
    currency?: string;
    discountPercent?: number | null;
    discountAmount?: number | null;
    taxPercent?: number | null;
    taxAmount?: number | null;
    lineTotal?: number | null;
    campaignCode?: string | null;
    manager?: EntityManager;
  }): Promise<StoreProductPrice> {
    const tenantId = this.getTenantIdOrThrow();
    const userId = this.getUserIdOrThrow();
    const sppRepo = this.getSppRepo(params.manager);

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

    if (params.unitPrice !== undefined) {
      spp.unitPrice = params.unitPrice;
    }
    if (params.currency !== undefined) {
      spp.currency = params.currency;
    }
    if (params.discountPercent !== undefined) {
      spp.discountPercent = params.discountPercent;
    }
    if (params.discountAmount !== undefined) {
      spp.discountAmount = params.discountAmount;
    }
    if (params.taxPercent !== undefined) {
      spp.taxPercent = params.taxPercent;
    }
    if (params.taxAmount !== undefined) {
      spp.taxAmount = params.taxAmount;
    }
    if (params.lineTotal !== undefined) {
      spp.lineTotal = params.lineTotal;
    }
    if (params.campaignCode !== undefined) {
      spp.campaignCode = params.campaignCode;
    }

    const hasAnyOverride =
      spp.unitPrice != null ||
      spp.currency != null ||
      spp.discountPercent != null ||
      spp.discountAmount != null ||
      spp.taxPercent != null ||
      spp.taxAmount != null ||
      spp.lineTotal != null ||
      spp.campaignCode != null;

    spp.isActive = hasAnyOverride;
    spp.updatedById = userId;

    return sppRepo.save(spp);
  }

  private async resolveTargetStoreIds(params: {
    storeId?: string;
    storeIds?: string[];
    applyToAllStores?: boolean;
    manager?: EntityManager;
  }): Promise<string[]> {
    const tenantId = this.getTenantIdOrThrow();
    const storeRepo = this.getStoreRepo(params.manager);

    const explicitStoreIds = Array.from(
      new Set(
        (params.storeIds ?? [])
          .map((storeId) => storeId?.trim())
          .filter((storeId): storeId is string => Boolean(storeId)),
      ),
    );

    const shouldApplyAll = params.applyToAllStores === true;

    if (shouldApplyAll) {
      const stores = await storeRepo.find({
        where: {
          tenant: { id: tenantId },
          isActive: true,
        },
        select: { id: true },
      });

      if (stores.length === 0) {
        throw new NotFoundException(StoreErrors.STORE_NOT_FOUND);
      }

      return stores.map((store) => store.id);
    }

    const targetStoreIds =
      explicitStoreIds.length > 0
        ? explicitStoreIds
        : params.storeId
          ? [params.storeId]
          : [];

    if (targetStoreIds.length === 0) {
      throw new BadRequestException(
        'storeId, storeIds veya applyToAllStores alanlarından biri gönderilmelidir.',
      );
    }

    const stores = await storeRepo.find({
      where: {
        id: In(targetStoreIds),
        tenant: { id: tenantId },
      },
      select: { id: true },
    });

    if (stores.length !== targetStoreIds.length) {
      throw new NotFoundException(StoreErrors.STORE_NOT_IN_TENANT);
    }

    return targetStoreIds;
  }

  async setStorePriceForVariantMulti(params: {
    storeId?: string;
    productVariantId: string;
    storeIds?: string[];
    applyToAllStores?: boolean;
    unitPrice?: number | null;
    currency?: string;
    discountPercent?: number | null;
    discountAmount?: number | null;
    taxPercent?: number | null;
    taxAmount?: number | null;
    lineTotal?: number | null;
    campaignCode?: string | null;
    manager?: EntityManager;
  }): Promise<{
    appliedStoreIds: string[];
    items: StoreProductPrice[];
  }> {
    const targetStoreIds = await this.resolveTargetStoreIds({
      storeId: params.storeId,
      storeIds: params.storeIds,
      applyToAllStores: params.applyToAllStores,
      manager: params.manager,
    });

    const handler = async (txManager: EntityManager): Promise<StoreProductPrice[]> => {
      const items: StoreProductPrice[] = [];
      for (const targetStoreId of targetStoreIds) {
        const row = await this.setStorePriceForVariant({
          storeId: targetStoreId,
          productVariantId: params.productVariantId,
          unitPrice: params.unitPrice,
          currency: params.currency,
          discountPercent: params.discountPercent,
          discountAmount: params.discountAmount,
          taxPercent: params.taxPercent,
          taxAmount: params.taxAmount,
          lineTotal: params.lineTotal,
          campaignCode: params.campaignCode,
          manager: txManager,
        });
        items.push(row);
      }
      return items;
    };

    const items = params.manager
      ? await handler(params.manager)
      : await this.sppRepo.manager.transaction(handler);

    return {
      appliedStoreIds: targetStoreIds,
      items,
    };
  }

  async clearStoreOverride(
    storeId: string,
    productVariantId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const tenantId = this.getTenantIdOrThrow();
    const sppRepo = this.getSppRepo(manager);

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
