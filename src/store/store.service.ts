import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Store } from './store.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import { AppContextService } from 'src/common/context/app-context.service';
import { slugify } from 'src/common/utils/slugify';
import { StoreErrors } from 'src/common/errors/store.errors';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { ListStoresQueryDto, PaginatedStoresResponse } from './dto/list-stores.dto';

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    private readonly appContext: AppContextService,
  ) {}

  private getRepo(manager?: EntityManager): Repository<Store> {
    return manager ? manager.getRepository(Store) : this.storeRepo;
  }

  async create(dto: CreateStoreDto, manager?: EntityManager): Promise<Store> {
    const repo = this.getRepo(manager);
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);

    await this.ensureSlugAvailable(slug, tenantId, manager);

    const store = repo.create({
      ...dto,
      slug,
      tenant: { id: tenantId } as any,
      createdById: userId,
      updatedById: userId,
    });

    return repo.save(store);
  }

  async findAll(query: ListStoresQueryDto, manager?: EntityManager): Promise<PaginatedStoresResponse> {
    const repo = this.getRepo(manager);
    const tenantId = this.appContext.getTenantIdOrThrow();
    const { page, limit, skip, search, sortBy, sortOrder, isActive } = query;

    const qb = repo
      .createQueryBuilder('store')
      .where('store.tenantId = :tenantId', { tenantId });

    if (search) {
      qb.andWhere(
        '(store.name ILIKE :search OR store.code ILIKE :search OR store.slug ILIKE :search OR store.address ILIKE :search OR store.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (isActive !== undefined && isActive !== 'all') {
      qb.andWhere('store.isActive = :isActive', { isActive });
    }

    qb.orderBy(`store.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        limit,
        page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, manager?: EntityManager): Promise<Store> {
    const repo = this.getRepo(manager);
    const tenantId = this.appContext.getTenantIdOrThrow();

    const store = await repo.findOne({
      where: { id, tenant: { id: tenantId } },
    });

    if (!store) {
      throw new NotFoundException(StoreErrors.STORE_NOT_FOUND);
    }

    return store;
  }

  async update(id: string, dto: UpdateStoreDto, manager?: EntityManager): Promise<Store> {
    const repo = this.getRepo(manager);
    const store = await this.findOne(id, manager);
    const userId = this.appContext.getUserIdOrThrow();
    const tenantId = this.appContext.getTenantIdOrThrow();

    if (dto.slug || dto.name) {
      const newSlug = dto.slug ? slugify(dto.slug) : (dto.name ? slugify(dto.name) : store.slug);
      if (newSlug !== store.slug) {
        await this.ensureSlugAvailable(newSlug!, tenantId, manager);
        store.slug = newSlug;
      }
    }

    Object.assign(store, dto, { updatedById: userId });
    if (dto.slug) store.slug = slugify(dto.slug);

    return repo.save(store);
  }

  async remove(id: string, manager?: EntityManager): Promise<void> {
    const repo = this.getRepo(manager);
    const store = await this.findOne(id, manager);
    const userId = this.appContext.getUserIdOrThrow();

    store.isActive = false;
    store.updatedById = userId;

    await repo.save(store);
  }

  // --- Mevcut yardımcı metodlar ---

  async createDefaultStoreForTenant(tenant: Tenant, name = 'Merkez Mağaza', manager?: EntityManager) {
    const repo = this.getRepo(manager);
    const userId = this.appContext.getUserIdOrNull();
    const slug = slugify(name);

    await this.ensureSlugAvailable(slug, tenant.id, manager);

    const store = repo.create({
      tenant,
      name,
      slug,
      code: 'MAIN',
      ...(userId && {
        createdById: userId,
        updatedById: userId,
      }),
    });

    return repo.save(store);
  }

  findById(id: string, manager?: EntityManager) {
    const repo = this.getRepo(manager);
    const store = repo.findOne({ where: { id } });

    if (!store) {
      throw new NotFoundException(StoreErrors.STORE_NOT_FOUND);
    }
    return store;
  }

  findByTenant(tenantId: string, manager?: EntityManager) {
    const repo = this.getRepo(manager);
    const store = repo.find({
      where: {
        tenant: { id: tenantId },
      },
    });

    if (!store) {
      throw new NotFoundException(StoreErrors.STORE_NOT_IN_TENANT);
    }

    return store;
  }

  async ensureSlugAvailable(slug: string, tenantId: string, manager?: EntityManager) {
    const repo = this.getRepo(manager);
    const exists = await repo.exists({
      where: {
        slug,
        tenant: { id: tenantId },
      },
    });

    if (exists) {
      throw new ConflictException(StoreErrors.STORE_SLUG_IN_USE);
    }
  }
}
