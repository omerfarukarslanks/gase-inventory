import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository, In } from 'typeorm';
import { OutboxEvent, OutboxEventStatus } from 'src/outbox/outbox-event.entity';
import { AppContextService } from 'src/common/context/app-context.service';
import { GetChangesQueryDto } from './dto/sync.dto';

const DEFAULT_LOOKBACK_DAYS = 7;
const DEFAULT_LIMIT = 100;

export interface SyncChangesResult {
  events: Array<{
    id: string;
    eventType: string;
    payload: Record<string, any>;
    createdAt: Date;
  }>;
  /** Bir sonraki istekte `since` olarak kullanılacak cursor (son event'in createdAt'i) */
  nextCursor: string;
  hasMore: boolean;
}

@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,
    private readonly appContext: AppContextService,
  ) {}

  /**
   * Client'a cursor tabanlı event akışı sağlar.
   * Sadece SENT status'teki event'ler dönülür (işlenmiş, kararlı durum).
   */
  async getChanges(query: GetChangesQueryDto): Promise<SyncChangesResult> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const limit = query.limit ?? DEFAULT_LIMIT;

    const since = query.since
      ? new Date(query.since)
      : new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const qb = this.outboxRepo
      .createQueryBuilder('e')
      .where('e.tenantId = :tenantId', { tenantId })
      .andWhere('e.status = :status', { status: OutboxEventStatus.SENT })
      .andWhere('e.createdAt > :since', { since })
      .orderBy('e.createdAt', 'ASC')
      .limit(limit + 1); // +1 → hasMore tespiti için

    if (query.types) {
      const typeList = query.types.split(',').map((t) => t.trim()).filter(Boolean);
      if (typeList.length > 0) {
        qb.andWhere('e.eventType IN (:...types)', { types: typeList });
      }
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const events = hasMore ? rows.slice(0, limit) : rows;

    const nextCursor =
      events.length > 0
        ? events[events.length - 1].createdAt.toISOString()
        : since.toISOString();

    return {
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        payload: e.payload,
        createdAt: e.createdAt,
      })),
      nextCursor,
      hasMore,
    };
  }

  /** Süresi dolmuş idempotency key'leri temizler (cron tarafından çağrılır) */
  async pruneExpiredIdempotencyKeys(): Promise<void> {
    // SyncModule içinde IdempotencyKey repo'su da var ama servis ayrımını korumak için
    // bu metod SyncScheduler'a taşınabilir — şimdilik placeholder
  }
}
