import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { Cron } from '@nestjs/schedule';
import { XMLParser } from 'fast-xml-parser';
import { firstValueFrom } from 'rxjs';
import { ExchangeRate } from './exchange-rate.entity';
import { FOREIGN_CURRENCIES } from 'src/common/constants/currency.constants';

const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';

@Injectable()
export class ExchangeRateService implements OnModuleInit {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(
    @InjectRepository(ExchangeRate)
    private readonly repo: Repository<ExchangeRate>,
    private readonly httpService: HttpService,
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

        await this.repo.upsert(
          { currency: code, rateToTry: rate, isStale: false },
          { conflictPaths: ['currency'] },
        );
      }

      this.logger.log(`Döviz kurları güncellendi: ${FOREIGN_CURRENCIES.join(', ')}`);
    } catch (err) {
      this.logger.warn(
        `TCMB erişim hatası: ${(err as Error).message}. Son bilinen kurlar kullanılıyor.`,
      );
      await this.repo.update({}, { isStale: true });
    }
  }

  /**
   * fromCurrency → toCurrency dönüşüm kurunu döner.
   * Örn: getExchangeRate('USD', 'TRY') = 38.5
   *      getExchangeRate('EUR', 'USD') = rateEUR / rateUSD
   *      getExchangeRate('TRY', 'TRY') = 1
   */
  async getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
    if (fromCurrency === toCurrency) return 1;

    const getRateToTry = async (currency: string): Promise<number> => {
      if (currency === 'TRY') return 1;
      const record = await this.repo.findOne({ where: { currency } });
      return Number(record?.rateToTry ?? 1);
    };

    const fromRate = await getRateToTry(fromCurrency);
    const toRate = await getRateToTry(toCurrency);

    return fromRate / toRate;
  }

  async getAllRates(): Promise<ExchangeRate[]> {
    return this.repo.find({ order: { currency: 'ASC' } });
  }
}
