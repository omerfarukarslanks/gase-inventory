import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OutboxService } from './outbox.service';
import { OutboxEvent } from './outbox-event.entity';

const MAX_RETRIES = 5;
/** Exponential backoff: 2^retryCount dakika (max 32 dk) */
const backoffMs = (retryCount: number) =>
  Math.min(Math.pow(2, retryCount) * 60_000, 32 * 60_000);

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);
  private isRunning = false;

  constructor(private readonly outboxService: OutboxService) {}

  /** Her 10 saniyede bir PENDING event'leri işler */
  @Interval(10_000)
  async processPendingEvents(): Promise<void> {
    if (this.isRunning) return; // Önceki tur bitmeden tekrar başlama

    this.isRunning = true;
    try {
      const events = await this.outboxService.fetchPending(50);
      if (events.length === 0) return;

      this.logger.debug(`${events.length} outbox event işleniyor...`);

      for (const event of events) {
        await this.processEvent(event);
      }
    } finally {
      this.isRunning = false;
    }
  }

  private async processEvent(event: OutboxEvent): Promise<void> {
    try {
      await this.dispatch(event);
      await this.outboxService.markSent(event.id);
      this.logger.debug(`Event işlendi: ${event.eventType} (${event.id})`);
    } catch (err) {
      const error = (err as Error).message;
      const nextRetryAt = new Date(Date.now() + backoffMs(event.retryCount));

      this.logger.warn(
        `Event başarısız: ${event.eventType} (${event.id}) — ${error}. ` +
        `RetryCount: ${event.retryCount + 1}/${MAX_RETRIES}. ` +
        `Sonraki deneme: ${nextRetryAt.toISOString()}`,
      );

      await this.outboxService.markFailed(event.id, error, nextRetryAt);
    }
  }

  /**
   * Event tipine göre işlem yapar.
   * Faz 2'de gerçek entegrasyonlar (webhook, e-fatura, marketplace) buraya bağlanır.
   */
  private async dispatch(event: OutboxEvent): Promise<void> {
    switch (event.eventType) {
      case 'goods_receipt.created':
        // Faz 2: WMS / e-fatura sistemine bildirim gönder
        this.logger.debug(
          `[STUB] goods_receipt.created — tenantId=${event.tenantId}, payload=${JSON.stringify(event.payload)}`,
        );
        break;

      case 'purchase_order.approved':
        // Faz 2: Tedarikçi sistemine sipariş bildirimi
        this.logger.debug(
          `[STUB] purchase_order.approved — tenantId=${event.tenantId}`,
        );
        break;

      default:
        // Bilinmeyen event tiplerini logla ama hata fırlatma
        this.logger.warn(`Bilinmeyen event tipi: ${event.eventType}`);
        break;
    }
  }
}
