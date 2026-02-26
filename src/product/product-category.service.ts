import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductCategory } from './product-category.entity';
import { AppContextService } from 'src/common/context/app-context.service';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { slugify } from 'src/common/utils/slugify';

@Injectable()
export class ProductCategoryService {
  constructor(
    @InjectRepository(ProductCategory)
    private readonly categoryRepo: Repository<ProductCategory>,
    private readonly appContext: AppContextService,
  ) {}

  async create(dto: CreateProductCategoryDto): Promise<ProductCategory> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();

    const slug = dto.slug ?? slugify(dto.name);

    if (dto.parentId) {
      await this.findOneOrThrow(dto.parentId);
    }

    const category = this.categoryRepo.create({
      tenant: { id: tenantId } as any,
      name: dto.name,
      slug,
      description: dto.description,
      isActive: dto.isActive ?? true,
      parent: dto.parentId ? ({ id: dto.parentId } as any) : null,
      createdById: userId,
      updatedById: userId,
    });

    return this.categoryRepo.save(category);
  }

  async findAll(includeInactive = false): Promise<ProductCategory[]> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const qb = this.categoryRepo
      .createQueryBuilder('cat')
      .leftJoinAndSelect('cat.parent', 'parent')
      .where('cat.tenantId = :tenantId', { tenantId })
      .orderBy('cat.name', 'ASC');

    if (!includeInactive) {
      qb.andWhere('cat.isActive = true');
    }

    return qb.getMany();
  }

  async findTree(): Promise<ProductCategory[]> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const all = await this.categoryRepo.find({
      where: { tenant: { id: tenantId }, isActive: true },
      relations: ['parent'],
      order: { name: 'ASC' },
    });

    // Kök kategorileri bul, children dizisini doldur
    const map = new Map<string, ProductCategory & { children: ProductCategory[] }>();
    for (const cat of all) {
      map.set(cat.id, { ...cat, children: [] });
    }

    const roots: (ProductCategory & { children: ProductCategory[] })[] = [];
    for (const cat of all) {
      const node = map.get(cat.id)!;
      if (cat.parentId) {
        const parent = map.get(cat.parentId);
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async findOneOrThrow(id: string): Promise<ProductCategory> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const category = await this.categoryRepo.findOne({
      where: { id, tenant: { id: tenantId } },
      relations: ['parent'],
    });

    if (!category) {
      throw new NotFoundException(`Kategori ${id} bulunamadı.`);
    }

    return category;
  }

  async update(id: string, dto: UpdateProductCategoryDto): Promise<ProductCategory> {
    const userId = this.appContext.getUserIdOrThrow();
    const category = await this.findOneOrThrow(id);

    if (dto.parentId !== undefined) {
      if (dto.parentId === null) {
        category.parent = null;
      } else {
        if (dto.parentId === id) {
          throw new BadRequestException('Bir kategori kendisinin alt kategorisi olamaz.');
        }
        const parent = await this.findOneOrThrow(dto.parentId);
        category.parent = parent;
      }
    }

    if (dto.name !== undefined) {
      category.name = dto.name;
      if (!dto.slug) category.slug = slugify(dto.name);
    }
    if (dto.slug !== undefined) category.slug = dto.slug;
    if (dto.description !== undefined) category.description = dto.description;
    if (dto.isActive !== undefined) category.isActive = dto.isActive;
    category.updatedById = userId;

    return this.categoryRepo.save(category);
  }

  async remove(id: string): Promise<void> {
    const userId = this.appContext.getUserIdOrThrow();
    const category = await this.findOneOrThrow(id);
    category.isActive = false;
    category.updatedById = userId;
    await this.categoryRepo.save(category);
  }
}
