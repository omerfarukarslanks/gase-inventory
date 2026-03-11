import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ActionAiService } from './action-ai.service';
import { ToolService } from './tools/tool.service';
import { AiActionSuggestion } from './entities/ai-action-suggestion.entity';
import { ProductModule } from 'src/product/product.module';
import { InventoryModule } from 'src/inventory/inventory.module';
import { ReportsModule } from 'src/reports/reports.module';
import { ProcurementModule } from 'src/procurement/procurement.module';
import { ApprovalModule } from 'src/approval/approval.module';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiActionSuggestion]),
    HttpModule.register({
      timeout: 300_000,
      maxRedirects: 3,
      httpAgent: new HttpAgent({ keepAlive: true }),
      httpsAgent: new HttpsAgent({ keepAlive: true }),
    }),
    ProductModule,
    InventoryModule,
    ReportsModule,
    ProcurementModule,
    ApprovalModule,
    AuditLogModule,
  ],
  controllers: [AiController],
  providers: [AiService, ActionAiService, ToolService],
  exports: [AiService, ActionAiService, ToolService],
})
export class AiModule {}
