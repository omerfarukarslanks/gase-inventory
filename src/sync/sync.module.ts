import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';
import { SyncService } from './sync.service';
import { SyncPushService } from './sync-push.service';
import { SyncController } from './sync.controller';
import { OutboxEvent } from 'src/outbox/outbox-event.entity';
import { SalesModule } from 'src/sales/sales.module';
import { InventoryModule } from 'src/inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([IdempotencyKey, OutboxEvent]),
    SalesModule,
    InventoryModule,
  ],
  providers: [
    SyncService,
    SyncPushService,
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
