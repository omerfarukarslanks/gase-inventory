import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ReplenishmentRule } from './entities/replenishment-rule.entity';
import { ReplenishmentSuggestion, SuggestionStatus } from './entities/replenishment-suggestion.entity';

@Injectable()
export class ReplenishmentScheduler {
  private readonly logger = new Logger(ReplenishmentScheduler.name);

  constructor(
    @InjectRepository(ReplenishmentRule)
    private readonly ruleRepo: Repository<ReplenishmentRule>,
    @InjectRepository(ReplenishmentSuggestion)
    private readonly suggestionRepo: Repository<ReplenishmentSuggestion>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Her gece 01:00'de tüm aktif replenishment kurallarını tarar.
   * Stok minStock'un altına düşmüş ve PENDING öneri olmayan kurallar için yeni öneri oluşturur.
   */
  @Cron('0 1 * * *')
  async runReplenishmentCheck(): Promise<void> {
    this.logger.log('Replenishment kontrolü başlıyor...');

    const rules = await this.ruleRepo.find({
      where: { isActive: true },
      relations: ['tenant'],
    });

    if (rules.length === 0) {
      this.logger.log('Aktif replenishment kuralı bulunamadı.');
      return;
    }

    let created = 0;
    let skipped = 0;

    for (const rule of rules) {
      try {
        await this.processRule(rule);
        created++;
      } catch (err) {
        this.logger.error(
          `Kural işlenemedi (ruleId=${rule.id}): ${(err as Error).message}`,
        );
        skipped++;
      }
    }

    this.logger.log(
      `Replenishment kontrolü tamamlandı. Oluşturulan: ${created}, Atlanan: ${skipped}`,
    );
  }

  private async processRule(rule: ReplenishmentRule): Promise<void> {
    // Mevcut PENDING öneri var mı?
    const existingPending = await this.suggestionRepo.findOne({
      where: {
        rule: { id: rule.id },
        status: SuggestionStatus.PENDING,
      },
    });

    if (existingPending) {
      return; // Zaten bekleyen öneri var, tekrar oluşturma
    }

    // Mevcut stok miktarını çek
    const currentQty = await this.getCurrentStock(rule.tenant.id, rule.storeId, rule.productVariantId);

    if (currentQty >= Number(rule.minStock)) {
      return; // Stok yeterli, öneri gerekmez
    }

    const suggestedQuantity = Math.max(Number(rule.targetStock) - currentQty, 1);

    const suggestion = this.suggestionRepo.create({
      tenant: rule.tenant,
      rule,
      status: SuggestionStatus.PENDING,
      suggestedQuantity,
      currentQuantity: currentQty,
    });

    await this.suggestionRepo.save(suggestion);

    this.logger.debug(
      `Öneri oluşturuldu: ruleId=${rule.id}, currentQty=${currentQty}, suggestedQty=${suggestedQuantity}`,
    );
  }

  private async getCurrentStock(
    tenantId: string,
    storeId: string,
    productVariantId: string,
  ): Promise<number> {
    const rows = await this.dataSource.query<{ quantity: string }[]>(
      `SELECT quantity FROM store_variant_stock
       WHERE "tenantId" = $1 AND "storeId" = $2 AND "productVariantId" = $3
       LIMIT 1`,
      [tenantId, storeId, productVariantId],
    );

    return rows.length > 0 ? Number(rows[0].quantity) : 0;
  }
}
