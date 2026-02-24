import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Supplier } from './supplier.entity';
import { AppContextService } from 'src/common/context/app-context.service';
import { SupplierErrors } from 'src/common/errors/supplier.errors';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { ListSuppliersQueryDto, PaginatedSuppliersResponse } from './dto/list-suppliers.dto';

@Injectable()
export class SupplierService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    private readonly appContext: AppContextService,
  ) {}

  private getRepo(manager?: EntityManager): Repository<Supplier> {
    return manager ? manager.getRepository(Supplier) : this.supplierRepo;
  }

  async create(dto: CreateSupplierDto, manager?: EntityManager): Promise<Supplier> {
    const repo = this.getRepo(manager);
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();

    const supplier = repo.create({
      ...dto,
      tenant: { id: tenantId } as any,
      createdById: userId,
      updatedById: userId,
    });

    return repo.save(supplier);
  }

  async findAll(
    query: ListSuppliersQueryDto,
    manager?: EntityManager,
  ): Promise<PaginatedSuppliersResponse | { data: Supplier[]; total: number }> {
    const repo = this.getRepo(manager);
    const tenantId = this.appContext.getTenantIdOrThrow();
    const { search, sortBy, sortOrder, isActive } = query;

    const qb = repo
      .createQueryBuilder('supplier')
      .where('supplier.tenantId = :tenantId', { tenantId });

    if (search?.trim()) {
      qb.andWhere(
        '(supplier.name ILIKE :search OR supplier.surname ILIKE :search OR supplier.phoneNumber ILIKE :search OR supplier.email ILIKE :search OR supplier.address ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    if (isActive !== undefined && isActive !== 'all') {
      qb.andWhere('supplier.isActive = :isActive', { isActive });
    }

    qb.orderBy(`supplier.${sortBy ?? 'createdAt'}`, sortOrder ?? 'DESC');

    if (!query.hasPagination) {
      const data = await qb.getMany();
      return { data, total: data.length };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    qb.skip(query.skip).take(limit);

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

  async findOne(id: string, manager?: EntityManager): Promise<Supplier> {
    const repo = this.getRepo(manager);
    const tenantId = this.appContext.getTenantIdOrThrow();

    const supplier = await repo.findOne({
      where: { id, tenant: { id: tenantId } },
    });

    if (!supplier) {
      throw new NotFoundException(SupplierErrors.SUPPLIER_NOT_FOUND);
    }

    return supplier;
  }

  async update(
    id: string,
    dto: UpdateSupplierDto,
    manager?: EntityManager,
  ): Promise<Supplier> {
    const repo = this.getRepo(manager);
    const supplier = await this.findOne(id, manager);
    const userId = this.appContext.getUserIdOrThrow();

    Object.assign(supplier, dto, { updatedById: userId });

    return repo.save(supplier);
  }

  async remove(id: string, manager?: EntityManager): Promise<void> {
    const repo = this.getRepo(manager);
    const supplier = await this.findOne(id, manager);
    const userId = this.appContext.getUserIdOrThrow();

    supplier.isActive = false;
    supplier.updatedById = userId;

    await repo.save(supplier);
  }
}
