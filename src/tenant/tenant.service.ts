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

  async create(name: string, slug: string, manager?: EntityManager) {
    
    const repo:Repository<Tenant> = manager ? manager.getRepository(Tenant) : this.tenantRepo;

    // actorUserId verilmişse onu kullan, yoksa context'ten al (login-required senaryolar için)
    const userId = this.appContext.getUserIdOrNull();
    const exists = await this.existsByName(name);
    
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
    const repo: Repository<Tenant> = manager ? manager.getRepository(Tenant) : this.tenantRepo;
    return repo.findOne({ where: { id } });
  }

  findBySlug(slug: string, manager?: EntityManager) {
    const repo: Repository<Tenant> = manager ? manager.getRepository(Tenant) : this.tenantRepo;
    return repo.findOne({ where: { slug } });
  }

  async existsByName(name: string, manager?: EntityManager) {
    const repo: Repository<Tenant> = manager ? manager.getRepository(Tenant) : this.tenantRepo;
    return await repo.exists({ where: { name } });
  }
}
