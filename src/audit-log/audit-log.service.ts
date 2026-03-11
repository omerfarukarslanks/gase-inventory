import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AppContextService } from 'src/common/context/app-context.service';
import { AuditLog } from './audit-log.entity';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

export interface LogPayload {
  action: string;
  entityType: string;
  entityId: string;
  diff?: Record<string, any>;
  /** Çağıran userId'yi override et (sistem job için null geçilebilir) */
  userId?: string | null;
  /**
   * Cron/scheduler context'inde CLS aktif olmadığından tenantId otomatik çözülemez.
   * Bu durumlarda tenantId açıkça geçilmeli; geçilmezse CLS'den alınmaya çalışılır.
   */
  tenantId?: string;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    private readonly appContext: AppContextService,
  ) {}

  /**
   * Audit kaydı yazar.
   * Opsiyonel `manager` ile mevcut transaction'a katılır.
   * Fire-and-forget için `await` etmeden de çağrılabilir, ancak transaction içinde
   * aynı manager'ı geçirmek veri tutarlılığı için önerilir.
   */
  async log(payload: LogPayload, manager?: EntityManager): Promise<void> {
    const tenantId = payload.tenantId ?? this.appContext.getTenantIdOrThrow();
    const actorId =
      payload.userId !== undefined
        ? (payload.userId ?? undefined)
        : (this.appContext.getUserIdOrNull() ?? undefined);

    const repo = manager ? manager.getRepository(AuditLog) : this.auditRepo;

    const entry = repo.create({
      tenantId,
      userId: actorId,
      action: payload.action,
      entityType: payload.entityType,
      entityId: payload.entityId,
      diff: payload.diff,
    });

    await repo.save(entry);
  }

  async findAll(query: ListAuditLogsDto) {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const qb = this.auditRepo
      .createQueryBuilder('al')
      .where('al.tenantId = :tenantId', { tenantId });

    if (query.entityType) {
      qb.andWhere('al.entityType = :entityType', { entityType: query.entityType });
    }
    if (query.entityId) {
      qb.andWhere('al.entityId = :entityId', { entityId: query.entityId });
    }
    if (query.action) {
      qb.andWhere('al.action = :action', { action: query.action });
    }
    if (query.userId) {
      qb.andWhere('al.userId = :userId', { userId: query.userId });
    }

    qb.orderBy('al.createdAt', 'DESC');

    if (!query.hasPagination) {
      return { data: await qb.getMany() };
    }

    const total = await qb.getCount();
    const data = await qb.skip(query.skip).take(query.limit ?? 20).getMany();

    return {
      data,
      meta: {
        total,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        totalPages: Math.ceil(total / (query.limit ?? 20)),
      },
    };
  }
}
