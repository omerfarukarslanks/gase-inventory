import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { BaseIntegrationProvider, PingResult, SyncResult } from './base.provider';

/**
 * Özel Webhook entegrasyonu.
 *
 * Beklenen config alanları:
 *   url     : string   — Webhook endpoint URL
 *   method? : string   — HTTP metodu (varsayılan: POST)
 *   headers?: object   — Ek HTTP başlıkları (örn. Authorization)
 *   secret? : string   — Webhook imza anahtarı (HMAC-SHA256, opsiyonel)
 */
@Injectable()
export class CustomWebhookProvider extends BaseIntegrationProvider {
  private readonly logger = new Logger(CustomWebhookProvider.name);

  constructor(private readonly http: HttpService) {
    super();
  }

  async ping(config: Record<string, any>): Promise<PingResult> {
    const { url, method = 'POST', headers = {} } = config;
    if (!url) {
      return { success: false, message: 'Config eksik: url zorunlu.' };
    }

    const start = Date.now();
    try {
      await firstValueFrom(
        this.http.request({
          method,
          url,
          headers: { 'Content-Type': 'application/json', ...headers },
          data: { event: 'ping', timestamp: new Date().toISOString() },
          timeout: 10_000,
        }),
      );
      return {
        success: true,
        message: 'Webhook ping başarılı.',
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      const status = err?.response?.status;
      const msg    = err?.message ?? 'Bilinmeyen hata';
      this.logger.warn(`Webhook ping başarısız: ${status} — ${msg}`);
      return {
        success: false,
        message: `Webhook hatası (${status ?? 'timeout'}): ${msg}`,
        latencyMs: Date.now() - start,
      };
    }
  }

  async sync(
    config: Record<string, any>,
    tenantId: string,
    connectionId: string,
  ): Promise<SyncResult> {
    const { url, method = 'POST', headers = {} } = config;
    if (!url) {
      return { queued: false, message: 'Config eksik: url zorunlu.' };
    }

    const start = Date.now();
    try {
      await firstValueFrom(
        this.http.request({
          method,
          url,
          headers: { 'Content-Type': 'application/json', ...headers },
          data: {
            event: 'sync',
            tenantId,
            connectionId,
            timestamp: new Date().toISOString(),
          },
          timeout: 15_000,
        }),
      );
      return { queued: true, message: `Webhook sync tetiklendi (${Date.now() - start}ms).` };
    } catch (err: any) {
      this.logger.warn(`Webhook sync başarısız: ${err?.message}`);
      return { queued: false, message: `Webhook sync hatası: ${err?.message ?? 'bilinmeyen'}` };
    }
  }
}
