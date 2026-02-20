import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { Product } from './product.entity';
import { ProductVariant } from './product-variant.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { AppContextService } from 'src/common/context/app-context.service';
import { ProductErrors } from 'src/common/errors/product.errors';
import {
  ListProductsDto,
  ListProductsSortBy,
  PaginatedProductsResponse,
  SortOrder,
} from './dto/list-products.dto';
import { ListVariantsDto } from './dto/list-variants.dto';
import { Attribute } from 'src/attribute/entity/attribute.entity';
import { AttributeValue } from 'src/attribute/entity/attribute-value.entity';
import { ProductAttributeSelectionDto } from './dto/product-attribute-selection.dto';
import { slugify } from 'src/common/utils/slugify';
import { Store } from 'src/store/store.entity';
import { StoreVariantStock } from 'src/inventory/store-variant-stock.entity';
import { StoreErrors } from 'src/common/errors/store.errors';
import { StoreProductPrice } from 'src/pricing/store-product-price.entity';

type ResolvedAttributeGroup = {
  attributeId: string;
  attributeName: string;
  values: { valueId: string; valueName: string }[];
};

type PriceInput = {
  currency?: string;
  purchasePrice?: number;
  unitPrice?: number;
  discountPercent?: number;
  discountAmount?: number;
  taxPercent?: number;
  taxAmount?: number;
  lineTotal?: number;
};

type ProductVariantListItem = {
  id: string;
  name: string;
  code: string;
  attributes?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  createdById?: string;
  updatedById?: string;
  isActive: boolean;
  purchasePrice: number | null;
  unitPrice: number | null;
  currency: string;
  discountPercent: number | null;
  discountAmount: number | null;
  taxPercent: number | null;
  taxAmount: number | null;
  lineTotal: number | null;
};

type ProductResponseShape = Product & {
  storeIds?: string[];
  applyToAllStores?: boolean;
  currency?: string;
  purchasePrice?: number | null;
  unitPrice?: number | null;
  discountPercent?: number | null;
  discountAmount?: number | null;
  taxPercent?: number | null;
  taxAmount?: number | null;
  lineTotal?: number | null;
};

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(Attribute)
    private readonly attributeRepo: Repository<Attribute>,
    @InjectRepository(AttributeValue)
    private readonly attributeValueRepo: Repository<AttributeValue>,
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(StoreVariantStock)
    private readonly storeVariantStockRepo: Repository<StoreVariantStock>,
    @InjectRepository(StoreProductPrice)
    private readonly storeProductPriceRepo: Repository<StoreProductPrice>,
    private readonly appContext: AppContextService,
    private readonly dataSource: DataSource,
  ) {}

  private getProductRepo(manager?: EntityManager): Repository<Product> {
    return manager ? manager.getRepository(Product) : this.productRepo;
  }

  private getVariantRepo(manager?: EntityManager): Repository<ProductVariant> {
    return manager ? manager.getRepository(ProductVariant) : this.variantRepo;
  }

  private getAttributeRepo(manager?: EntityManager): Repository<Attribute> {
    return manager ? manager.getRepository(Attribute) : this.attributeRepo;
  }

  private getAttributeValueRepo(manager?: EntityManager): Repository<AttributeValue> {
    return manager ? manager.getRepository(AttributeValue) : this.attributeValueRepo;
  }

  private getStoreRepo(manager?: EntityManager): Repository<Store> {
    return manager ? manager.getRepository(Store) : this.storeRepo;
  }

  private getStoreVariantStockRepo(manager?: EntityManager): Repository<StoreVariantStock> {
    return manager
      ? manager.getRepository(StoreVariantStock)
      : this.storeVariantStockRepo;
  }

  private getStoreProductPriceRepo(manager?: EntityManager): Repository<StoreProductPrice> {
    return manager
      ? manager.getRepository(StoreProductPrice)
      : this.storeProductPriceRepo;
  }

  private async getTenantStoreOrThrow(
    storeId: string | undefined,
    manager?: EntityManager,
  ): Promise<Store> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const resolvedStoreId = storeId ?? this.appContext.getStoreIdOrThrow();
    const store = await this.getStoreRepo(manager).findOne({
      where: {
        id: resolvedStoreId,
        tenant: { id: tenantId },
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!store) {
      throw new NotFoundException(StoreErrors.STORE_NOT_IN_TENANT);
    }

    return store;
  }

  private toBoolean(value: unknown): boolean {
    return value === true || value === 'true' || value === 't' || value === 1 || value === '1';
  }

  private async getTenantStoreIds(
    manager?: EntityManager,
    onlyActive = false,
  ): Promise<string[]> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const stores = await this.getStoreRepo(manager).find({
      where: {
        tenant: { id: tenantId },
        ...(onlyActive ? { isActive: true } : {}),
      },
      select: { id: true },
    });

    return stores.map((store) => store.id);
  }

  private async ensureTenantStoreIds(
    storeIds: string[],
    manager?: EntityManager,
  ): Promise<string[]> {
    if (storeIds.length === 0) {
      return [];
    }

    const tenantId = this.appContext.getTenantIdOrThrow();
    const normalized = Array.from(
      new Set(storeIds.map((id) => id?.trim()).filter((id): id is string => Boolean(id))),
    );
    if (normalized.length === 0) {
      return [];
    }

    const stores = await this.getStoreRepo(manager).find({
      where: {
        id: In(normalized),
        tenant: { id: tenantId },
      },
      select: { id: true },
    });

    if (stores.length !== normalized.length) {
      throw new NotFoundException(StoreErrors.STORE_NOT_IN_TENANT);
    }

    return normalized;
  }

  private async resolveScopeStoreIds(
    storeIds: string[] | undefined,
    applyToAllStores: boolean | undefined,
    manager?: EntityManager,
  ): Promise<string[]> {
    const tokenStoreId = this.appContext.getStoreId();

    if (applyToAllStores === true) {
      return this.getTenantStoreIds(manager);
    }

    const normalizedStoreIds = await this.ensureTenantStoreIds(storeIds ?? [], manager);
    if (normalizedStoreIds.length > 0) {
      return normalizedStoreIds;
    }

    if (applyToAllStores === false) {
      if (tokenStoreId) {
        const store = await this.getTenantStoreOrThrow(tokenStoreId, manager);
        return [store.id];
      }
      throw new BadRequestException(
        'storeIds bos ise applyToAllStores=false durumunda token icinde storeId olmalidir.',
      );
    }

    if (tokenStoreId) {
      const store = await this.getTenantStoreOrThrow(tokenStoreId, manager);
      return [store.id];
    }

    return this.getTenantStoreIds(manager);
  }

  private getCreateProductPriceDefaults(input: PriceInput): Partial<Product> {
    return {
      defaultCurrency: input.currency ?? 'TRY',
      defaultPurchasePrice: input.purchasePrice,
      defaultSalePrice: input.unitPrice,
      defaultDiscountPercent: input.discountPercent,
      defaultDiscountAmount: input.discountAmount,
      defaultTaxPercent: input.taxPercent,
      defaultTaxAmount: input.taxAmount,
      defaultLineTotal: input.lineTotal,
    };
  }

  private getUpdateProductPriceDefaults(input: PriceInput): Partial<Product> {
    const mapped: Partial<Product> = {};

    if (input.currency !== undefined) mapped.defaultCurrency = input.currency;
    if (input.purchasePrice !== undefined) mapped.defaultPurchasePrice = input.purchasePrice;
    if (input.unitPrice !== undefined) mapped.defaultSalePrice = input.unitPrice;
    if (input.discountPercent !== undefined) mapped.defaultDiscountPercent = input.discountPercent;
    if (input.discountAmount !== undefined) mapped.defaultDiscountAmount = input.discountAmount;
    if (input.taxPercent !== undefined) mapped.defaultTaxPercent = input.taxPercent;
    if (input.taxAmount !== undefined) mapped.defaultTaxAmount = input.taxAmount;
    if (input.lineTotal !== undefined) mapped.defaultLineTotal = input.lineTotal;

    return mapped;
  }

  private async attachProductScopeAndPriceFields(
    products: Product[],
    manager?: EntityManager,
  ): Promise<void> {
    if (products.length === 0) {
      return;
    }

    const tenantId = this.appContext.getTenantIdOrThrow();
    const productIds = products.map((product) => product.id);
    const totalStoreCount = await this.getStoreRepo(manager).count({
      where: { tenant: { id: tenantId } },
    });

    const rows = await this.getVariantRepo(manager)
      .createQueryBuilder('variant')
      .innerJoin('variant.product', 'product')
      .innerJoin(
        StoreVariantStock,
        'svs',
        'svs."productVariantId" = variant.id AND svs."tenantId" = :tenantId AND svs."isActiveStore" = true',
        { tenantId },
      )
      .select('product.id', 'productId')
      .addSelect('svs."storeId"', 'storeId')
      .where('product.id IN (:...productIds)', { productIds })
      .groupBy('product.id')
      .addGroupBy('svs."storeId"')
      .getRawMany<{
        productId: string;
        storeId: string;
      }>();

    const storeIdsByProductId = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!storeIdsByProductId.has(row.productId)) {
        storeIdsByProductId.set(row.productId, new Set<string>());
      }
      storeIdsByProductId.get(row.productId)!.add(row.storeId);
    }

    for (const product of products) {
      const typedProduct = product as ProductResponseShape;
      const storeIds = Array.from(storeIdsByProductId.get(product.id) ?? []);
      typedProduct.storeIds = storeIds;
      typedProduct.applyToAllStores =
        totalStoreCount > 0 && storeIds.length === totalStoreCount;

      typedProduct.currency = product.defaultCurrency ?? 'TRY';
      typedProduct.purchasePrice =
        product.defaultPurchasePrice != null ? Number(product.defaultPurchasePrice) : null;
      typedProduct.unitPrice =
        product.defaultSalePrice != null ? Number(product.defaultSalePrice) : null;
      typedProduct.discountPercent =
        product.defaultDiscountPercent != null ? Number(product.defaultDiscountPercent) : null;
      typedProduct.discountAmount =
        product.defaultDiscountAmount != null ? Number(product.defaultDiscountAmount) : null;
      typedProduct.taxPercent =
        product.defaultTaxPercent != null ? Number(product.defaultTaxPercent) : null;
      typedProduct.taxAmount =
        product.defaultTaxAmount != null ? Number(product.defaultTaxAmount) : null;
      typedProduct.lineTotal =
        product.defaultLineTotal != null ? Number(product.defaultLineTotal) : null;
    }
  }

  async createProduct(dto: CreateProductDto, manager?: EntityManager): Promise<Product> {
    const repo = this.getProductRepo(manager);
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();
    const {
      attributes,
      storeIds,
      applyToAllStores,
      currency,
      purchasePrice,
      unitPrice,
      discountPercent,
      discountAmount,
      taxPercent,
      taxAmount,
      lineTotal,
      ...productPayload
    } = dto;

    const product = repo.create({
      ...productPayload,
      ...this.getCreateProductPriceDefaults({
        currency,
        purchasePrice,
        unitPrice,
        discountPercent,
        discountAmount,
        taxPercent,
        taxAmount,
        lineTotal,
      }),
      tenant: { id: tenantId } as any,
      createdById: userId,
      updatedById: userId,
    });
    const saved = await repo.save(product);

    if (Array.isArray(attributes) && attributes.length > 0) {
      await this.syncGeneratedVariants(saved, attributes, manager);
    }

    await this.applyProductStoresScope(
      saved.id,
      storeIds,
      applyToAllStores,
      manager,
    );

    return saved;
  }

  async findAll(
    query: ListProductsDto,
    manager?: EntityManager,
  ): Promise<PaginatedProductsResponse> {
    const repo = this.getProductRepo(manager);
    const tenantId = this.appContext.getTenantIdOrThrow();
    const tokenStoreId = this.appContext.getStoreId();
    const tokenStore = tokenStoreId
      ? await this.getTenantStoreOrThrow(tokenStoreId, manager)
      : null;
    const {
      page,
      limit,
      search,
      sortBy,
      sortOrder,
      skip,
      defaultCurrency,
      defaultSalePriceMin,
      defaultSalePriceMax,
      defaultPurchasePriceMin,
      defaultPurchasePriceMax,
      isActive,
      variantIsActive,
    } = query;

    const allowedSortBy = new Set<string>([
      ListProductsSortBy.ID,
      ListProductsSortBy.NAME,
      ListProductsSortBy.SKU,
      ListProductsSortBy.CREATED_AT,
      ListProductsSortBy.UPDATED_AT,
    ]);

    const sortByValue = typeof sortBy === 'string' ? sortBy : '';
    const safeSortBy = allowedSortBy.has(sortByValue)
      ? sortByValue
      : ListProductsSortBy.CREATED_AT;
    const safeSortOrder =
      sortOrder === SortOrder.ASC || sortOrder === SortOrder.DESC
        ? sortOrder
        : SortOrder.DESC;

    if (
      defaultSalePriceMin !== undefined &&
      defaultSalePriceMax !== undefined &&
      defaultSalePriceMin > defaultSalePriceMax
    ) {
      throw new BadRequestException('defaultSalePriceMin, defaultSalePriceMax değerinden büyük olamaz');
    }

    if (
      defaultPurchasePriceMin !== undefined &&
      defaultPurchasePriceMax !== undefined &&
      defaultPurchasePriceMin > defaultPurchasePriceMax
    ) {
      throw new BadRequestException('defaultPurchasePriceMin, defaultPurchasePriceMax değerinden büyük olamaz');
    }

    const qb = repo
      .createQueryBuilder('product')
      .select([
        'product.id',
        'product.name',
        'product.sku',
        'product.description',
        'product.image',
        'product.defaultCurrency',
        'product.defaultSalePrice',
        'product.defaultPurchasePrice',
        'product.defaultDiscountPercent',
        'product.defaultDiscountAmount',
        'product.defaultTaxPercent',
        'product.defaultTaxAmount',
        'product.defaultLineTotal',
        'product.isActive',
        'product.createdAt',
        'product.updatedAt',
      ])
      .where('product.tenantId = :tenantId', { tenantId })
      .orderBy(`product.${safeSortBy}`, safeSortOrder)
      .skip(skip)
      .take(limit)
      .loadRelationCountAndMap('product.variantCount', 'product.variants');

    if (search) {
      qb.andWhere(
        '(product.name ILIKE :search OR product.sku ILIKE :search OR product.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (defaultCurrency) {
      qb.andWhere('UPPER(product.defaultCurrency) = UPPER(:defaultCurrency)', {
        defaultCurrency,
      });
    }

    if (defaultSalePriceMin !== undefined) {
      qb.andWhere('product.defaultSalePrice >= :defaultSalePriceMin', {
        defaultSalePriceMin,
      });
    }

    if (defaultSalePriceMax !== undefined) {
      qb.andWhere('product.defaultSalePrice <= :defaultSalePriceMax', {
        defaultSalePriceMax,
      });
    }

    if (defaultPurchasePriceMin !== undefined) {
      qb.andWhere('product.defaultPurchasePrice >= :defaultPurchasePriceMin', {
        defaultPurchasePriceMin,
      });
    }

    if (defaultPurchasePriceMax !== undefined) {
      qb.andWhere('product.defaultPurchasePrice <= :defaultPurchasePriceMax', {
        defaultPurchasePriceMax,
      });
    }

    if (tokenStore) {
      qb.andWhere(
        `EXISTS (
          SELECT 1
          FROM product_variants pv
          INNER JOIN store_variant_stock svs ON svs."productVariantId" = pv.id
          WHERE pv."productId" = product.id
            AND svs."tenantId" = :tenantId
            AND svs."storeId" = :scopeStoreId
            AND svs."isActiveStore" = true
        )`,
        { scopeStoreId: tokenStore.id },
      );
    }

    const scopeStoreFilter = tokenStore ? 'AND svs."storeId" = :scopeStoreId' : '';
    const scopeStoreLinkFilter = 'AND svs."isActiveStore" = true';
    const scopeParams = tokenStore ? { scopeStoreId: tokenStore.id } : {};

    if (isActive !== undefined && isActive !== 'all') {
      if (isActive === true) {
        qb.andWhere(
          `EXISTS (
            SELECT 1
            FROM product_variants pv
            INNER JOIN store_variant_stock svs ON svs."productVariantId" = pv.id
            WHERE pv."productId" = product.id
              AND svs."tenantId" = :tenantId
              ${scopeStoreFilter}
              ${scopeStoreLinkFilter}
              AND svs."isActive" = true
          )`,
          scopeParams,
        );
      } else {
        qb.andWhere(
          `NOT EXISTS (
            SELECT 1
            FROM product_variants pv
            INNER JOIN store_variant_stock svs ON svs."productVariantId" = pv.id
            WHERE pv."productId" = product.id
              AND svs."tenantId" = :tenantId
              ${scopeStoreFilter}
              ${scopeStoreLinkFilter}
              AND svs."isActive" = true
          )`,
          scopeParams,
        );
      }
    }

    if (variantIsActive !== undefined && variantIsActive !== 'all') {
      qb.andWhere(
        `EXISTS (
          SELECT 1
          FROM product_variants pv
          INNER JOIN store_variant_stock svs ON svs."productVariantId" = pv.id
          WHERE pv."productId" = product.id
            AND svs."tenantId" = :tenantId
            ${scopeStoreFilter}
            ${scopeStoreLinkFilter}
            AND svs."isActive" = :variantIsActive
        )`,
        {
          ...scopeParams,
          variantIsActive,
        },
      );
    }

    const countQb = qb.clone();
    const total = await countQb.getCount();
    const products = await qb.getMany();

    if (products.length > 0) {
      const productIds = products.map((product) => product.id);
      const activeStateQb = this.getVariantRepo(manager)
        .createQueryBuilder('variant')
        .innerJoin('variant.product', 'product')
        .innerJoin(
          StoreVariantStock,
          'svs',
          'svs."productVariantId" = variant.id AND svs."tenantId" = :tenantId AND svs."isActiveStore" = true',
          { tenantId },
        )
        .select('product.id', 'productId')
        .addSelect(
          'MAX(CASE WHEN svs."isActive" = true THEN 1 ELSE 0 END)',
          'hasActiveStoreRow',
        )
        .where('product.id IN (:...productIds)', { productIds });

      if (tokenStore) {
        activeStateQb.andWhere('svs."storeId" = :scopeStoreId', {
          scopeStoreId: tokenStore.id,
        });
      }

      const activeStateRows = await activeStateQb
        .groupBy('product.id')
        .getRawMany<{
          productId: string;
          hasActiveStoreRow: string;
        }>();

      const hasActiveStoreRowByProductId = new Map(
        activeStateRows.map((row) => [
          row.productId,
          Number(row.hasActiveStoreRow ?? 0) > 0,
        ]),
      );

      for (const product of products) {
        const hasActiveStoreRow = hasActiveStoreRowByProductId.get(product.id) ?? false;
        product.isActive = hasActiveStoreRow;
      }
    }

    await this.attachProductScopeAndPriceFields(products, manager);

    return {
      data: products,
      meta: {
        total,
        limit,
        page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, manager?: EntityManager): Promise<Product> {
    const repo = this.getProductRepo(manager);
    const tenantId = this.appContext.getTenantIdOrThrow();
    const tokenStoreId = this.appContext.getStoreId();

    const product = await repo
      .createQueryBuilder('product')
      .select([
        'product.id',
        'product.name',
        'product.sku',
        'product.description',
        'product.image',
        'product.defaultCurrency',
        'product.defaultSalePrice',
        'product.defaultPurchasePrice',
        'product.defaultDiscountPercent',
        'product.defaultDiscountAmount',
        'product.defaultTaxPercent',
        'product.defaultTaxAmount',
        'product.defaultLineTotal',
        'product.isActive',
        'product.createdAt',
        'product.updatedAt',
        'product.createdById',
      ])
      .where('product.id = :id', { id })
      .andWhere('product.tenantId = :tenantId', { tenantId })
      .loadRelationCountAndMap('product.variantCount', 'product.variants')
      .getOne();

    if (!product) {
      throw new NotFoundException(ProductErrors.PRODUCT_NOT_FOUND);
    }

    let scopeStoreIdForProduct: string | null = null;
    if (tokenStoreId) {
      const store = await this.getTenantStoreOrThrow(tokenStoreId, manager);
      scopeStoreIdForProduct = store.id;

      const scopedExists = await this.getVariantRepo(manager)
        .createQueryBuilder('variant')
        .innerJoin(
          StoreVariantStock,
          'svs',
          'svs."productVariantId" = variant.id AND svs."tenantId" = :tenantId AND svs."isActiveStore" = true',
          { tenantId },
        )
        .select('1')
        .where('variant."productId" = :productId', { productId: product.id })
        .andWhere('svs."storeId" = :storeId', { storeId: store.id })
        .limit(1)
        .getRawOne();

      if (!scopedExists) {
        throw new NotFoundException(ProductErrors.PRODUCT_NOT_FOUND);
      }
    }

    const activeQb = this.getVariantRepo(manager)
      .createQueryBuilder('variant')
      .innerJoin(
        StoreVariantStock,
        'svs',
        'svs."productVariantId" = variant.id AND svs."tenantId" = :tenantId AND svs."isActiveStore" = true',
        { tenantId },
      )
      .select(
        'MAX(CASE WHEN svs."isActive" = true THEN 1 ELSE 0 END)',
        'hasActiveStoreRow',
      )
      .where('variant."productId" = :productId', { productId: product.id });

    if (scopeStoreIdForProduct) {
      activeQb.andWhere('svs."storeId" = :storeId', {
        storeId: scopeStoreIdForProduct,
      });
    }

    const activeRow = await activeQb.getRawOne<{ hasActiveStoreRow: string | null }>();
    product.isActive = Number(activeRow?.hasActiveStoreRow ?? 0) > 0;
    await this.attachProductScopeAndPriceFields([product], manager);

    return product;
  }

  async update(id: string, dto: UpdateProductDto, manager?: EntityManager): Promise<Product> {
    const repo = this.getProductRepo(manager);
    const product = await this.findOne(id, manager);
    const tokenStoreId = this.appContext.getStoreId();
    const {
      isActive: nextIsActive,
      storeIds,
      applyToAllStores,
      currency,
      purchasePrice,
      unitPrice,
      discountPercent,
      discountAmount,
      taxPercent,
      taxAmount,
      lineTotal,
      ...restDto
    } = dto;
    let hasStoreStateChange = false;

    if (nextIsActive !== undefined) {
      if (tokenStoreId) {
        const store = await this.getTenantStoreOrThrow(tokenStoreId, manager);
        await this.setStoreProductActiveState(product.id, store.id, nextIsActive, manager);
      } else {
        await this.setTenantProductStoresActiveState(product.id, nextIsActive, manager);
      }
      hasStoreStateChange = true;
    }

    if (storeIds !== undefined || applyToAllStores !== undefined) {
      await this.applyProductStoresScope(
        product.id,
        storeIds,
        applyToAllStores,
        manager,
      );
      hasStoreStateChange = true;
    }

    if (Object.keys(restDto).length === 0) {
      const hasPriceUpdate =
        currency !== undefined ||
        purchasePrice !== undefined ||
        unitPrice !== undefined ||
        discountPercent !== undefined ||
        discountAmount !== undefined ||
        taxPercent !== undefined ||
        taxAmount !== undefined ||
        lineTotal !== undefined;
      if (!hasPriceUpdate) {
        return hasStoreStateChange ? this.findOne(id, manager) : product;
      }
    }

    const userId = this.appContext.getUserIdOrThrow();
    Object.assign(
      product,
      restDto,
      this.getUpdateProductPriceDefaults({
        currency,
        purchasePrice,
        unitPrice,
        discountPercent,
        discountAmount,
        taxPercent,
        taxAmount,
        lineTotal,
      }),
      {
      updatedById: userId,
      },
    );
    return repo.save(product);
  }

  async remove(id: string, manager?: EntityManager): Promise<void> {
    await this.findOne(id, manager);
    const tokenStoreId = this.appContext.getStoreId();

    if (tokenStoreId) {
      const store = await this.getTenantStoreOrThrow(tokenStoreId, manager);
      await this.setStoreProductActiveState(id, store.id, false, manager);
      return;
    }

    await this.setTenantProductStoresActiveState(id, false, manager);
  }

  // ---------- Variant işlemleri ----------

  async syncVariants(
    productId: string,
    dto: CreateVariantDto,
    manager?: EntityManager,
  ): Promise<ProductVariantListItem[]> {
    if (manager) {
      return this.syncVariantsInternal(productId, dto, manager);
    }

    return this.dataSource.transaction((txManager) =>
      this.syncVariantsInternal(productId, dto, txManager),
    );
  }

  private async syncVariantsInternal(
    productId: string,
    dto: CreateVariantDto,
    manager: EntityManager,
  ): Promise<ProductVariantListItem[]> {
    const product = await this.findProductForVariantSync(productId, manager);
    await this.syncGeneratedVariants(product, dto.attributes, manager);
    return this.listVariants(productId, { isActive: 'all' } as ListVariantsDto, manager);
  }

  private async findProductForVariantSync(
    productId: string,
    manager?: EntityManager,
  ): Promise<Product> {
    const repo = this.getProductRepo(manager);
    const tenantId = this.appContext.getTenantIdOrThrow();
    const tokenStoreId = this.appContext.getStoreId();

    const product = await repo
      .createQueryBuilder('product')
      .select([
        'product.id',
        'product.name',
        'product.sku',
        'product.description',
        'product.image',
        'product.defaultCurrency',
        'product.defaultSalePrice',
        'product.defaultPurchasePrice',
        'product.defaultDiscountPercent',
        'product.defaultDiscountAmount',
        'product.defaultTaxPercent',
        'product.defaultTaxAmount',
        'product.defaultLineTotal',
        'product.isActive',
        'product.createdAt',
        'product.updatedAt',
        'product.createdById',
        'product.updatedById',
      ])
      .where('product.id = :id', { id: productId })
      .andWhere('product.tenantId = :tenantId', { tenantId })
      .getOne();

    if (!product) {
      throw new NotFoundException(ProductErrors.PRODUCT_NOT_FOUND);
    }

    if (!tokenStoreId) {
      return product;
    }

    const store = await this.getTenantStoreOrThrow(tokenStoreId, manager);
    const scopedExists = await this.getVariantRepo(manager)
      .createQueryBuilder('variant')
      .innerJoin(
        StoreVariantStock,
        'svs',
        'svs."productVariantId" = variant.id AND svs."tenantId" = :tenantId AND svs."isActiveStore" = true',
        { tenantId },
      )
      .select('1')
      .where('variant."productId" = :productId', { productId })
      .andWhere('svs."storeId" = :storeId', { storeId: store.id })
      .limit(1)
      .getRawOne();

    if (scopedExists) {
      return product;
    }

    const variantCount = await this.getVariantRepo(manager).count({
      where: {
        product: { id: productId, tenant: { id: tenantId } },
      },
    });

    // Ilk varyant olusturma senaryosunda store baglantisi henuz olmayabilir.
    if (variantCount === 0) {
      return product;
    }

    throw new NotFoundException(ProductErrors.PRODUCT_NOT_FOUND);
  }

  async listVariants(
    productId: string,
    query?: ListVariantsDto,
    manager?: EntityManager,
  ): Promise<ProductVariantListItem[]> {
    const repo = this.getVariantRepo(manager);
    const product = await this.findOne(productId, manager);
    const tenantId = this.appContext.getTenantIdOrThrow();
    const tokenStoreId = this.appContext.getStoreId();
    const isActive = query?.isActive ?? 'all';

    if (tokenStoreId) {
      const store = await this.getTenantStoreOrThrow(tokenStoreId, manager);

      const qb = repo
        .createQueryBuilder('variant')
        .innerJoin('variant.product', 'product')
        .innerJoin(
          StoreVariantStock,
          'svs',
          'svs."productVariantId" = variant.id AND svs."storeId" = :storeId AND svs."tenantId" = :tenantId AND svs."isActiveStore" = true',
          {
            storeId: store.id,
            tenantId,
          },
        )
        .leftJoin(
          StoreProductPrice,
          'spp',
          [
            'spp."tenantId" = :tenantId',
            'spp."storeId" = :storeId',
            'spp."productVariantId" = variant.id',
            'spp."isActive" = true',
          ].join(' AND '),
          {
            tenantId,
            storeId: store.id,
          },
        )
        .select('variant.id', 'id')
        .addSelect('variant.name', 'name')
        .addSelect('variant.code', 'code')
        .addSelect('variant.attributes', 'attributes')
        .addSelect(
          'COALESCE(spp."purchasePrice", variant."defaultPurchasePrice")',
          'purchasePrice',
        )
        .addSelect(
          'COALESCE(spp."salePrice", variant."defaultSalePrice")',
          'unitPrice',
        )
        .addSelect(
          'COALESCE(spp."currency", variant."defaultCurrency", \'TRY\')',
          'currency',
        )
        .addSelect(
          'COALESCE(spp."discountPercent", variant."defaultDiscountPercent")',
          'discountPercent',
        )
        .addSelect(
          'COALESCE(spp."discountAmount", variant."defaultDiscountAmount")',
          'discountAmount',
        )
        .addSelect(
          'COALESCE(spp."taxPercent", variant."defaultTaxPercent")',
          'taxPercent',
        )
        .addSelect(
          'COALESCE(spp."taxAmount", variant."defaultTaxAmount")',
          'taxAmount',
        )
        .addSelect(
          'COALESCE(spp."lineTotal", variant."defaultLineTotal")',
          'lineTotal',
        )
        .addSelect('variant."createdAt"', 'createdAt')
        .addSelect('variant."updatedAt"', 'updatedAt')
        .addSelect('variant."createdById"', 'createdById')
        .addSelect('variant."updatedById"', 'updatedById')
        .addSelect('svs."isActive"', 'storeIsActive')
        .where('product.id = :productId', { productId: product.id })
        .andWhere('product.tenantId = :tenantId', { tenantId })
        .orderBy('svs."isActive"', 'DESC')
        .addOrderBy('variant."createdAt"', 'DESC');

      if (isActive !== 'all') {
        qb.andWhere('svs."isActive" = :isActive', { isActive });
      }

      const rows = await qb.getRawMany<{
        id: string;
        name: string;
        code: string;
        attributes: Record<string, any> | null;
        purchasePrice: string | null;
        unitPrice: string | null;
        currency: string | null;
        discountPercent: string | null;
        discountAmount: string | null;
        taxPercent: string | null;
        taxAmount: string | null;
        lineTotal: string | null;
        createdAt: Date | string;
        updatedAt: Date | string;
        createdById: string | null;
        updatedById: string | null;
        storeIsActive: boolean | string | null;
      }>();

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        attributes: row.attributes ?? undefined,
        createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
        updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
        createdById: row.createdById ?? undefined,
        updatedById: row.updatedById ?? undefined,
        isActive: this.toBoolean(row.storeIsActive),
        purchasePrice: row.purchasePrice !== null ? Number(row.purchasePrice) : null,
        unitPrice: row.unitPrice !== null ? Number(row.unitPrice) : null,
        currency: row.currency ?? 'TRY',
        discountPercent: row.discountPercent !== null ? Number(row.discountPercent) : null,
        discountAmount: row.discountAmount !== null ? Number(row.discountAmount) : null,
        taxPercent: row.taxPercent !== null ? Number(row.taxPercent) : null,
        taxAmount: row.taxAmount !== null ? Number(row.taxAmount) : null,
        lineTotal: row.lineTotal !== null ? Number(row.lineTotal) : null,
      }));
    }

    const activeExpr = 'COALESCE(MAX(CASE WHEN svs."isActive" = true THEN 1 ELSE 0 END), 0)';
    const qb = repo
      .createQueryBuilder('variant')
      .innerJoin('variant.product', 'product')
      .leftJoin(
        StoreVariantStock,
        'svs',
        'svs."productVariantId" = variant.id AND svs."tenantId" = :tenantId AND svs."isActiveStore" = true',
        { tenantId },
      )
      .where('product.id = :productId', { productId: product.id })
      .andWhere('product.tenantId = :tenantId', { tenantId })
      .select('variant.id', 'id')
      .addSelect('variant.name', 'name')
      .addSelect('variant.code', 'code')
      .addSelect('variant.attributes', 'attributes')
      .addSelect('variant."defaultPurchasePrice"', 'defaultPurchasePrice')
      .addSelect('variant."defaultSalePrice"', 'defaultSalePrice')
      .addSelect('variant."defaultCurrency"', 'defaultCurrency')
      .addSelect('variant."defaultDiscountPercent"', 'defaultDiscountPercent')
      .addSelect('variant."defaultDiscountAmount"', 'defaultDiscountAmount')
      .addSelect('variant."defaultTaxPercent"', 'defaultTaxPercent')
      .addSelect('variant."defaultTaxAmount"', 'defaultTaxAmount')
      .addSelect('variant."defaultLineTotal"', 'defaultLineTotal')
      .addSelect('variant."createdAt"', 'createdAt')
      .addSelect('variant."updatedAt"', 'updatedAt')
      .addSelect('variant."createdById"', 'createdById')
      .addSelect('variant."updatedById"', 'updatedById')
      .addSelect(activeExpr, 'hasActiveStoreRow')
      .groupBy('variant.id')
      .addGroupBy('variant.name')
      .addGroupBy('variant.code')
      .addGroupBy('variant.attributes')
      .addGroupBy('variant."defaultPurchasePrice"')
      .addGroupBy('variant."defaultSalePrice"')
      .addGroupBy('variant."defaultCurrency"')
      .addGroupBy('variant."defaultDiscountPercent"')
      .addGroupBy('variant."defaultDiscountAmount"')
      .addGroupBy('variant."defaultTaxPercent"')
      .addGroupBy('variant."defaultTaxAmount"')
      .addGroupBy('variant."defaultLineTotal"')
      .addGroupBy('variant."createdAt"')
      .addGroupBy('variant."updatedAt"')
      .addGroupBy('variant."createdById"')
      .addGroupBy('variant."updatedById"')
      .orderBy(activeExpr, 'DESC')
      .addOrderBy('variant."createdAt"', 'DESC');

    if (isActive !== 'all') {
      qb.having(`${activeExpr} = :activeFlag`, { activeFlag: isActive ? 1 : 0 });
    }

    const rows = await qb.getRawMany<{
      id: string;
      name: string;
      code: string;
      attributes: Record<string, any> | null;
      defaultPurchasePrice: string | null;
      defaultSalePrice: string | null;
      defaultCurrency: string | null;
      defaultDiscountPercent: string | null;
      defaultDiscountAmount: string | null;
      defaultTaxPercent: string | null;
      defaultTaxAmount: string | null;
      defaultLineTotal: string | null;
      createdAt: Date | string;
      updatedAt: Date | string;
      createdById: string | null;
      updatedById: string | null;
      hasActiveStoreRow: string;
    }>();

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      attributes: row.attributes ?? undefined,
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
      createdById: row.createdById ?? undefined,
      updatedById: row.updatedById ?? undefined,
      isActive: Number(row.hasActiveStoreRow ?? 0) > 0,
      purchasePrice: row.defaultPurchasePrice !== null ? Number(row.defaultPurchasePrice) : null,
      unitPrice: row.defaultSalePrice !== null ? Number(row.defaultSalePrice) : null,
      currency: row.defaultCurrency ?? 'TRY',
      discountPercent:
        row.defaultDiscountPercent !== null ? Number(row.defaultDiscountPercent) : null,
      discountAmount:
        row.defaultDiscountAmount !== null ? Number(row.defaultDiscountAmount) : null,
      taxPercent: row.defaultTaxPercent !== null ? Number(row.defaultTaxPercent) : null,
      taxAmount: row.defaultTaxAmount !== null ? Number(row.defaultTaxAmount) : null,
      lineTotal: row.defaultLineTotal !== null ? Number(row.defaultLineTotal) : null,
    }));
  }

  async getProductAttributeSelections(
    productId: string,
    manager?: EntityManager,
  ): Promise<{
    attributes: Array<{
      id: string;
      name: string | null;
      isActive: boolean;
      values: Array<{
        id: string;
        name: string | null;
        isActive: boolean;
      }>;
    }>;
  }> {
    const repo = this.getVariantRepo(manager);
    const product = await this.findOne(productId, manager);
    const tenantId = this.appContext.getTenantIdOrThrow();
    const tokenStoreId = this.appContext.getStoreId();

    const qb = repo
      .createQueryBuilder('variant')
      .innerJoin('variant.product', 'product')
      .innerJoin(
        StoreVariantStock,
        'svs',
        'svs."productVariantId" = variant.id AND svs."tenantId" = :tenantId AND svs."isActiveStore" = true',
        { tenantId },
      )
      .select([
        'variant.id',
        'variant.attributes',
      ])
      .where('product.id = :productId', { productId: product.id })
      .andWhere('svs."isActive" = true');

    if (tokenStoreId) {
      const store = await this.getTenantStoreOrThrow(tokenStoreId, manager);
      qb.andWhere('svs."storeId" = :storeId', { storeId: store.id });
    }

    const variants = await qb.getMany();

    const valueMap = new Map<string, Set<string>>();

    for (const variant of variants) {
      const attrs: any = variant.attributes ?? {};
      const combinationKey = attrs?.combinationKey;

      if (typeof combinationKey === 'string' && combinationKey.length > 0) {
        const pairs = combinationKey
          .split('|')
          .map((pair) => pair.trim())
          .filter((pair) => pair.length > 0);

        for (const pair of pairs) {
          const [attributeId, valueId] = pair.split(':');
          if (!attributeId || !valueId) continue;
          if (!valueMap.has(attributeId)) {
            valueMap.set(attributeId, new Set<string>());
          }
          valueMap.get(attributeId)!.add(valueId);
        }
        continue;
      }

      const legacyItems = attrs?.items;
      if (Array.isArray(legacyItems)) {
        for (const item of legacyItems) {
          const attributeId = item?.attributeId;
          const valueId = item?.valueId;
          if (typeof attributeId !== 'string' || typeof valueId !== 'string') continue;
          if (!valueMap.has(attributeId)) {
            valueMap.set(attributeId, new Set<string>());
          }
          valueMap.get(attributeId)!.add(valueId);
        }
      }
    }

    const attributeIds = Array.from(valueMap.keys());
    if (attributeIds.length === 0) {
      return { attributes: [] };
    }

    const allValueIds = Array.from(
      new Set(Array.from(valueMap.values()).flatMap((valueIds) => Array.from(valueIds))),
    );

    const attributes = await this.getAttributeRepo(manager).find({
      where: {
        id: In(attributeIds),
        tenant: { id: tenantId },
      },
    });
    const attributeById = new Map(attributes.map((attribute) => [attribute.id, attribute]));

    const values = allValueIds.length
      ? await this.getAttributeValueRepo(manager).find({
          where: {
            id: In(allValueIds),
          },
          relations: ['attribute'],
        })
      : [];
    const valueById = new Map(values.map((value) => [value.id, value]));

    return {
      attributes: attributeIds.map((attributeId) => {
        const attribute = attributeById.get(attributeId);
        const selectedValueIds = Array.from(valueMap.get(attributeId) ?? []);

        return {
          id: attributeId,
          name: attribute?.name ?? null,
          isActive: attribute?.isActive ?? false,
          values: selectedValueIds.map((valueId) => {
            const value = valueById.get(valueId);
            return {
              id: valueId,
              name: value?.name ?? null,
              isActive: value?.isActive ?? false,
            };
          }),
        };
      }),
    };
  }

  async updateVariant(
    productId: string,
    variantId: string,
    dto: UpdateVariantDto,
    manager?: EntityManager,
  ): Promise<ProductVariant> {
    const repo = this.getVariantRepo(manager);
    const tokenStoreId = this.appContext.getStoreId();
    const {
      isActive: nextIsActive,
      ...restDto
    } = dto;
    const variant = await this.findVariantByProductOrThrow(productId, variantId, manager);

    if (nextIsActive !== undefined) {
      if (tokenStoreId) {
        const store = await this.getTenantStoreOrThrow(tokenStoreId, manager);
        await this.setStoreVariantActiveState(variant.id, store.id, nextIsActive, manager);
      } else {
        await this.setTenantVariantStoresActiveState(variant.id, nextIsActive, manager);
      }
    }

    if (Object.keys(restDto).length === 0) {
      return variant;
    }

    const userId = this.appContext.getUserIdOrThrow();
    Object.assign(variant, restDto, {
      updatedById: userId,
    });

    return repo.save(variant);
  }

  async removeVariant(
    productId: string,
    variantId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const tokenStoreId = this.appContext.getStoreId();
    const variant = await this.findVariantByProductOrThrow(productId, variantId, manager);

    if (tokenStoreId) {
      const store = await this.getTenantStoreOrThrow(tokenStoreId, manager);
      await this.setStoreVariantActiveState(variant.id, store.id, false, manager);
      return;
    }

    await this.setTenantVariantStoresActiveState(variant.id, false, manager);
  }

  private async findVariantByProductOrThrow(
    productId: string,
    variantId: string,
    manager?: EntityManager,
  ): Promise<ProductVariant> {
    const repo = this.getVariantRepo(manager);
    await this.findOne(productId, manager);

    const variant = await repo.findOne({
      where: {
        id: variantId,
        product: { id: productId },
      },
    });

    if (!variant) {
      throw new NotFoundException(ProductErrors.VARIANT_NOT_FOUND);
    }

    return variant;
  }

  private async syncGeneratedVariants(
    product: Product,
    selections: ProductAttributeSelectionDto[],
    manager?: EntityManager,
  ): Promise<void> {
    const userId = this.appContext.getUserIdOrThrow();
    const variantRepo = this.getVariantRepo(manager);
    const groups = await this.resolveAttributeSelections(selections ?? [], manager);
    const combinations = this.buildCombinations(groups);

    const existingVariants = await variantRepo.find({
      where: {
        product: { id: product.id },
      },
      order: { createdAt: 'ASC' },
    });

    const existingByKey = new Map<string, ProductVariant>();
    for (const variant of existingVariants) {
      const key = (variant.attributes as any)?.combinationKey;
      if (typeof key === 'string') {
        existingByKey.set(key, variant);
      }
    }

    const assignedVariantIds = new Set<string>();
    const reservedCodes = new Set(existingVariants.map((v) => v.code));
    const storeActiveMap = await this.buildStoreActiveMapForVariants(
      existingVariants.map((variant) => variant.id),
      manager,
    );
    const storeLinkMap = await this.buildStoreLinkMapForVariants(
      existingVariants.map((variant) => variant.id),
      manager,
    );

    const tokenStoreId = this.appContext.getStoreId();
    if (tokenStoreId) {
      const scopedStore = await this.getTenantStoreOrThrow(tokenStoreId, manager);
      const allStoreIds = await this.getTenantStoreIds(manager);

      for (const storeId of allStoreIds) {
        if (!storeActiveMap.has(storeId)) {
          storeActiveMap.set(storeId, storeId === scopedStore.id);
        }
        if (!storeLinkMap.has(storeId)) {
          storeLinkMap.set(storeId, storeId === scopedStore.id);
        }
      }
    }

    for (const combination of combinations) {
      const desiredName = combination.values
        .map((v) => v.valueName.toLocaleUpperCase('tr-TR'))
        .join(' / ');
      const baseCode = this.buildVariantCodeBase(combination.values.map((v) => v.valueName));

      let target = existingByKey.get(combination.key);
      const isNewVariant = !target;
      if (!target) {
        target = variantRepo.create({
          product,
          createdById: userId,
          isActive: true,
        });
      }

      if (target.code) {
        reservedCodes.delete(target.code);
      }
      const nextCode = this.getNextUniqueCode(baseCode, reservedCodes);

      target.name = desiredName;
      target.code = nextCode;
      target.defaultCurrency = product.defaultCurrency;
      target.defaultSalePrice = product.defaultSalePrice ?? null;
      target.defaultPurchasePrice = product.defaultPurchasePrice ?? null;
      target.defaultDiscountPercent = product.defaultDiscountPercent ?? null;
      target.defaultDiscountAmount = product.defaultDiscountAmount ?? null;
      target.defaultTaxPercent = product.defaultTaxPercent ?? null;
      target.defaultTaxAmount = product.defaultTaxAmount ?? null;
      target.defaultLineTotal = product.defaultLineTotal ?? null;
      if (isNewVariant) {
        target.isActive = true;
      }
      target.updatedById = userId;
      target.attributes = {
        generated: true,
        combinationKey: combination.key,
        items: combination.values.map((value) => ({
          attributeId: value.attributeId,
          attributeName: value.attributeName,
          valueId: value.valueId,
          valueName: value.valueName,
        })),
      };

      const saved = await variantRepo.save(target);
      assignedVariantIds.add(saved.id);
      await this.ensureVariantStockRowsPerStore(
        saved.id,
        manager,
        storeActiveMap,
        storeLinkMap,
      );
    }

    for (const variant of existingVariants) {
      if (assignedVariantIds.has(variant.id)) {
        continue;
      }
      await this.setTenantVariantStoresActiveState(variant.id, false, manager);
    }
  }

  private async resolveAttributeSelections(
    selections: ProductAttributeSelectionDto[],
    manager?: EntityManager,
  ): Promise<ResolvedAttributeGroup[]> {
    if (selections.length === 0) {
      return [];
    }

    const tenantId = this.appContext.getTenantIdOrThrow();
    const attributeIds = selections.map((s) => s.id);

    if (new Set(attributeIds).size !== attributeIds.length) {
      throw new BadRequestException('Ayni attribute birden fazla kez gonderilemez');
    }

    const attributeRepo = this.getAttributeRepo(manager);
    const valueRepo = this.getAttributeValueRepo(manager);

    const attributes = await attributeRepo.find({
      where: {
        id: In(attributeIds),
        tenant: { id: tenantId },
        isActive: true,
      },
    });

    if (attributes.length !== attributeIds.length) {
      throw new BadRequestException('Gonderilen attribute id degerlerinden en az biri gecersiz');
    }

    const allValueIds = Array.from(new Set(selections.flatMap((s) => s.values)));
    if (allValueIds.length === 0) {
      throw new BadRequestException('Attribute value listesi bos olamaz');
    }

    const values = await valueRepo.find({
      where: {
        id: In(allValueIds),
        isActive: true,
        attribute: {
          tenant: { id: tenantId },
        },
      },
      relations: ['attribute'],
    });

    const attrById = new Map(attributes.map((a) => [a.id, a]));
    const valueById = new Map(values.map((v) => [v.id, v]));

    return selections.map((selection) => {
      const attribute = attrById.get(selection.id);
      if (!attribute) {
        throw new BadRequestException('Gonderilen attribute id degerlerinden en az biri gecersiz');
      }

      const distinctValueIds = Array.from(new Set(selection.values));
      if (distinctValueIds.length === 0) {
        throw new BadRequestException('Her attribute icin en az bir value secilmelidir');
      }

      const resolvedValues = distinctValueIds.map((valueId) => {
        const value = valueById.get(valueId);
        if (!value || value.attribute.id !== attribute.id) {
          throw new BadRequestException('Attribute ve value eslesmesi gecersiz');
        }

        return {
          valueId: value.id,
          valueName: value.name,
        };
      });

      return {
        attributeId: attribute.id,
        attributeName: attribute.name,
        values: resolvedValues,
      };
    });
  }

  private buildCombinations(
    groups: ResolvedAttributeGroup[],
  ): Array<{
    key: string;
    values: Array<{
      attributeId: string;
      attributeName: string;
      valueId: string;
      valueName: string;
    }>;
  }> {
    if (groups.length === 0) {
      return [];
    }

    const output: Array<{
      key: string;
      values: Array<{
        attributeId: string;
        attributeName: string;
        valueId: string;
        valueName: string;
      }>;
    }> = [];

    const walk = (
      index: number,
      acc: Array<{
        attributeId: string;
        attributeName: string;
        valueId: string;
        valueName: string;
      }>,
    ) => {
      if (index === groups.length) {
        output.push({
          key: acc.map((x) => `${x.attributeId}:${x.valueId}`).join('|'),
          values: [...acc],
        });
        return;
      }

      const group = groups[index];
      for (const value of group.values) {
        acc.push({
          attributeId: group.attributeId,
          attributeName: group.attributeName,
          valueId: value.valueId,
          valueName: value.valueName,
        });
        walk(index + 1, acc);
        acc.pop();
      }
    };

    walk(0, []);
    return output;
  }

  private buildVariantCodeBase(valueNames: string[]): string {
    const base = valueNames
      .map((name) => slugify(name).toUpperCase())
      .filter((s) => s.length > 0)
      .join('-');

    return base || 'VARIANT';
  }

  private getNextUniqueCode(baseCode: string, reservedCodes: Set<string>): string {
    let candidate = baseCode;
    let suffix = 2;

    while (reservedCodes.has(candidate)) {
      candidate = `${baseCode}-${suffix}`;
      suffix += 1;
    }

    reservedCodes.add(candidate);
    return candidate;
  }

  private async getVariantIdsByProductId(
    productId: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    const variantRows = await this.getVariantRepo(manager).find({
      select: {
        id: true,
      },
      where: {
        product: { id: productId },
      },
    });

    return variantRows.map((variant) => variant.id);
  }

  private async buildStoreActiveMapForVariants(
    variantIds: string[],
    manager?: EntityManager,
  ): Promise<Map<string, boolean>> {
    if (variantIds.length === 0) {
      return new Map();
    }

    const tenantId = this.appContext.getTenantIdOrThrow();
    const rows = await this.getStoreVariantStockRepo(manager)
      .createQueryBuilder('s')
      .select('s."storeId"', 'storeId')
      .addSelect(
        'MAX(CASE WHEN s."isActive" = true THEN 1 ELSE 0 END)',
        'hasActive',
      )
      .where('s."tenantId" = :tenantId', { tenantId })
      .andWhere('s."isActiveStore" = true')
      .andWhere('s."productVariantId" IN (:...variantIds)', { variantIds })
      .groupBy('s."storeId"')
      .getRawMany<{
        storeId: string;
        hasActive: string;
      }>();

    return new Map(
      rows.map((row) => [row.storeId, Number(row.hasActive ?? 0) > 0]),
    );
  }

  private async buildStoreLinkMapForVariants(
    variantIds: string[],
    manager?: EntityManager,
  ): Promise<Map<string, boolean>> {
    if (variantIds.length === 0) {
      return new Map();
    }

    const tenantId = this.appContext.getTenantIdOrThrow();
    const rows = await this.getStoreVariantStockRepo(manager)
      .createQueryBuilder('s')
      .select('s."storeId"', 'storeId')
      .addSelect(
        'MAX(CASE WHEN s."isActiveStore" = true THEN 1 ELSE 0 END)',
        'hasLink',
      )
      .where('s."tenantId" = :tenantId', { tenantId })
      .andWhere('s."productVariantId" IN (:...variantIds)', { variantIds })
      .groupBy('s."storeId"')
      .getRawMany<{
        storeId: string;
        hasLink: string;
      }>();

    return new Map(
      rows.map((row) => [row.storeId, Number(row.hasLink ?? 0) > 0]),
    );
  }

  private async ensureVariantStockRowsForStoreIds(
    variantId: string,
    storeIds: string[],
    manager?: EntityManager,
    storeActiveMap?: Map<string, boolean>,
    storeLinkMap?: Map<string, boolean>,
  ): Promise<void> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();
    const stockRepo = this.getStoreVariantStockRepo(manager);
    const uniqueStoreIds = Array.from(new Set(storeIds));

    if (uniqueStoreIds.length === 0) {
      return;
    }

    const existingRows = await stockRepo.find({
      where: {
        tenant: { id: tenantId },
        productVariant: { id: variantId },
        store: { id: In(uniqueStoreIds) },
      },
      relations: ['store'],
    });

    const existingStoreIds = new Set(existingRows.map((row) => row.store.id));
    for (const storeId of uniqueStoreIds) {
      if (existingStoreIds.has(storeId)) {
        continue;
      }

      const row = stockRepo.create({
        tenant: { id: tenantId } as any,
        store: { id: storeId } as any,
        productVariant: { id: variantId } as any,
        isActiveStore: storeLinkMap?.get(storeId) ?? true,
        isActive: storeActiveMap?.get(storeId) ?? true,
        quantity: 0,
        createdById: userId,
        updatedById: userId,
      });

      await stockRepo.save(row);
    }

    await this.ensureStoreProductPriceRowsForStoreIds(
      variantId,
      uniqueStoreIds,
      manager,
      storeLinkMap,
    );
  }

  private async ensureStoreProductPriceRowsForStoreIds(
    variantId: string,
    storeIds: string[],
    manager?: EntityManager,
    storeLinkMap?: Map<string, boolean>,
  ): Promise<void> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();
    const sppRepo = this.getStoreProductPriceRepo(manager);
    const uniqueStoreIds = Array.from(new Set(storeIds));

    if (uniqueStoreIds.length === 0) {
      return;
    }

    const variant = await this.getVariantRepo(manager).findOne({
      where: {
        id: variantId,
        product: { tenant: { id: tenantId } },
      },
      select: {
        id: true,
        defaultCurrency: true,
        defaultSalePrice: true,
        defaultPurchasePrice: true,
        defaultDiscountPercent: true,
        defaultDiscountAmount: true,
        defaultTaxPercent: true,
        defaultTaxAmount: true,
        defaultLineTotal: true,
      },
    });

    if (!variant) {
      throw new NotFoundException(ProductErrors.VARIANT_NOT_FOUND);
    }

    const existingRows = await sppRepo.find({
      where: {
        tenant: { id: tenantId },
        productVariant: { id: variantId },
        store: { id: In(uniqueStoreIds) },
      },
      relations: ['store'],
    });

    const existingStoreIds = new Set(existingRows.map((row) => row.store.id));
    for (const storeId of uniqueStoreIds) {
      if (existingStoreIds.has(storeId)) {
        continue;
      }

      const row = sppRepo.create({
        tenant: { id: tenantId } as any,
        store: { id: storeId } as any,
        productVariant: { id: variantId } as any,
        unitPrice: variant.defaultSalePrice ?? null,
        purchasePrice: variant.defaultPurchasePrice ?? null,
        currency: variant.defaultCurrency ?? 'TRY',
        discountPercent: variant.defaultDiscountPercent ?? null,
        discountAmount: variant.defaultDiscountAmount ?? null,
        taxPercent: variant.defaultTaxPercent ?? null,
        taxAmount: variant.defaultTaxAmount ?? null,
        lineTotal: variant.defaultLineTotal ?? null,
        isActive: storeLinkMap?.get(storeId) ?? true,
        createdById: userId,
        updatedById: userId,
      });

      await sppRepo.save(row);
    }
  }

  private async setStoreVariantActiveState(
    variantId: string,
    storeId: string,
    isActive: boolean,
    manager?: EntityManager,
  ): Promise<void> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();
    const stockRepo = this.getStoreVariantStockRepo(manager);

    await this.ensureVariantStockRowsForStoreIds(variantId, [storeId], manager);

    await stockRepo
      .createQueryBuilder()
      .update(StoreVariantStock)
      .set({
        isActive,
        isActiveStore: true,
        updatedById: userId,
      })
      .where('"tenantId" = :tenantId', { tenantId })
      .andWhere('"storeId" = :storeId', { storeId })
      .andWhere('"productVariantId" = :variantId', { variantId })
      .execute();
  }

  private async setTenantVariantStoresActiveState(
    variantId: string,
    isActive: boolean,
    manager?: EntityManager,
  ): Promise<void> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();
    const stockRepo = this.getStoreVariantStockRepo(manager);

    await this.ensureVariantStockRowsPerStore(variantId, manager);

    await stockRepo
      .createQueryBuilder()
      .update(StoreVariantStock)
      .set({
        isActive,
        updatedById: userId,
      })
      .where('"tenantId" = :tenantId', { tenantId })
      .andWhere('"isActiveStore" = true')
      .andWhere('"productVariantId" = :variantId', { variantId })
      .execute();
  }

  private async setStoreProductActiveState(
    productId: string,
    storeId: string,
    isActive: boolean,
    manager?: EntityManager,
  ): Promise<void> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();
    const stockRepo = this.getStoreVariantStockRepo(manager);
    const variantIds = await this.getVariantIdsByProductId(productId, manager);

    if (variantIds.length === 0) {
      return;
    }

    await Promise.all(
      variantIds.map((variantId) =>
        this.ensureVariantStockRowsForStoreIds(variantId, [storeId], manager),
      ),
    );

    await stockRepo
      .createQueryBuilder()
      .update(StoreVariantStock)
      .set({
        isActive,
        isActiveStore: true,
        updatedById: userId,
      })
      .where('"tenantId" = :tenantId', { tenantId })
      .andWhere('"storeId" = :storeId', { storeId })
      .andWhere('"productVariantId" IN (:...variantIds)', { variantIds })
      .execute();
  }

  private async setTenantProductStoresActiveState(
    productId: string,
    isActive: boolean,
    manager?: EntityManager,
  ): Promise<void> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();
    const stockRepo = this.getStoreVariantStockRepo(manager);
    const variantIds = await this.getVariantIdsByProductId(productId, manager);

    if (variantIds.length === 0) {
      return;
    }

    await Promise.all(
      variantIds.map((variantId) => this.ensureVariantStockRowsPerStore(variantId, manager)),
    );

    await stockRepo
      .createQueryBuilder()
      .update(StoreVariantStock)
      .set({
        isActive,
        updatedById: userId,
      })
      .where('"tenantId" = :tenantId', { tenantId })
      .andWhere('"isActiveStore" = true')
      .andWhere('"productVariantId" IN (:...variantIds)', { variantIds })
      .execute();
  }

  private async applyProductStoresScope(
    productId: string,
    storeIds: string[] | undefined,
    applyToAllStores: boolean | undefined,
    manager?: EntityManager,
  ): Promise<void> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();
    const stockRepo = this.getStoreVariantStockRepo(manager);
    const sppRepo = this.getStoreProductPriceRepo(manager);
    const variantIds = await this.getVariantIdsByProductId(productId, manager);
    if (variantIds.length === 0) {
      return;
    }

    const allStoreIds = await this.getTenantStoreIds(manager);
    const targetStoreIds = await this.resolveScopeStoreIds(
      storeIds,
      applyToAllStores,
      manager,
    );

    await Promise.all(
      variantIds.map((variantId) =>
        this.ensureVariantStockRowsForStoreIds(variantId, allStoreIds, manager),
      ),
    );

    if (targetStoreIds.length > 0) {
      await stockRepo
        .createQueryBuilder()
        .update(StoreVariantStock)
        .set({
          isActiveStore: true,
          updatedById: userId,
        })
        .where('"tenantId" = :tenantId', { tenantId })
        .andWhere('"productVariantId" IN (:...variantIds)', { variantIds })
        .andWhere('"storeId" IN (:...targetStoreIds)', { targetStoreIds })
        .execute();

      await sppRepo
        .createQueryBuilder()
        .update(StoreProductPrice)
        .set({
          isActive: true,
          updatedById: userId,
        })
        .where('"tenantId" = :tenantId', { tenantId })
        .andWhere('"productVariantId" IN (:...variantIds)', { variantIds })
        .andWhere('"storeId" IN (:...targetStoreIds)', { targetStoreIds })
        .execute();
    }

    const shouldDeactivateOtherStores =
      applyToAllStores === false || (Array.isArray(storeIds) && storeIds.length > 0);
    if (!shouldDeactivateOtherStores) {
      return;
    }

    const qb = stockRepo
      .createQueryBuilder()
      .update(StoreVariantStock)
      .set({
        isActiveStore: false,
        updatedById: userId,
      })
      .where('"tenantId" = :tenantId', { tenantId })
      .andWhere('"productVariantId" IN (:...variantIds)', { variantIds });

    if (targetStoreIds.length > 0) {
      qb.andWhere('"storeId" NOT IN (:...targetStoreIds)', { targetStoreIds });
    }

    await qb.execute();

    const priceQb = sppRepo
      .createQueryBuilder()
      .update(StoreProductPrice)
      .set({
        isActive: false,
        updatedById: userId,
      })
      .where('"tenantId" = :tenantId', { tenantId })
      .andWhere('"productVariantId" IN (:...variantIds)', { variantIds });

    if (targetStoreIds.length > 0) {
      priceQb.andWhere('"storeId" NOT IN (:...targetStoreIds)', { targetStoreIds });
    }

    await priceQb.execute();
  }

  private async ensureVariantStockRowsPerStore(
    variantId: string,
    manager?: EntityManager,
    storeActiveMap?: Map<string, boolean>,
    storeLinkMap?: Map<string, boolean>,
  ): Promise<void> {
    const storeIds = await this.getTenantStoreIds(manager);
    await this.ensureVariantStockRowsForStoreIds(
      variantId,
      storeIds,
      manager,
      storeActiveMap,
      storeLinkMap,
    );
  }
}
