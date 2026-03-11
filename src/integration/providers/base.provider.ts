export interface PingResult {
  success: boolean;
  message: string;
  latencyMs?: number;
}

export interface SyncResult {
  queued: boolean;
  eventId?: string;
  message: string;
}

/**
 * Her entegrasyon sağlayıcısının uygulaması gereken arayüz.
 * Config, DB'den çözümlenerek (decrypt) geçirilir.
 */
export abstract class BaseIntegrationProvider {
  /**
   * Bağlantının canlı olup olmadığını doğrular.
   * Gerçek bir HTTP/OAuth çağrısı yapmalıdır.
   */
  abstract ping(config: Record<string, any>): Promise<PingResult>;

  /**
   * Manuel senkronizasyon işlemini başlatır.
   * Outbox event yazılması tercih edilen akıştır.
   */
  abstract sync(
    config: Record<string, any>,
    tenantId: string,
    connectionId: string,
  ): Promise<SyncResult>;
}
