import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from './tenant/tenant.module';
import { StoreModule } from './store/store.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import type { Request } from 'express';
import { ClsContextInterceptor } from './common/interceptors/cls-context.interceptor';
import { ProductModule } from './product/product.module';
import { AppContextModule } from './common/context/app-context.module';
import { InventoryModule } from './inventory/inventory.module';
import { SalesModule } from './sales/sales.module';
import { ReportsModule } from './reports/reports.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { StockTransferModule } from './transfer/stock-transfer.module';
import { join } from 'path';
import { PriceModule } from './pricing/price.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASS'),
        database: config.get<string>('DB_NAME'),
        autoLoadEntities: true, // Entity'leri otomatik yükle
        synchronize: false,
        migrations: [join(__dirname, 'migrations/*.js')],
        migrationsTableName: 'typeorm_migrations',
      }),
    }),

    // 🔹 CLS – tüm uygulama için global context
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true, // tüm HTTP route’lara CLS middleware’i otomatik bağlar
        setup: (cls, req: Request) => {
          // IP
          const ip =
            (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
            req.socket.remoteAddress ||
            undefined;

          const userAgent = req.headers['user-agent'] as string | undefined;

          cls.set('ip', ip);
          cls.set('userAgent', userAgent);

          // Var ise dışarıdan gelen correlationId
          const headerCorrelationId =
            (req.headers['x-correlation-id'] as string) ||
            (req.headers['x-request-id'] as string);

          if (headerCorrelationId) {
            cls.set('correlationId', headerCorrelationId);
          } else {
            // nestjs-cls kendi request id’sini üretiyor → onu correlationId olarak kullan
            cls.set('correlationId', cls.getId());
          }
        },
      },
    }),
    AppContextModule,
    TenantModule,
    StoreModule,
    UserModule,
    AuthModule,
    ProductModule,
    InventoryModule,
    SalesModule,
    ReportsModule,
    StockTransferModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ClsContextInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
