import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AppContextService } from 'src/common/context/app-context.service';
import { ProcurementService } from 'src/procurement/procurement.service';
import { ReplenishmentRule } from './entities/replenishment-rule.entity';
import { ReplenishmentSuggestion, SuggestionStatus } from './entities/replenishment-suggestion.entity';
import { CreateReplenishmentRuleDto } from './dto/create-replenishment-rule.dto';
import { UpdateReplenishmentRuleDto } from './dto/update-replenishment-rule.dto';
import { ListReplenishmentRulesDto } from './dto/list-replenishment-rules.dto';
import { ListReplenishmentSuggestionsDto } from './dto/list-replenishment-suggestions.dto';
import { DismissSuggestionDto } from './dto/dismiss-suggestion.dto';
import { ProductVariant } from 'src/product/product-variant.entity';

type VariantDetails = {
  productName: string | null;
  variantName: string | null;
};

type ReplenishmentRuleResponse = ReplenishmentRule & VariantDetails;

@Injectable()
export class ReplenishmentService {
  constructor(
    @InjectRepository(ReplenishmentRule)
    private readonly ruleRepo: Repository<ReplenishmentRule>,
    @InjectRepository(ReplenishmentSuggestion)
    private readonly suggestionRepo: Repository<ReplenishmentSuggestion>,
    @InjectRepository(ProductVariant)
    private readonly productVariantRepo: Repository<ProductVariant>,
    private readonly appContext: AppContextService,
    private readonly procurementService: ProcurementService,
  ) {}

  // ─── Rules ──────────────────────────────────────────────────────────────────

  async createRule(dto: CreateReplenishmentRuleDto): Promise<ReplenishmentRuleResponse> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const actorId = this.appContext.getUserIdOrNull();

    const rule = this.ruleRepo.create({
      tenant: { id: tenantId } as any,
      storeId: dto.storeId,
      productVariantId: dto.productVariantId,
      minStock: dto.minStock,
      targetStock: dto.targetStock,
      supplierId: dto.supplierId,
      leadTimeDays: dto.leadTimeDays,
      isActive: true,
      createdById: actorId,
      updatedById: actorId,
    });

    const savedRule = await this.ruleRepo.save(rule);
    return this.enrichRule(savedRule);
  }

  async listRules(query: ListReplenishmentRulesDto) {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const qb = this.ruleRepo
      .createQueryBuilder('rule')
      .where('rule.tenantId = :tenantId', { tenantId });

    if (query.storeId) {
      qb.andWhere('rule.storeId = :storeId', { storeId: query.storeId });
    }
    if (query.productVariantId) {
      qb.andWhere('rule.productVariantId = :productVariantId', {
        productVariantId: query.productVariantId,
      });
    }
    if (query.isActive !== undefined) {
      qb.andWhere('rule.isActive = :isActive', { isActive: query.isActive });
    } else {
      qb.andWhere('rule.isActive = true');
    }

    qb.orderBy('rule.createdAt', 'DESC');

    if (!query.hasPagination) {
      const data = await this.enrichRules(await qb.getMany());
      return { data };
    }

    const total = await qb.getCount();
    const data = await this.enrichRules(
      await qb.skip(query.skip).take(query.limit ?? 20).getMany(),
    );

    return {
      data,
      meta: {
        total,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        totalPages: Math.ceil(total / (query.limit ?? 20)),
      },
    };
  }

  async getRule(ruleId: string): Promise<ReplenishmentRuleResponse> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    return this.enrichRule(await this.findRuleOrThrow(ruleId, tenantId));
  }

  async updateRule(
    ruleId: string,
    dto: UpdateReplenishmentRuleDto,
  ): Promise<ReplenishmentRuleResponse> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const actorId = this.appContext.getUserIdOrNull();

    const rule = await this.findRuleOrThrow(ruleId, tenantId);

    if (dto.minStock !== undefined) rule.minStock = dto.minStock;
    if (dto.targetStock !== undefined) rule.targetStock = dto.targetStock;
    if (dto.supplierId !== undefined) rule.supplierId = dto.supplierId;
    if (dto.leadTimeDays !== undefined) rule.leadTimeDays = dto.leadTimeDays;
    if (dto.isActive !== undefined) rule.isActive = dto.isActive;
    rule.updatedById = actorId;

    const savedRule = await this.ruleRepo.save(rule);
    return this.enrichRule(savedRule);
  }

  async deactivateRule(ruleId: string): Promise<void> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const actorId = this.appContext.getUserIdOrNull();

    const rule = await this.findRuleOrThrow(ruleId, tenantId);
    rule.isActive = false;
    rule.updatedById = actorId;
    await this.ruleRepo.save(rule);
  }

  // ─── Suggestions ────────────────────────────────────────────────────────────

  async listSuggestions(query: ListReplenishmentSuggestionsDto) {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const qb = this.suggestionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.rule', 'rule')
      .where('s.tenantId = :tenantId', { tenantId });

    if (query.status) {
      qb.andWhere('s.status = :status', { status: query.status });
    }
    if (query.storeId) {
      qb.andWhere('rule.storeId = :storeId', { storeId: query.storeId });
    }

    qb.orderBy('s.createdAt', 'DESC');

    if (!query.hasPagination) {
      return { data: await qb.getMany() };
    }

    const total = await qb.getCount();
    const data = await qb.skip(query.skip).take(query.limit ?? 20).getMany();

    return {
      data,
      meta: {
        total,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        totalPages: Math.ceil(total / (query.limit ?? 20)),
      },
    };
  }

  async getSuggestion(suggestionId: string): Promise<ReplenishmentSuggestion> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    return this.findSuggestionOrThrow(suggestionId, tenantId);
  }

  async acceptSuggestion(suggestionId: string): Promise<ReplenishmentSuggestion> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const actorId = this.appContext.getUserIdOrNull();

    const suggestion = await this.findSuggestionOrThrow(suggestionId, tenantId);

    if (suggestion.status !== SuggestionStatus.PENDING) {
      throw new BadRequestException(
        `Öneri onaylanamaz: mevcut durum ${suggestion.status}. Yalnızca PENDING öneriler onaylanabilir.`,
      );
    }

    const rule = suggestion.rule;

    // Draft PO oluştur
    const po = await this.procurementService.createPurchaseOrder({
      storeId: rule.storeId,
      supplierId: rule.supplierId,
      lines: [
        {
          productVariantId: rule.productVariantId,
          quantity: suggestion.suggestedQuantity,
        },
      ],
    });

    suggestion.status = SuggestionStatus.ACCEPTED;
    suggestion.autoCreatedPoId = po.id;
    suggestion.updatedById = actorId;

    return this.suggestionRepo.save(suggestion);
  }

  async dismissSuggestion(
    suggestionId: string,
    dto: DismissSuggestionDto,
  ): Promise<ReplenishmentSuggestion> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const actorId = this.appContext.getUserIdOrNull();

    const suggestion = await this.findSuggestionOrThrow(suggestionId, tenantId);

    if (suggestion.status !== SuggestionStatus.PENDING) {
      throw new BadRequestException(
        `Öneri reddedilemez: mevcut durum ${suggestion.status}. Yalnızca PENDING öneriler reddedilebilir.`,
      );
    }

    suggestion.status = SuggestionStatus.DISMISSED;
    if (dto.notes) suggestion.notes = dto.notes;
    suggestion.updatedById = actorId;

    return this.suggestionRepo.save(suggestion);
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  private async loadVariantDetailsMap(
    variantIds: string[],
  ): Promise<Map<string, VariantDetails>> {
    if (variantIds.length === 0) {
      return new Map<string, VariantDetails>();
    }

    const variants = await this.productVariantRepo.find({
      where: { id: In(variantIds) },
      relations: ['product'],
    });

    return new Map(
      variants.map((variant) => [
        variant.id,
        {
          productName: variant.product?.name ?? null,
          variantName: variant.name ?? null,
        },
      ]),
    );
  }

  private async enrichRules(
    rules: ReplenishmentRule[],
  ): Promise<ReplenishmentRuleResponse[]> {
    if (rules.length === 0) {
      return [];
    }

    const variantIds = [
      ...new Set(
        rules
          .map((rule) => rule.productVariantId)
          .filter((variantId): variantId is string => Boolean(variantId)),
      ),
    ];
    const variantById = await this.loadVariantDetailsMap(variantIds);

    return rules.map((rule) => {
      const variantDetails = variantById.get(rule.productVariantId);

      return {
        ...rule,
        productName: variantDetails?.productName ?? null,
        variantName: variantDetails?.variantName ?? null,
      };
    });
  }

  private async enrichRule(rule: ReplenishmentRule): Promise<ReplenishmentRuleResponse> {
    const [enrichedRule] = await this.enrichRules([rule]);
    return enrichedRule;
  }

  private async findRuleOrThrow(ruleId: string, tenantId: string): Promise<ReplenishmentRule> {
    const rule = await this.ruleRepo.findOne({
      where: { id: ruleId, tenant: { id: tenantId } },
    });

    if (!rule) {
      throw new NotFoundException('Replenishment kuralı bulunamadı');
    }

    return rule;
  }

  private async findSuggestionOrThrow(
    suggestionId: string,
    tenantId: string,
  ): Promise<ReplenishmentSuggestion> {
    const suggestion = await this.suggestionRepo.findOne({
      where: { id: suggestionId, tenant: { id: tenantId } },
      relations: ['rule'],
    });

    if (!suggestion) {
      throw new NotFoundException('Replenishment önerisi bulunamadı');
    }

    return suggestion;
  }
}
