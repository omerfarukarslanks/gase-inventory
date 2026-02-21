import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ToolService } from './tools/tool.service';
import { ProductModule } from 'src/product/product.module';
import { InventoryModule } from 'src/inventory/inventory.module';
import { ReportsModule } from 'src/reports/reports.module';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';

@Module({
  imports: [
    HttpModule.register({
      timeout: 300_000,
      maxRedirects: 3,
      httpAgent: new HttpAgent({ keepAlive: true }),
      httpsAgent: new HttpsAgent({ keepAlive: true }),
    }),
    ProductModule,
    InventoryModule,
    ReportsModule,
  ],
  controllers: [AiController],
  providers: [AiService, ToolService],
  exports: [AiService, ToolService],
})
export class AiModule {}
