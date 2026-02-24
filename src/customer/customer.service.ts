import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Customer } from './customer.entity';
import { AppContextService } from 'src/common/context/app-context.service';
import { CustomerErrors } from 'src/common/errors/customer.errors';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import {
  ListCustomersQueryDto,
  PaginatedCustomersResponse,
} from './dto/list-customers.dto';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    private readonly appContext: AppContextService,
  ) {}

  private getRepo(manager?: EntityManager): Repository<Customer> {
    return manager ? manager.getRepository(Customer) : this.customerRepo;
  }

  async create(dto: CreateCustomerDto, manager?: EntityManager): Promise<Customer> {
    const repo = this.getRepo(manager);
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();

    const customer = repo.create({
      ...dto,
      tenant: { id: tenantId } as any,
      createdById: userId,
      updatedById: userId,
    });

    return repo.save(customer);
  }

  async findAll(
    query: ListCustomersQueryDto,
    manager?: EntityManager,
  ): Promise<PaginatedCustomersResponse | { data: Customer[]; total: number }> {
    const repo = this.getRepo(manager);
    const tenantId = this.appContext.getTenantIdOrThrow();
    const { search, sortBy, sortOrder, isActive } = query;

    const qb = repo
      .createQueryBuilder('customer')
      .where('customer.tenantId = :tenantId', { tenantId });

    if (search?.trim()) {
      qb.andWhere(
        '(customer.name ILIKE :search OR customer.surname ILIKE :search OR customer.phoneNumber ILIKE :search OR customer.email ILIKE :search OR customer.city ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    if (isActive !== undefined && isActive !== 'all') {
      qb.andWhere('customer.isActive = :isActive', { isActive });
    }

    qb.orderBy(`customer.${sortBy ?? 'createdAt'}`, sortOrder ?? 'DESC');

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

  async findOne(id: string, manager?: EntityManager): Promise<Customer> {
    const repo = this.getRepo(manager);
    const tenantId = this.appContext.getTenantIdOrThrow();

    const customer = await repo.findOne({
      where: { id, tenant: { id: tenantId } },
    });

    if (!customer) {
      throw new NotFoundException(CustomerErrors.CUSTOMER_NOT_FOUND);
    }

    return customer;
  }

  async update(
    id: string,
    dto: UpdateCustomerDto,
    manager?: EntityManager,
  ): Promise<Customer> {
    const repo = this.getRepo(manager);
    const customer = await this.findOne(id, manager);
    const userId = this.appContext.getUserIdOrThrow();

    Object.assign(customer, dto, { updatedById: userId });

    return repo.save(customer);
  }

  async remove(id: string, manager?: EntityManager): Promise<void> {
    const repo = this.getRepo(manager);
    const customer = await this.findOne(id, manager);
    const userId = this.appContext.getUserIdOrThrow();

    customer.isActive = false;
    customer.updatedById = userId;

    await repo.save(customer);
  }
}
