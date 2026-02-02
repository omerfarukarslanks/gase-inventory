import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, DeepPartial } from 'typeorm';
import { Tenant } from './tenant.entity';
import { AppContextService } from 'src/common/context/app-context.service';
import { TenantErrors } from 'src/common/errors/tenant.errors';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly appContext: AppContextService,
  ) {}

  private getRepo(manager?: EntityManager): Repository<Tenant> {
    return manager ? manager.getRepository(Tenant) : this.tenantRepo;
  }

  async create(name: string, slug: string, manager?: EntityManager) {
    const repo = this.getRepo(manager);
    const userId = this.appContext.getUserIdOrNull();
    const exists = await this.existsByName(name, manager);

    if (exists) {
      throw new ConflictException(TenantErrors.TENANT_NAME_ALREADY_EXISTS);
    }

    const tenant = repo.create({
      name,
      slug,
      ...(userId && {
        createdById: userId,
        updatedById: userId,
      }),
    });

    return repo.save(tenant);
  }

  findById(id: string, manager?: EntityManager) {
    return this.getRepo(manager).findOne({ where: { id } });
  }

  findBySlug(slug: string, manager?: EntityManager) {
    return this.getRepo(manager).findOne({ where: { slug } });
  }

  async existsByName(name: string, manager?: EntityManager) {
    return await this.getRepo(manager).exists({ where: { name } });
  }
}
