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
  PaginatedProductsResponse,
} from './dto/list-products.dto';
import { ListVariantsDto } from './dto/list-variants.dto';
import { Attribute } from 'src/attribute/entity/attribute.entity';
import { AttributeValue } from 'src/attribute/entity/attribute-value.entity';
import { ProductAttributeSelectionDto } from './dto/product-attribute-selection.dto';
import { slugify } from 'src/common/utils/slugify';
import { Store } from 'src/store/store.entity';
import { StoreVariantStock } from 'src/inventory/store-variant-stock.entity';

type ResolvedAttributeGroup = {
  attributeId: string;
  attributeName: string;
  values: { valueId: string; valueName: string }[];
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

  async createProduct(dto: CreateProductDto, manager?: EntityManager): Promise<Product> {
    const repo = this.getProductRepo(manager);
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();
    const { attributes, ...productPayload } = dto;

    const product = repo.create({
      ...productPayload,
      tenant: { id: tenantId } as any,
      defaultCurrency: dto.defaultCurrency ?? 'TRY',
      createdById: userId,
      updatedById: userId,
    });
    const saved = await repo.save(product);

    if (Array.isArray(attributes) && attributes.length > 0) {
      await this.syncGeneratedVariants(saved, attributes, manager);
    }

    return saved;
  }

  async findAll(
    query: ListProductsDto,
    manager?: EntityManager,
  ): Promise<PaginatedProductsResponse> {
    const repo = this.getProductRepo(manager);
    const tenantId = this.appContext.getTenantIdOrThrow();
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
    } = query;

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
        'product.defaultTaxPercent',
        'product.isActive',
        'product.createdAt',
        'product.updatedAt',
      ])
      .where('product.tenantId = :tenantId', { tenantId })
      .orderBy(`product.${sortBy}`, sortOrder)
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

    if (isActive !== undefined && isActive !== 'all') {
      qb.andWhere('product.isActive = :isActive', { isActive });
    }

    const countQb = qb.clone();
    const total = await countQb.getCount();
    const products = await qb.getMany();

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
        'product.defaultTaxPercent',
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

    return product;
  }

  async update(id: string, dto: UpdateProductDto, manager?: EntityManager): Promise<Product> {
    const repo = this.getProductRepo(manager);
    const product = await this.findOne(id, manager);
    const userId = this.appContext.getUserIdOrThrow();

    Object.assign(product, dto, {
      updatedById: userId,
    });
    return repo.save(product);
  }

  async remove(id: string, manager?: EntityManager): Promise<void> {
    const repo = this.getProductRepo(manager);
    const product = await this.findOne(id, manager);
    const userId = this.appContext.getUserIdOrThrow();

    product.isActive = false;
    product.updatedById = userId;
    await repo.save(product);
  }

  // ---------- Variant işlemleri ----------

  async syncVariants(
    productId: string,
    dto: CreateVariantDto,
    manager?: EntityManager,
  ): Promise<ProductVariant[]> {
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
  ): Promise<ProductVariant[]> {
    const product = await this.findOne(productId, manager);
    await this.syncGeneratedVariants(product, dto.attributes, manager);
    return this.listVariants(productId, { isActive: 'all' } as ListVariantsDto, manager);
  }

  async listVariants(
    productId: string,
    query?: ListVariantsDto,
    manager?: EntityManager,
  ): Promise<ProductVariant[]> {
    const repo = this.getVariantRepo(manager);
    const product = await this.findOne(productId, manager);
    const isActive = query?.isActive ?? 'all';
    const where: any = {
      product: { id: product.id },
    };

    if (isActive !== 'all') {
      where.isActive = isActive;
    }
    const variants = await repo.find({
      select: {
        id: true,
        name: true,
        code: true,
        barcode: true,
        attributes: true,
        createdAt: true,
        updatedAt: true,
        createdById: true,
        updatedById: true,
        isActive: true,
      },
      where,
      order: { isActive: 'DESC', createdAt: 'DESC' },
    });

    return variants;
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

    const variants = await repo.find({
      select: {
        id: true,
        attributes: true,
        isActive: true,
      },
      where: {
        product: { id: product.id },
        isActive: true,
      },
    });

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
    const userId = this.appContext.getUserIdOrThrow();
    const variant = await this.findVariantByProductOrThrow(productId, variantId, manager);

    Object.assign(variant, dto, {
      updatedById: userId,
    });

    return repo.save(variant);
  }

  async removeVariant(
    productId: string,
    variantId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = this.getVariantRepo(manager);
    const userId = this.appContext.getUserIdOrThrow();
    const variant = await this.findVariantByProductOrThrow(productId, variantId, manager);

    variant.isActive = false;
    variant.updatedById = userId;
    await repo.save(variant);
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
      target.defaultTaxPercent = product.defaultTaxPercent ?? null;
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
      await this.ensureVariantStockRowsPerStore(saved.id, manager);
    }

    for (const variant of existingVariants) {
      if (assignedVariantIds.has(variant.id)) {
        continue;
      }
      if (!variant.isActive) {
        continue;
      }
      variant.isActive = false;
      variant.updatedById = userId;
      await variantRepo.save(variant);
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

  private async ensureVariantStockRowsPerStore(
    variantId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();
    const storeRepo = this.getStoreRepo(manager);
    const stockRepo = this.getStoreVariantStockRepo(manager);

    const stores = await storeRepo.find({
      where: {
        tenant: { id: tenantId },
        isActive: true,
      },
      select: { id: true },
    });

    if (stores.length === 0) {
      return;
    }

    const storeIds = stores.map((store) => store.id);
    const existingRows = await stockRepo.find({
      where: {
        tenant: { id: tenantId },
        productVariant: { id: variantId },
        store: { id: In(storeIds) },
      },
      relations: ['store'],
    });

    const existingStoreIds = new Set(existingRows.map((row) => row.store.id));
    for (const store of stores) {
      if (existingStoreIds.has(store.id)) {
        continue;
      }

      const row = stockRepo.create({
        tenant: { id: tenantId } as any,
        store: { id: store.id } as any,
        productVariant: { id: variantId } as any,
        quantity: 0,
        createdById: userId,
        updatedById: userId,
      });

      await stockRepo.save(row);
    }
  }
}
