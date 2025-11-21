// src/common/interceptors/cls-context.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { RequestWithUser } from '../types/request-with-user';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../context/cls-store.type';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ClsContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ClsContextInterceptor.name);

  constructor(
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {

     // Sadece HTTP için header set edelim
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest<RequestWithUser>();
    const res = httpCtx.getResponse();

    const { method, url } = req;
    const start = Date.now();

    // 1) Varsa header'dan al, yoksa UUID üret
    const rawHeader = req.headers['x-correlation-id'];

    const headerValue =
      Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    const correlationId =
      (typeof headerValue === 'string' && headerValue.trim().length > 0)
        ? headerValue.trim()
        : uuidv4(); // 🔹 her zaman string, asla undefined değil

    // 2) CLS içine yaz
    this.cls.set('correlationId', correlationId);

    // JwtStrategy + JwtAuthGuard çalıştıysa burada req.user dolu olacak
    const user = req.user;
    if (user) {
      this.cls.set('userId', user.id);
      this.cls.set('tenantId', user.tenant?.id);
    }

    // Response header’a da yazalım ki frontend loglayabilsin
    res.setHeader('x-correlation-id', correlationId);

    const ip = this.cls.get('ip');
    const ua = this.cls.get('userAgent');
    const tenantId = this.cls.get('tenantId');
    const userId = this.cls.get('userId');

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - start;

        this.logger.log(
          [
            `corrId=${correlationId}`,
            `tenant=${tenantId ?? '-'}`,
            `user=${userId ?? '-'}`,
            `ip=${ip ?? '-'}`,
            `ua="${ua ?? '-'}"`,
            `${method} ${url}`,
            `+${ms}ms`,
          ].join(' | '),
        );
      }),
    );
  }
}
