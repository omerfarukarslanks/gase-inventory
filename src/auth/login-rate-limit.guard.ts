import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AppContextService } from 'src/common/context/app-context.service';
import type { Request } from 'express';

interface AttemptRecord {
  timestamps: number[];
}

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(LoginRateLimitGuard.name);
  private readonly attempts = new Map<string, AttemptRecord>();
  private readonly ttlMs = 60_000;
  private readonly maxAttempts = 5;

  constructor(private readonly appContext: AppContextService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const body: any = req.body ?? {};
    const email: string = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '-';
    const ip = this.appContext.getIp() ??
      ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown');

    const key = `${ip}:${email || '-'}`;
    const now = Date.now();
    const windowStart = now - this.ttlMs;
    const record = this.attempts.get(key) ?? { timestamps: [] };

    record.timestamps = record.timestamps.filter((ts) => ts >= windowStart);

    if (record.timestamps.length >= this.maxAttempts) {
      this.logger.warn(
        [
          'login_rate_limited',
          `email=${email || '-'}`,
          `ip=${ip}`,
          `attempts=${record.timestamps.length}`,
        ].join(' | '),
      );
      throw new HttpException(
        'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.timestamps.push(now);
    this.attempts.set(key, record);
    return true;
  }
}
