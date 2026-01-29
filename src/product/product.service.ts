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

  async createProduct(dto: CreateProductDto, manager?: EntityManager): Promise<Product> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();
    const repo = manager ? manager.getRepository(Product) : this.productRepo;

    const product = repo.create({
      ...dto,
      tenant: { id: tenantId } as any, // relation by id
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
    const tenantId = this.appContext.getTenantIdOrThrow();
    const repo = manager ? manager.getRepository(Product) : this.productRepo;

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
    const tenantId = this.appContext.getTenantIdOrThrow();
    const repo = manager ? manager.getRepository(Product) : this.productRepo;

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
    const product = await this.findOne(id, manager); // tenant filter dahil
    const userId = this.appContext.getUserIdOrThrow();
    const repo = manager ? manager.getRepository(Product) : this.productRepo;

    Object.assign(product, dto, {
      updatedById: userId,
    });
    return repo.save(product);
  }

  async remove(id: string, manager?: EntityManager): Promise<void> {
    const product = await this.findOne(id, manager);
    await (manager ? manager.getRepository(Product) : this.productRepo).remove(product);
  }

  // ---------- Variant işlemleri ----------

  async addVariant(
    productId: string,
    dto: CreateVariantDto,
  ): Promise<ProductVariant> {
    return this.dataSource.transaction(async (manager) => {

      const variantRepo = manager.getRepository(ProductVariant);
      const product = await this.findOne(productId, manager); // tenant filter dahil

      const variant = variantRepo.create({
        ...dto,
        product,
      });
      return variantRepo.save(variant);
    });
  }

  async listVariants(productId: string): Promise<ProductVariant[]> {
    const product = await this.findOne(productId); // tenant filter dahil
    const variant = this.variantRepo.find({
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
