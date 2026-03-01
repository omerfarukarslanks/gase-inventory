import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';

import { ProductPackage } from './product-package.entity';
import { ProductPackageItem } from './product-package-item.entity';
import { AppContextService } from '../common/context/app-context.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreatePackageDto } from '../product-package/dto/create-package.dto';
import { UpdatePackageDto } from '../product-package/dto/update-package.dto';
import { ListPackagesDto } from '../product-package/dto/list-packages.dto';
import { ProductVariant } from 'src/product/product-variant.entity';
import { calculateLineAmounts } from 'src/pricing/utils/price-calculator';
import { StoreVariantStock } from 'src/inventory/store-variant-stock.entity';

@Injectable()
export class ProductPackageService {
  constructor(
    @InjectRepository(ProductPackage)
    private readonly packageRepo: Repository<ProductPackage>,

    @InjectRepository(ProductPackageItem)
    private readonly itemRepo: Repository<ProductPackageItem>,

    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(StoreVariantStock)
    private readonly stockSummaryRepo: Repository<StoreVariantStock>,

    private readonly appContext: AppContextService,
    private readonly inventoryService: InventoryService,
  ) {}

  // ---- CRUD ----

  async create(dto: CreatePackageDto): Promise<ProductPackage> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();

    const variants = await this.loadVariantsForTenant(
      dto.items.map((i) => i.productVariantId),
      tenantId,
    );

    const itemsWithVariants = dto.items.map((i) => ({
      productVariant: variants.find((v) => v.id === i.productVariantId)!,
      quantity: i.quantity,
      unitPrice: i.unitPrice ?? null,
    }));

    const pricing = this.computePackagePricing(itemsWithVariants);
    const defaultCurrency = this.resolvePackageCurrency(itemsWithVariants);

    const pkg = this.packageRepo.create({
      tenant: { id: tenantId } as any,
      name: dto.name,
      code: dto.code,
      description: dto.description,
      ...pricing,
      defaultCurrency,
      isActive: dto.isActive ?? true,
      createdById: userId,
      updatedById: userId,
      items: itemsWithVariants.map(({ productVariant, quantity, unitPrice }) =>
        this.itemRepo.create({
          productVariant: { id: productVariant.id } as any,
          product: { id: productVariant.product.id } as any,
          quantity,
          unitPrice,
          createdById: userId,
          updatedById: userId,
        }),
      ),
    });

    return this.packageRepo.save(pkg);
  }

  async findAll(query: ListPackagesDto): Promise<{
    data: ProductPackage[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const qb = this.packageRepo
      .createQueryBuilder('pkg')
      .leftJoinAndSelect('pkg.items', 'item')
      .leftJoinAndSelect('item.productVariant', 'variant')
      .leftJoinAndSelect('item.product', 'product')
      .where('pkg.tenantId = :tenantId', { tenantId });

    if (query.isActive !== 'all') {
      qb.andWhere('pkg.isActive = :isActive', { isActive: query.isActive ?? true });
    }

    if (query.search?.trim()) {
      qb.andWhere('(pkg.name ILIKE :search OR pkg.code ILIKE :search)', {
        search: `%${query.search.trim()}%`,
      });
    }

    const allowedSortFields = ['name', 'code', 'createdAt', 'updatedAt', 'defaultSalePrice'];
    const sortField = allowedSortFields.includes(query.sortBy ?? '')
      ? `pkg.${query.sortBy}`
      : 'pkg.createdAt';
    qb.orderBy(sortField, query.sortOrder ?? 'DESC');

    const total = await qb.getCount();
    const data = await qb
      .skip(query.skip)
      .take(query.limit)
      .getMany();

    await this.attachVariantStocks(data, tenantId);

    return {
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOneOrThrow(id: string): Promise<ProductPackage> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const pkg = await this.packageRepo.findOne({
      where: { id, tenant: { id: tenantId } },
      relations: ['items', 'items.productVariant', 'items.product'],
    });
    if (!pkg) {
      throw new NotFoundException(`ProductPackage ${id} bulunamadı.`);
    }
    return pkg;
  }

  async update(id: string, dto: UpdatePackageDto): Promise<ProductPackage> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();

    const pkg = await this.findOneOrThrow(id);

    if (dto.name !== undefined) pkg.name = dto.name;
    if (dto.code !== undefined) pkg.code = dto.code;
    if (dto.description !== undefined) pkg.description = dto.description;
    if (dto.isActive !== undefined) pkg.isActive = dto.isActive;
    pkg.updatedById = userId;

    if (dto.items !== undefined) {
      const variants = await this.loadVariantsForTenant(
        dto.items.map((i) => i.productVariantId),
        tenantId,
      );

      const itemsWithVariants = dto.items.map((i) => ({
        productVariant: variants.find((v) => v.id === i.productVariantId)!,
        quantity: i.quantity,
        unitPrice: i.unitPrice ?? null,
      }));

      const pricing = this.computePackagePricing(itemsWithVariants);
      const defaultCurrency = this.resolvePackageCurrency(itemsWithVariants);
      Object.assign(pkg, pricing);
      pkg.defaultCurrency = defaultCurrency;

      // Full-replace: sil ve yeniden yaz
      await this.itemRepo.delete({ productPackage: { id: pkg.id } });
      pkg.items = itemsWithVariants.map(({ productVariant, quantity, unitPrice }) =>
        this.itemRepo.create({
          productVariant: { id: productVariant.id } as any,
          product: { id: productVariant.product.id } as any,
          quantity,
          unitPrice,
          createdById: userId,
          updatedById: userId,
        }),
      );
    }

    return this.packageRepo.save(pkg);
  }

  async remove(id: string): Promise<void> {
    const pkg = await this.findOneOrThrow(id);
    pkg.isActive = false;
    pkg.updatedById = this.appContext.getUserIdOrThrow();
    await this.packageRepo.save(pkg);
  }

  // ---- Stok ----

  /**
   * Bir mağazada paketten kaç adet satılabilir olduğunu hesaplar.
   * paket_stok = floor( min( variantStok[i] / item.quantity ) )
   */
  async getPackageAvailableStock(
    packageId: string,
    storeId: string,
  ): Promise<{
    packageId: string;
    storeId: string;
    availablePackages: number;
    items: { variantId: string; variantName: string; qtyPerPackage: number; currentStock: number; maxPackages: number }[];
  }> {
    const pkg = await this.findOneOrThrow(packageId);

    const itemResults = await Promise.all(
      pkg.items.map(async (item) => {
        const currentStock = await this.inventoryService.getStockForVariantInStore(
          storeId,
          item.productVariant.id,
        );
        const qtyPerPackage = Number(item.quantity);
        const maxPackages = qtyPerPackage > 0 ? Math.floor(currentStock / qtyPerPackage) : 0;
        return {
          variantId: item.productVariant.id,
          variantName: item.productVariant.name,
          qtyPerPackage,
          currentStock,
          maxPackages,
        };
      }),
    );

    const availablePackages =
      itemResults.length > 0 ? Math.min(...itemResults.map((r) => r.maxPackages)) : 0;

    return { packageId, storeId, availablePackages, items: itemResults };
  }

  // ---- Helpers ----

  /**
   * Satış servisinin kullanması için: paketi tenant doğrulamasıyla yükler.
   * items + productVariant eager yüklü olur.
   */
  async findForSaleOrThrow(packageId: string, tenantId: string): Promise<ProductPackage> {
    const pkg = await this.packageRepo.findOne({
      where: { id: packageId, tenant: { id: tenantId }, isActive: true },
      relations: ['items', 'items.productVariant', 'items.product'],
    });
    if (!pkg) {
      throw new NotFoundException(`ProductPackage ${packageId} bulunamadı.`);
    }
    if (!pkg.items || pkg.items.length === 0) {
      throw new BadRequestException(`Paket ${packageId} içinde hiç variant tanımlanmamış.`);
    }
    return pkg;
  }

  /**
   * Variantları tenant'a ait olup olmadığını doğrulayarak yükler.
   */
  private async loadVariantsForTenant(
    variantIds: string[],
    tenantId: string,
  ): Promise<ProductVariant[]> {
    const variants = await this.variantRepo.find({
      where: {
        id: In(variantIds),
        product: { tenant: { id: tenantId } },
      },
      relations: ['product', 'product.tenant'],
    });
    if (variants.length !== variantIds.length) {
      throw new NotFoundException(
        'Bir veya daha fazla variant bu tenant\'a ait değil veya bulunamadı.',
      );
    }
    return variants;
  }

  /**
   * Paket içindeki item'ların bağlı olduğu product default değerlerinden fiyat alanlarını hesaplar.
   *
   * - Tutar alanları (salePrice, purchasePrice):
   *   Σ(product_değeri × qty) — herhangi biri null ise sonuç null
   * - İndirim/vergi tutarları ve lineTotal:
   *   Her item için product default değerleri ile calculateLineAmounts çalıştırılır, sonuçlar toplanır.
   * - Oran alanları (taxPercent, discountPercent):
   *   1. Tutarlar mevcutsa → (toplam tutar / toplam satış fiyatı) × 100 (efektif oran)
   *   2. Değilse → (product satış fiyatı × qty) ile ağırlıklı ortalama
   */
  private computePackagePricing(
    items: { productVariant: ProductVariant; quantity: number }[],
  ): Pick<
    ProductPackage,
    | 'defaultSalePrice'
    | 'defaultPurchasePrice'
    | 'defaultTaxPercent'
    | 'defaultDiscountPercent'
    | 'defaultDiscountAmount'
    | 'defaultTaxAmount'
    | 'defaultLineTotal'
  > {
    let totalSalePrice: number | null = 0;
    let totalPurchasePrice: number | null = 0;
    let totalDiscountAmount: number | null = 0;
    let totalTaxAmount: number | null = 0;
    let totalLineTotal: number | null = 0;

    let weightedTaxPercent = 0;
    let taxWeightTotal = 0;
    let weightedDiscountPercent = 0;
    let discountWeightTotal = 0;

    for (const { productVariant: v, quantity: qty } of items) {
      const product = v.product;
      const salePrice =
        product.defaultSalePrice != null ? Number(product.defaultSalePrice) : null;
      const purchasePrice =
        product.defaultPurchasePrice != null ? Number(product.defaultPurchasePrice) : null;
      const discountPercent =
        product.defaultDiscountPercent != null
          ? Number(product.defaultDiscountPercent)
          : null;
      const discountAmountPerUnit =
        product.defaultDiscountAmount != null
          ? Number(product.defaultDiscountAmount)
          : null;
      const discountAmount =
        discountPercent != null
          ? null
          : discountAmountPerUnit != null
            ? discountAmountPerUnit * qty
            : null;
      const taxPercent =
        product.defaultTaxPercent != null ? Number(product.defaultTaxPercent) : null;
      const taxAmountPerUnit =
        product.defaultTaxAmount != null
          ? Number(product.defaultTaxAmount)
          : null;
      const taxAmount =
        taxPercent != null
          ? null
          : taxAmountPerUnit != null
            ? taxAmountPerUnit * qty
            : null;

      totalSalePrice =
        totalSalePrice !== null && salePrice != null
          ? totalSalePrice + salePrice * qty
          : null;

      totalPurchasePrice =
        totalPurchasePrice !== null && purchasePrice != null
          ? totalPurchasePrice + purchasePrice * qty
          : null;

      if (
        totalDiscountAmount !== null &&
        totalTaxAmount !== null &&
        totalLineTotal !== null &&
        salePrice != null
      ) {
        const lineCalc = calculateLineAmounts({
          quantity: qty,
          unitPrice: salePrice,
          discountPercent,
          discountAmount,
          taxPercent,
          taxAmount,
        });

        totalDiscountAmount += lineCalc.discountAmount;
        totalTaxAmount += lineCalc.taxAmount;
        totalLineTotal += lineCalc.lineTotal;
      } else {
        totalDiscountAmount = null;
        totalTaxAmount = null;
        totalLineTotal = null;
      }

      // Ağırlık: product salePrice varsa salePrice×qty, yoksa qty
      // null percent → 0 olarak dahil edilir; tüm itemlar ağırlık toplamına girer
      const weight = salePrice != null ? salePrice * qty : qty;
      weightedTaxPercent += (taxPercent ?? 0) * weight;
      taxWeightTotal += weight;
      weightedDiscountPercent += (discountPercent ?? 0) * weight;
      discountWeightTotal += weight;
    }

    // Efektif oranlar
    let defaultTaxPercent: number | null = null;
    if (totalTaxAmount !== null && totalSalePrice !== null && totalSalePrice > 0) {
      defaultTaxPercent = (totalTaxAmount / totalSalePrice) * 100;
    } else if (taxWeightTotal > 0) {
      defaultTaxPercent = weightedTaxPercent / taxWeightTotal;
    }

    let defaultDiscountPercent: number | null = null;
    if (totalDiscountAmount !== null && totalSalePrice !== null && totalSalePrice > 0) {
      defaultDiscountPercent = (totalDiscountAmount / totalSalePrice) * 100;
    } else if (discountWeightTotal > 0) {
      defaultDiscountPercent = weightedDiscountPercent / discountWeightTotal;
    }

    return {
      defaultSalePrice: totalSalePrice,
      defaultPurchasePrice: totalPurchasePrice,
      defaultTaxPercent,
      defaultDiscountPercent,
      defaultDiscountAmount: totalDiscountAmount,
      defaultTaxAmount: totalTaxAmount,
      defaultLineTotal: totalLineTotal,
    };
  }

  private resolvePackageCurrency(
    items: { productVariant: ProductVariant; quantity: number }[],
  ): string {
    const currencies = Array.from(
      new Set(
        items.map(({ productVariant }) => productVariant.product?.defaultCurrency ?? 'TRY'),
      ),
    );

    if (currencies.length === 0) {
      return 'TRY';
    }

    if (currencies.length > 1) {
      throw new BadRequestException(
        'Paket icindeki urunlerin defaultCurrency degeri ayni olmalidir.',
      );
    }

    return currencies[0];
  }

  private async attachVariantStocks(
    packages: ProductPackage[],
    tenantId: string,
  ): Promise<void> {
    const variantIds = Array.from(
      new Set(
        packages
          .flatMap((pkg) => pkg.items ?? [])
          .map((item) => item.productVariant?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (variantIds.length === 0) {
      return;
    }

    const contextStoreId = this.appContext.getStoreId();
    const stockMap = new Map<string, number>();

    if (contextStoreId) {
      const rows = await this.stockSummaryRepo
        .createQueryBuilder('s')
        .select('s.productVariantId', 'variantId')
        .addSelect('COALESCE(s.quantity, 0)', 'quantity')
        .where('s.tenantId = :tenantId', { tenantId })
        .andWhere('s.storeId = :storeId', { storeId: contextStoreId })
        .andWhere('s."isActiveStore" = true')
        .andWhere('s.productVariantId IN (:...variantIds)', { variantIds })
        .getRawMany<{ variantId: string; quantity: string }>();

      for (const row of rows) {
        stockMap.set(row.variantId, Number(row.quantity));
      }
    } else {
      const rows = await this.stockSummaryRepo
        .createQueryBuilder('s')
        .select('s.productVariantId', 'variantId')
        .addSelect('COALESCE(SUM(s.quantity), 0)', 'quantity')
        .where('s.tenantId = :tenantId', { tenantId })
        .andWhere('s."isActiveStore" = true')
        .andWhere('s.productVariantId IN (:...variantIds)', { variantIds })
        .groupBy('s.productVariantId')
        .getRawMany<{ variantId: string; quantity: string }>();

      for (const row of rows) {
        stockMap.set(row.variantId, Number(row.quantity));
      }
    }

    for (const pkg of packages) {
      for (const item of pkg.items ?? []) {
        const variantId = item.productVariant?.id;
        (item as any).stock = variantId ? (stockMap.get(variantId) ?? 0) : 0;
      }
    }
  }
}
