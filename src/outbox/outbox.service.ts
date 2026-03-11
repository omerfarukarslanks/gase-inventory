import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { OutboxEvent, OutboxEventStatus } from './outbox-event.entity';

export interface PublishPayload {
  tenantId: string;
  eventType: string;
  payload: Record<string, any>;
}

@Injectable()
export class OutboxService {
  constructor(
    @InjectRepository(OutboxEvent)
    private readonly repo: Repository<OutboxEvent>,
  ) {}

  /**
   * Outbox event kaydeder. `manager` ile mevcut transaction'a katılır.
   * Goods receipt gibi kritik işlemlerde aynı DB transaction'ında çağrılmalıdır.
   */
  async publish(data: PublishPayload, manager?: EntityManager): Promise<OutboxEvent> {
    const repo = manager ? manager.getRepository(OutboxEvent) : this.repo;

    const event = repo.create({
      tenantId: data.tenantId,
      eventType: data.eventType,
      payload: data.payload,
      status: OutboxEventStatus.PENDING,
      nextRetryAt: new Date(),
    });

    return repo.save(event);
  }

  /** Worker tarafından kullanılır — işlenecek PENDING event'leri çeker */
  async fetchPending(limit = 50): Promise<OutboxEvent[]> {
    return this.repo
      .createQueryBuilder('e')
      .where('e.status = :status', { status: OutboxEventStatus.PENDING })
      .andWhere('e.nextRetryAt <= NOW()')
      .orderBy('e.createdAt', 'ASC')
      .limit(limit)
      .getMany();
  }

  async markSent(eventId: string): Promise<void> {
    await this.repo.update(eventId, {
      status: OutboxEventStatus.SENT,
      processedAt: new Date(),
    });
  }

  async markFailed(eventId: string, error: string, nextRetryAt: Date): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(OutboxEvent)
      .set({
        status: OutboxEventStatus.FAILED,
        lastError: error,
        nextRetryAt,
      })
      .where('id = :id', { id: eventId })
      .execute();

    await this.repo.increment({ id: eventId }, 'retryCount', 1);
  }

  /** Başarısız event'leri yeniden kuyruğa al (max retry: 5) */
  async requeueFailed(limit = 20): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(OutboxEvent)
      .set({ status: OutboxEventStatus.PENDING, nextRetryAt: new Date() })
      .where('status = :status', { status: OutboxEventStatus.FAILED })
      .andWhere('retryCount < 5')
      .limit(limit)
      .execute();
  }
}
