import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request, Response } from 'express';
import { MoreThan, Repository } from 'typeorm';
import { Observable, of, tap } from 'rxjs';
import { AppContextService } from 'src/common/context/app-context.service';
import { IdempotencyKey } from '../entities/idempotency-key.entity';

/** `Idempotency-Key` header'ı olan POST/PUT/PATCH isteklerini tekrar-güvenli yapar */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  /** Aynı key ile kayıt 24 saat boyunca geçerlidir */
  private static readonly TTL_MS = 24 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly repo: Repository<IdempotencyKey>,
    private readonly appContext: AppContextService,
  ) {}

  async intercept(
    ctx: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const http = ctx.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    // Sadece mutasyon metodları + key varsa devreye gir
    if (!idempotencyKey || !['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next.handle();
    }

    const tenantId = this.appContext.getTenantId();
    if (!tenantId) return next.handle();

    // Mevcut ve süresi dolmamış key var mı?
    const existing = await this.repo.findOne({
      where: { tenantId, key: idempotencyKey, expiresAt: MoreThan(new Date()) },
    });

    if (existing) {
      res.status(existing.responseStatus);
      return of(existing.responseBody);
    }

    // Yeni istek — işle ve kaydet
    return next.handle().pipe(
      tap(async (responseBody) => {
        try {
          await this.repo.upsert(
            {
              tenantId,
              key: idempotencyKey,
              method: req.method,
              path: req.path,
              responseStatus: res.statusCode,
              responseBody: responseBody ?? null,
              expiresAt: new Date(Date.now() + IdempotencyInterceptor.TTL_MS),
            },
            ['tenantId', 'key'],
          );
        } catch {
          // Eşzamanlı kayıt çakışması — görmezden gel (ilk istek zaten işlendi)
        }
      }),
    );
  }
}
