import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

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

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    private readonly appContext: AppContextService,
    private readonly dataSource: DataSource,
  ) {}

  private getProductRepo(manager?: EntityManager): Repository<Product> {
    return manager ? manager.getRepository(Product) : this.productRepo;
  }

  private getVariantRepo(manager?: EntityManager): Repository<ProductVariant> {
    return manager ? manager.getRepository(ProductVariant) : this.variantRepo;
  }

  async createProduct(dto: CreateProductDto, manager?: EntityManager): Promise<Product> {
    const repo = this.getProductRepo(manager);
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();

    const product = repo.create({
      ...dto,
      tenant: { id: tenantId } as any,
      defaultCurrency: dto.defaultCurrency ?? 'TRY',
      createdById: userId,
      updatedById: userId,
    });

    return repo.save(product);
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
        'product.defaultBarcode',
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
        'product.defaultBarcode',
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

  async addVariants(
    productId: string,
    dtos: CreateVariantDto[],
    manager?: EntityManager,
  ): Promise<ProductVariant[]> {
    if (manager) {
      return this.addVariantsInternal(productId, dtos, manager);
    }

    return this.dataSource.transaction((txManager) =>
      this.addVariantsInternal(productId, dtos, txManager),
    );
  }

  private async addVariantsInternal(
    productId: string,
    dtos: CreateVariantDto[],
    manager: EntityManager,
  ): Promise<ProductVariant[]> {
    const variantRepo = this.getVariantRepo(manager);
    const product = await this.findOne(productId, manager);

    const variants = dtos.map((dto) =>
      variantRepo.create({
        ...dto,
        product,
      }),
    );
    return variantRepo.save(variants);
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
      order: { createdAt: 'DESC' },
    });

    return variants;
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
}
