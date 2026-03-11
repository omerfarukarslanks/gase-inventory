import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CustomerGroup } from './entities/customer-group.entity';
import { CustomerCreditLimit } from './entities/customer-credit-limit.entity';
import { PaymentTerm } from './entities/payment-term.entity';
import { PriceListEntry } from './entities/price-list-entry.entity';
import { AppContextService } from 'src/common/context/app-context.service';

// ---- DTOs ----
export interface CreateCustomerGroupDto { name: string; description?: string; }
export interface UpdateCustomerGroupDto { name?: string; description?: string; isActive?: boolean; }

export interface UpsertCreditLimitDto {
  creditLimit: number;
  currency?: string;
  warningThresholdPercent?: number;
}

export interface CreatePaymentTermDto {
  customerId?: string;
  customerGroupId?: string;
  netDays: number;
  discountDays?: number;
  discountPercent?: number;
  description?: string;
}
export interface UpdatePaymentTermDto {
  netDays?: number;
  discountDays?: number;
  discountPercent?: number;
  description?: string;
  isActive?: boolean;
}

export interface UpsertPriceListEntryDto {
  productVariantId: string;
  price: number;
  currency?: string;
  validFrom?: string;
  validUntil?: string;
}

@Injectable()
export class TradeService {
  constructor(
    @InjectRepository(CustomerGroup)
    private readonly groupRepo: Repository<CustomerGroup>,
    @InjectRepository(CustomerCreditLimit)
    private readonly creditRepo: Repository<CustomerCreditLimit>,
    @InjectRepository(PaymentTerm)
    private readonly termRepo: Repository<PaymentTerm>,
    @InjectRepository(PriceListEntry)
    private readonly priceListRepo: Repository<PriceListEntry>,
    private readonly appContext: AppContextService,
  ) {}

  // ---- Helpers ----
  private tenantId(): string { return this.appContext.getTenantIdOrThrow(); }
  private userId(): string { return this.appContext.getUserIdOrThrow(); }

  private async findGroupOrThrow(id: string): Promise<CustomerGroup> {
    const group = await this.groupRepo.findOne({
      where: { id, tenant: { id: this.tenantId() } },
    });
    if (!group) throw new NotFoundException(`Müşteri grubu bulunamadı: ${id}`);
    return group;
  }

  // ── Customer Groups ───────────────────────────────────────────────────────

  async createGroup(dto: CreateCustomerGroupDto): Promise<CustomerGroup> {
    const group = this.groupRepo.create({
      tenant: { id: this.tenantId() } as any,
      name: dto.name,
      description: dto.description,
      createdById: this.userId(),
      updatedById: this.userId(),
    });
    return this.groupRepo.save(group);
  }

  async listGroups(): Promise<CustomerGroup[]> {
    return this.groupRepo.find({
      where: { tenant: { id: this.tenantId() } },
      order: { name: 'ASC' },
    });
  }

  async getGroup(id: string): Promise<CustomerGroup> {
    return this.findGroupOrThrow(id);
  }

  async updateGroup(id: string, dto: UpdateCustomerGroupDto): Promise<CustomerGroup> {
    const group = await this.findGroupOrThrow(id);
    Object.assign(group, dto);
    group.updatedById = this.userId();
    return this.groupRepo.save(group);
  }

  async deleteGroup(id: string): Promise<void> {
    await this.findGroupOrThrow(id);
    await this.groupRepo.delete(id);
  }

  // ── Credit Limits ─────────────────────────────────────────────────────────

  async upsertCreditLimit(customerId: string, dto: UpsertCreditLimitDto): Promise<CustomerCreditLimit> {
    const tenantId = this.tenantId();
    const userId = this.userId();

    let limit = await this.creditRepo.findOne({
      where: { tenant: { id: tenantId }, customerId },
    });

    if (!limit) {
      limit = this.creditRepo.create({
        tenant: { id: tenantId } as any,
        customerId,
        creditLimit: dto.creditLimit,
        currency: dto.currency ?? 'TRY',
        warningThresholdPercent: dto.warningThresholdPercent,
        createdById: userId,
        updatedById: userId,
      });
    } else {
      limit.creditLimit = dto.creditLimit;
      if (dto.currency) limit.currency = dto.currency;
      if (dto.warningThresholdPercent !== undefined) {
        limit.warningThresholdPercent = dto.warningThresholdPercent;
      }
      limit.updatedById = userId;
    }

    return this.creditRepo.save(limit);
  }

  async getCreditLimit(customerId: string): Promise<CustomerCreditLimit | null> {
    return this.creditRepo.findOne({
      where: { tenant: { id: this.tenantId() }, customerId, isActive: true },
    });
  }

  async deleteCreditLimit(customerId: string): Promise<void> {
    const limit = await this.getCreditLimit(customerId);
    if (!limit) throw new NotFoundException(`Kredi limiti bulunamadı: ${customerId}`);
    await this.creditRepo.delete(limit.id);
  }

  // ── Payment Terms ─────────────────────────────────────────────────────────

  async createPaymentTerm(dto: CreatePaymentTermDto): Promise<PaymentTerm> {
    if (dto.customerId && dto.customerGroupId) {
      throw new BadRequestException('customerId ve customerGroupId birlikte gönderilemez.');
    }

    const term = this.termRepo.create({
      tenant: { id: this.tenantId() } as any,
      customerId: dto.customerId,
      customerGroupId: dto.customerGroupId,
      netDays: dto.netDays,
      discountDays: dto.discountDays,
      discountPercent: dto.discountPercent,
      description: dto.description,
      createdById: this.userId(),
      updatedById: this.userId(),
    });
    return this.termRepo.save(term);
  }

  async listPaymentTerms(): Promise<PaymentTerm[]> {
    return this.termRepo.find({
      where: { tenant: { id: this.tenantId() } },
      order: { createdAt: 'DESC' },
    });
  }

  async getPaymentTerm(id: string): Promise<PaymentTerm> {
    const term = await this.termRepo.findOne({
      where: { id, tenant: { id: this.tenantId() } },
    });
    if (!term) throw new NotFoundException(`Ödeme vadesi bulunamadı: ${id}`);
    return term;
  }

  async updatePaymentTerm(id: string, dto: UpdatePaymentTermDto): Promise<PaymentTerm> {
    const term = await this.getPaymentTerm(id);
    Object.assign(term, dto);
    term.updatedById = this.userId();
    return this.termRepo.save(term);
  }

  async deletePaymentTerm(id: string): Promise<void> {
    await this.getPaymentTerm(id);
    await this.termRepo.delete(id);
  }

  /**
   * Müşteri için geçerli ödeme vadesini çözer.
   * Öncelik: müşteri bazlı > grup bazlı > tenant varsayılanı
   */
  async resolvePaymentTerm(
    customerId: string,
    customerGroupId?: string,
  ): Promise<PaymentTerm | null> {
    const tenantId = this.tenantId();

    // 1. Müşteri bazlı
    const customerTerm = await this.termRepo.findOne({
      where: { tenant: { id: tenantId }, customerId, isActive: true },
    });
    if (customerTerm) return customerTerm;

    // 2. Grup bazlı
    if (customerGroupId) {
      const groupTerm = await this.termRepo.findOne({
        where: { tenant: { id: tenantId }, customerGroupId, isActive: true },
      });
      if (groupTerm) return groupTerm;
    }

    // 3. Tenant varsayılanı (hem customerId hem customerGroupId NULL)
    return this.termRepo.findOne({
      where: {
        tenant: { id: tenantId },
        customerId: IsNull(),
        customerGroupId: IsNull(),
        isActive: true,
      },
    });
  }

  // ── Price List Entries ────────────────────────────────────────────────────

  async upsertPriceListEntry(
    groupId: string,
    dto: UpsertPriceListEntryDto,
  ): Promise<PriceListEntry> {
    const group = await this.findGroupOrThrow(groupId);
    const tenantId = this.tenantId();
    const userId = this.userId();

    let entry = await this.priceListRepo.findOne({
      where: {
        customerGroup: { id: groupId },
        productVariantId: dto.productVariantId,
        tenant: { id: tenantId },
      },
    });

    if (!entry) {
      entry = this.priceListRepo.create({
        tenant: { id: tenantId } as any,
        customerGroup: group,
        productVariantId: dto.productVariantId,
        price: dto.price,
        currency: dto.currency ?? 'TRY',
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        createdById: userId,
        updatedById: userId,
      });
    } else {
      entry.price = dto.price;
      if (dto.currency) entry.currency = dto.currency;
      entry.validFrom = dto.validFrom ? new Date(dto.validFrom) : undefined;
      entry.validUntil = dto.validUntil ? new Date(dto.validUntil) : undefined;
      entry.updatedById = userId;
    }

    return this.priceListRepo.save(entry);
  }

  async listPriceListEntries(groupId: string): Promise<PriceListEntry[]> {
    await this.findGroupOrThrow(groupId);
    return this.priceListRepo.find({
      where: { customerGroup: { id: groupId }, tenant: { id: this.tenantId() } },
      order: { createdAt: 'ASC' },
    });
  }

  async deletePriceListEntry(groupId: string, productVariantId: string): Promise<void> {
    const entry = await this.priceListRepo.findOne({
      where: {
        customerGroup: { id: groupId },
        productVariantId,
        tenant: { id: this.tenantId() },
      },
    });
    if (!entry) throw new NotFoundException(`Fiyat listesi kaydı bulunamadı.`);
    await this.priceListRepo.delete(entry.id);
  }

  /**
   * Bir müşteri + varyant için aktif fiyat listesi fiyatını döner.
   * customerGroupId yoksa null döner.
   */
  async resolveGroupPrice(
    customerGroupId: string,
    productVariantId: string,
  ): Promise<PriceListEntry | null> {
    const now = new Date();
    const tenantId = this.tenantId();

    return this.priceListRepo
      .createQueryBuilder('ple')
      .where('ple.tenantId = :tenantId', { tenantId })
      .andWhere('ple.customerGroupId = :customerGroupId', { customerGroupId })
      .andWhere('ple.productVariantId = :productVariantId', { productVariantId })
      .andWhere('ple.isActive = true')
      .andWhere('(ple.validFrom IS NULL OR ple.validFrom <= :now)', { now })
      .andWhere('(ple.validUntil IS NULL OR ple.validUntil >= :now)', { now })
      .getOne();
  }
}
