import { Injectable } from '@nestjs/common';
import { IntegrationProvider } from './entities/integration-connection.entity';
import { BaseIntegrationProvider } from './providers/base.provider';
import { TrendyolProvider } from './providers/trendyol.provider';
import { CustomWebhookProvider } from './providers/custom-webhook.provider';
import { StubProvider } from './providers/stub.provider';

@Injectable()
export class ProviderFactory {
  constructor(
    private readonly trendyol: TrendyolProvider,
    private readonly customWebhook: CustomWebhookProvider,
  ) {}

  get(provider: IntegrationProvider): BaseIntegrationProvider {
    switch (provider) {
      case IntegrationProvider.TRENDYOL:
        return this.trendyol;
      case IntegrationProvider.CUSTOM_WEBHOOK:
        return this.customWebhook;
      case IntegrationProvider.HEPSIBURADA:
        return new StubProvider('Hepsiburada');
      case IntegrationProvider.N11:
        return new StubProvider('N11');
      case IntegrationProvider.AMAZON:
        return new StubProvider('Amazon SP-API');
      case IntegrationProvider.EFATURA:
        return new StubProvider('e-Fatura (GİB)');
      default:
        return new StubProvider(provider);
    }
  }
}
