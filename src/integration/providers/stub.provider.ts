import { Injectable } from '@nestjs/common';
import { BaseIntegrationProvider, PingResult, SyncResult } from './base.provider';

/**
 * Henüz tam implementasyonu olmayan provider'lar için yapılandırılmış stub.
 *
 * Hepsiburada: https://developers.hepsiburada.com/
 *   Config: { merchantId, username, password }
 *
 * N11: https://apiauth.n11.com/
 *   Config: { apiKey, apiSecret }
 *
 * Amazon (SP-API): https://developer-docs.amazon.com/sp-api/
 *   Config: { sellerId, mwsAuthToken, clientId, clientSecret, refreshToken, region }
 *
 * e-Fatura (GİB): https://ebelge.gib.gov.tr/
 *   Config: { vkn, username, password, environment: 'TEST' | 'PROD' }
 */
@Injectable()
export class StubProvider extends BaseIntegrationProvider {
  private readonly providerName: string;

  constructor(providerName: string) {
    super();
    this.providerName = providerName;
  }

  async ping(_config: Record<string, any>): Promise<PingResult> {
    return {
      success: false,
      message: `${this.providerName} entegrasyonu henüz aktif değil. Yakında eklenecek.`,
    };
  }

  async sync(
    _config: Record<string, any>,
    _tenantId: string,
    _connectionId: string,
  ): Promise<SyncResult> {
    return {
      queued: false,
      message: `${this.providerName} sync henüz desteklenmiyor.`,
    };
  }
}
