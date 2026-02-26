import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Customer } from './customer.entity';
import { AppContextService } from 'src/common/context/app-context.service';
import { CustomerErrors } from 'src/common/errors/customer.errors';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import {
  ListCustomersQueryDto,
  PaginatedCustomersResponse,
} from './dto/list-customers.dto';

export interface CustomerBalanceSummary {
  customerId: string;
  customerName: string;
  /** Onaylı satış adedi */
  totalSalesCount: number;
  /** Onaylı satışların toplam tutarı */
  totalSaleAmount: number;
  /** Yapılan ödemelerin toplam tutarı (baz para birimi) */
  totalPaidAmount: number;
  /** İadelerin toplam tutarı */
  totalReturnAmount: number;
  /** Kalan borç = totalSaleAmount - totalPaidAmount - totalReturnAmount */
  balance: number;
}

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    private readonly appContext: AppContextService,
    private readonly dataSource: DataSource,
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

  /**
   * Müşterinin cari bakiyesini hesaplar:
   * toplam satış - toplam ödeme - toplam iade = kalan borç
   */
  async getCustomerBalance(customerId: string): Promise<CustomerBalanceSummary> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const customer = await this.findOne(customerId);

    // Onaylı satışlar: toplam tutar ve adet
    const salesRow = await this.dataSource.query<{ count: string; total: string }[]>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(s."lineTotal"), 0) AS total
       FROM sales s
       WHERE s."tenantId" = $1
         AND s."customerId" = $2
         AND s.status = 'CONFIRMED'`,
      [tenantId, customerId],
    );

    // Ödemeler: baz para biriminde toplam (ACTIVE + UPDATED)
    const paymentsRow = await this.dataSource.query<{ total: string }[]>(
      `SELECT COALESCE(SUM(
         CASE
           WHEN COALESCE(p."amountInBaseCurrency", 0) > 0
             THEN p."amountInBaseCurrency"
           ELSE COALESCE(p.amount, 0) * COALESCE(NULLIF(p."exchangeRate", 0), 1)
         END
       ), 0) AS total
       FROM sale_payments p
       INNER JOIN sales s ON s.id = p."saleId"
       WHERE s."tenantId" = $1
         AND s."customerId" = $2
         AND s.status = 'CONFIRMED'
         AND p.status IN ('ACTIVE', 'UPDATED')`,
      [tenantId, customerId],
    );

    // İadeler: toplam iade tutarı
    const returnsRow = await this.dataSource.query<{ total: string }[]>(
      `SELECT COALESCE(SUM(sr."totalRefundAmount"), 0) AS total
       FROM sale_returns sr
       INNER JOIN sales s ON s.id = sr."saleId"
       WHERE sr."tenantId" = $1
         AND s."customerId" = $2`,
      [tenantId, customerId],
    );

    const totalSaleAmount = Number(salesRow[0]?.total ?? 0);
    const totalPaidAmount = Number(paymentsRow[0]?.total ?? 0);
    const totalReturnAmount = Number(returnsRow[0]?.total ?? 0);

    return {
      customerId,
      customerName: `${customer.name}${customer.surname ? ' ' + customer.surname : ''}`,
      totalSalesCount: Number(salesRow[0]?.count ?? 0),
      totalSaleAmount,
      totalPaidAmount,
      totalReturnAmount,
      balance: Math.max(0, totalSaleAmount - totalPaidAmount - totalReturnAmount),
    };
  }
}
