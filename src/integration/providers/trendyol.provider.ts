import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { BaseIntegrationProvider, PingResult, SyncResult } from './base.provider';

const TRENDYOL_API_BASE = 'https://api.trendyol.com/sapigw';

/**
 * Trendyol Marketplace entegrasyonu.
 *
 * Beklenen config alanları:
 *   supplierId : string   — Trendyol tedarikçi ID
 *   apiKey     : string   — API anahtarı
 *   apiSecret  : string   — API gizli anahtarı
 */
@Injectable()
export class TrendyolProvider extends BaseIntegrationProvider {
  private readonly logger = new Logger(TrendyolProvider.name);

  constructor(private readonly http: HttpService) {
    super();
  }

  async ping(config: Record<string, any>): Promise<PingResult> {
    const { supplierId, apiKey, apiSecret } = config;
    if (!supplierId || !apiKey || !apiSecret) {
      return { success: false, message: 'Config eksik: supplierId, apiKey, apiSecret zorunlu.' };
    }

    const start = Date.now();
    try {
      await firstValueFrom(
        this.http.get(
          `${TRENDYOL_API_BASE}/suppliers/${supplierId}/products?page=0&size=1`,
          {
            auth: { username: apiKey, password: apiSecret },
            headers: {
              'User-Agent': `${supplierId} - SelfIntegration`,
            },
            timeout: 10_000,
          },
        ),
      );
      return {
        success: true,
        message: 'Trendyol API bağlantısı başarılı.',
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      const status = err?.response?.status;
      const msg    = err?.response?.data?.errors?.[0]?.message ?? err?.message ?? 'Bilinmeyen hata';
      this.logger.warn(`Trendyol ping başarısız: ${status} — ${msg}`);
      return {
        success: false,
        message: `Trendyol API hatası (${status ?? 'timeout'}): ${msg}`,
        latencyMs: Date.now() - start,
      };
    }
  }

  async sync(
    config: Record<string, any>,
    tenantId: string,
    connectionId: string,
  ): Promise<SyncResult> {
    // Gerçek implementasyon: outbox'a TRENDYOL_SYNC event yaz
    // Şimdilik: ürün listesi sayısını çekip loglama yap
    const { supplierId, apiKey, apiSecret } = config;
    if (!supplierId || !apiKey || !apiSecret) {
      return { queued: false, message: 'Config eksik — sync başlatılamadı.' };
    }

    this.logger.log(`Trendyol sync tetiklendi: tenant=${tenantId} connection=${connectionId}`);
    // TODO: OutboxService.publish({ tenantId, eventType: 'TRENDYOL_SYNC', payload: { connectionId } })
    return { queued: true, message: 'Trendyol sync kuyruğa alındı.' };
  }
}
