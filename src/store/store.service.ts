import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Store } from './store.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import { AppContextService } from 'src/common/context/app-context.service';
import { slugify } from 'src/common/utils/slugify';
import { StoreErrors } from 'src/common/errors/store.errors';

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    private readonly appContext: AppContextService,
  ) {}

  async createDefaultStoreForTenant(tenant: Tenant, name = 'Merkez Mağaza', manager?: EntityManager) {
    const userId = this.appContext.getUserIdOrNull();
    const repo = manager ? manager.getRepository(Store) : this.storeRepo;
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
    const repo: Repository<Store> = manager ? manager.getRepository(Store) : this.storeRepo;
    const store = repo.findOne({ where: { id } });

    if (!store) {
      throw new NotFoundException(StoreErrors.STORE_NOT_FOUND);
    }
    return store; 
  }

  findByTenant(tenantId: string, manager?: EntityManager) {
    const repo: Repository<Store> = manager ? manager.getRepository(Store) : this.storeRepo;
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
    const repo: Repository<Store> = manager ? manager.getRepository(Store) : this.storeRepo;
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
