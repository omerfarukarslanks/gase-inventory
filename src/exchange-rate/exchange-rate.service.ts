import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { Cron } from '@nestjs/schedule';
import { XMLParser } from 'fast-xml-parser';
import { firstValueFrom } from 'rxjs';
import { ExchangeRate } from './exchange-rate.entity';
import { FOREIGN_CURRENCIES } from 'src/common/constants/currency.constants';
import { AppContextService } from 'src/common/context/app-context.service';

const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';

@Injectable()
export class ExchangeRateService implements OnModuleInit {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(
    @InjectRepository(ExchangeRate)
    private readonly repo: Repository<ExchangeRate>,
    private readonly httpService: HttpService,
    private readonly appContext: AppContextService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.fetchAndUpdateRates();
  }

  /** Her saatin başında TCMB'den kur günceller */
  @Cron('0 * * * *')
  async fetchAndUpdateRates(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<string>(TCMB_URL, {
          responseType: 'text',
          timeout: 10_000,
        }),
      );

      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
      const parsed = parser.parse(response.data as string);

      const raw = parsed?.Tarih_Date?.Currency ?? [];
      const currencyList: any[] = Array.isArray(raw) ? raw : [raw];

      for (const curr of currencyList) {
        const code: string = curr?.['@_CurrencyCode'] ?? '';
        if (!(FOREIGN_CURRENCIES as readonly string[]).includes(code)) continue;

        const rate = Number(curr?.ForexSelling ?? curr?.ForexBuying ?? 0);
        if (!rate || rate <= 0) continue;

        // Global kur (tenantId IS NULL) — find + save
        const existing = await this.repo.findOne({
          where: { currency: code, tenantId: IsNull() },
        });
        if (existing) {
          existing.rateToTry = rate;
          existing.isStale = false;
          await this.repo.save(existing);
        } else {
          await this.repo.save({ currency: code, rateToTry: rate, isStale: false });
        }
      }

      this.logger.log(`Döviz kurları güncellendi: ${FOREIGN_CURRENCIES.join(', ')}`);
    } catch (err) {
      this.logger.warn(
        `TCMB erişim hatası: ${(err as Error).message}. Son bilinen kurlar kullanılıyor.`,
      );
      // Sadece global kurları stale yap, tenant override'larına dokunma
      await this.repo
        .createQueryBuilder()
        .update(ExchangeRate)
        .set({ isStale: true })
        .where('"tenantId" IS NULL')
        .execute();
    }
  }

  /**
   * fromCurrency → toCurrency dönüşüm kurunu döner.
   * Önce request context'teki tenant'a özel kura bakar, yoksa global kuru kullanır.
   */
  async getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
    if (fromCurrency === toCurrency) return 1;

    const tenantId = this.appContext.getTenantId();

    const getRateToTry = async (currency: string): Promise<number> => {
      if (currency === 'TRY') return 1;

      // 1. Tenant-specific override
      if (tenantId) {
        const tenantRecord = await this.repo.findOne({ where: { currency, tenantId } });
        if (tenantRecord) return Number(tenantRecord.rateToTry);
      }

      // 2. Global fallback
      const globalRecord = await this.repo.findOne({
        where: { currency, tenantId: IsNull() },
      });
      return Number(globalRecord?.rateToTry ?? 1);
    };

    const fromRate = await getRateToTry(fromCurrency);
    const toRate = await getRateToTry(toCurrency);

    return fromRate / toRate;
  }

  /** Global kurları + aktif tenant'ın override'larını birleştirerek döner */
  async getAllRates(): Promise<ExchangeRate[]> {
    const tenantId = this.appContext.getTenantId();

    const globalRates = await this.repo.find({
      where: { tenantId: IsNull() },
      order: { currency: 'ASC' },
    });

    if (!tenantId) return globalRates;

    const tenantRates = await this.repo.find({ where: { tenantId }, order: { currency: 'ASC' } });

    // Tenant override varsa global'ın üzerine yaz
    const merged = new Map(globalRates.map((r) => [r.currency, r]));
    for (const tr of tenantRates) merged.set(tr.currency, tr);

    return Array.from(merged.values()).sort((a, b) => a.currency.localeCompare(b.currency));
  }

  /** Tenant'a özel kur override ekle/güncelle */
  async setTenantRateOverride(currency: string, rate: number): Promise<ExchangeRate> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    if (!(FOREIGN_CURRENCIES as readonly string[]).includes(currency)) {
      throw new BadRequestException(`Desteklenmeyen para birimi: ${currency}`);
    }
    if (rate <= 0) {
      throw new BadRequestException("Kur 0'dan büyük olmalıdır");
    }

    const existing = await this.repo.findOne({ where: { currency, tenantId } });
    if (existing) {
      existing.rateToTry = rate;
      existing.isStale = false;
      return this.repo.save(existing);
    }

    return this.repo.save({ currency, tenantId, rateToTry: rate, isStale: false });
  }

  /** Tenant'a özel kur override'ını kaldır (global kura geri döner) */
  async removeTenantRateOverride(currency: string): Promise<void> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const existing = await this.repo.findOne({ where: { currency, tenantId } });
    if (!existing) {
      throw new NotFoundException(`${currency} için tenant override bulunamadı`);
    }

    await this.repo.remove(existing);
  }
}
