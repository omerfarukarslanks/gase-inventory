import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  /** Pencere süresi (ms) — default 60 saniye */
  ttlMs?: number;
  /** Pencere içinde izin verilen max istek sayısı — default 5 */
  max?: number;
}

/**
 * IP + endpoint bazında bellek-içi rate limiting.
 * @UseGuards(RateLimitGuard) ve @RateLimit({ max: 3, ttlMs: 60_000 }) ile kullanılır.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly store = new Map<string, number[]>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? {};

    const ttlMs = options.ttlMs ?? 60_000;
    const max = options.max ?? 5;

    const req = context.switchToHttp().getRequest<Request>();
    const ip =
      ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) ||
      req.socket.remoteAddress ||
      'unknown';
    const route = `${req.method}:${req.path}`;
    const key = `${ip}:${route}`;

    const now = Date.now();
    const windowStart = now - ttlMs;
    const timestamps = (this.store.get(key) ?? []).filter((ts) => ts >= windowStart);

    if (timestamps.length >= max) {
      this.logger.warn(`rate_limited | ip=${ip} | route=${route} | attempts=${timestamps.length}`);
      throw new HttpException(
        'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    timestamps.push(now);
    this.store.set(key, timestamps);
    return true;
  }
}

/** Shorthand decorator */
export const RateLimit = (options: RateLimitOptions) =>
  (target: object, key?: string | symbol, descriptor?: TypedPropertyDescriptor<any>) => {
    Reflect.defineMetadata(RATE_LIMIT_KEY, options, descriptor?.value ?? target);
    return descriptor ?? target;
  };
