import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { OutboxEvent } from 'src/outbox/outbox-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyKey, OutboxEvent])],
  providers: [
    SyncService,
    /**
     * Global idempotency interceptor.
     * `Idempotency-Key` header'ı olan POST/PUT/PATCH isteklerini tekrar-güvenli yapar.
     * Header yoksa interceptor hiçbir şey yapmaz.
     */
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
  ],
  controllers: [SyncController],
  exports: [SyncService],
})
export class SyncModule {}
