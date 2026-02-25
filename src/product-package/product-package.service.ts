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

@Injectable()
export class ProductPackageService {
  constructor(
    @InjectRepository(ProductPackage)
    private readonly packageRepo: Repository<ProductPackage>,

    @InjectRepository(ProductPackageItem)
    private readonly itemRepo: Repository<ProductPackageItem>,

    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,

    private readonly appContext: AppContextService,
    private readonly inventoryService: InventoryService,
  ) {}

  // ---- CRUD ----

  async create(dto: CreatePackageDto): Promise<ProductPackage> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();

    await this.validateVariantsBelongToTenant(
      dto.items.map((i) => i.productVariantId),
      tenantId,
    );

    const pkg = this.packageRepo.create({
      tenant: { id: tenantId } as any,
      name: dto.name,
      code: dto.code,
      description: dto.description,
      defaultSalePrice: dto.defaultSalePrice,
      defaultPurchasePrice: dto.defaultPurchasePrice,
      defaultTaxPercent: dto.defaultTaxPercent,
      defaultDiscountPercent: dto.defaultDiscountPercent,
      defaultCurrency: dto.defaultCurrency ?? 'TRY',
      isActive: dto.isActive ?? true,
      createdById: userId,
      updatedById: userId,
      items: dto.items.map((i) =>
        this.itemRepo.create({
          productVariant: { id: i.productVariantId } as any,
          quantity: i.quantity,
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
      .where('pkg.tenantId = :tenantId', { tenantId });

    // isActive filtresi
    if (query.isActive !== 'all') {
      qb.andWhere('pkg.isActive = :isActive', { isActive: query.isActive ?? true });
    }

    // Arama
    if (query.search?.trim()) {
      qb.andWhere('(pkg.name ILIKE :search OR pkg.code ILIKE :search)', {
        search: `%${query.search.trim()}%`,
      });
    }

    // Sıralama
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
    if (dto.defaultSalePrice !== undefined) pkg.defaultSalePrice = dto.defaultSalePrice;
    if (dto.defaultPurchasePrice !== undefined) pkg.defaultPurchasePrice = dto.defaultPurchasePrice;
    if (dto.defaultTaxPercent !== undefined) pkg.defaultTaxPercent = dto.defaultTaxPercent;
    if (dto.defaultDiscountPercent !== undefined) pkg.defaultDiscountPercent = dto.defaultDiscountPercent;
    if (dto.defaultCurrency !== undefined) pkg.defaultCurrency = dto.defaultCurrency;
    if (dto.isActive !== undefined) pkg.isActive = dto.isActive;
    pkg.updatedById = userId;

    if (dto.items !== undefined) {
      await this.validateVariantsBelongToTenant(
        dto.items.map((i) => i.productVariantId),
        tenantId,
      );
      // Full-replace: sil ve yeniden yaz
      await this.itemRepo.delete({ productPackage: { id: pkg.id } });
      pkg.items = dto.items.map((i) =>
        this.itemRepo.create({
          productVariant: { id: i.productVariantId } as any,
          quantity: i.quantity,
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
    });
    if (!pkg) {
      throw new NotFoundException(`ProductPackage ${packageId} bulunamadı.`);
    }
    if (!pkg.items || pkg.items.length === 0) {
      throw new BadRequestException(`Paket ${packageId} içinde hiç variant tanımlanmamış.`);
    }
    return pkg;
  }

  private async validateVariantsBelongToTenant(
    variantIds: string[],
    tenantId: string,
  ): Promise<void> {
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
  }
}
