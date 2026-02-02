import {
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
import { AppContextService } from 'src/common/context/app-context.service';
import { ProductErrors } from 'src/common/errors/product.errors';
import {
  ListProductsQueryDto,
  PaginatedProductsResponse,
} from './dto/list-products.dto';

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
    query: ListProductsQueryDto,
    manager?: EntityManager,
  ): Promise<PaginatedProductsResponse> {
    const repo = this.getProductRepo(manager);
    const tenantId = this.appContext.getTenantIdOrThrow();

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
      .orderBy('product.createdAt', 'DESC')
      .skip(query.offset)
      .take(query.limit)
      .loadRelationCountAndMap('product.variantCount', 'product.variants');

    if (query.cursor) {
      qb.andWhere('product.createdAt < :cursor', {
        cursor: new Date(query.cursor),
      });
    }

    const [products, total] = await qb.getManyAndCount();

    return {
      data: products,
      meta: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + products.length < total,
        cursor: query.cursor,
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
    await repo.remove(product);
  }

  // ---------- Variant işlemleri ----------

  async addVariant(
    productId: string,
    dto: CreateVariantDto,
    manager?: EntityManager,
  ): Promise<ProductVariant> {
    if (manager) {
      return this.addVariantInternal(productId, dto, manager);
    }

    return this.dataSource.transaction((txManager) =>
      this.addVariantInternal(productId, dto, txManager),
    );
  }

  private async addVariantInternal(
    productId: string,
    dto: CreateVariantDto,
    manager: EntityManager,
  ): Promise<ProductVariant> {
    const variantRepo = this.getVariantRepo(manager);
    const product = await this.findOne(productId, manager);

    const variant = variantRepo.create({
      ...dto,
      product,
    });
    return variantRepo.save(variant);
  }

  async listVariants(productId: string, manager?: EntityManager): Promise<ProductVariant[]> {
    const repo = this.getVariantRepo(manager);
    const product = await this.findOne(productId, manager);
    const variant = repo.find({
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
      where: { product: { id: product.id } },
      order: { createdAt: 'DESC' },
    });

    if (!variant) {
      throw new NotFoundException(ProductErrors.VARIANT_NOT_FOUND);
    }

    return variant;
  }
}
