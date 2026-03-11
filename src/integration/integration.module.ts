import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { IntegrationConnection } from './entities/integration-connection.entity';
import { IntegrationService } from './integration.service';
import { IntegrationController } from './integration.controller';
import { CryptoService } from './crypto.service';
import { ProviderFactory } from './provider.factory';
import { TrendyolProvider } from './providers/trendyol.provider';
import { CustomWebhookProvider } from './providers/custom-webhook.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([IntegrationConnection]),
    HttpModule.register({ timeout: 15_000, maxRedirects: 3 }),
  ],
  providers: [
    IntegrationService,
    CryptoService,
    ProviderFactory,
    TrendyolProvider,
    CustomWebhookProvider,
  ],
  controllers: [IntegrationController],
  exports: [IntegrationService],
})
export class IntegrationModule {}
