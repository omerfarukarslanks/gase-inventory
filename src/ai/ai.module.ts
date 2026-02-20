import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ToolService } from './tools/tool.service';
import { ProductModule } from 'src/product/product.module';
import { InventoryModule } from 'src/inventory/inventory.module';
import { ReportsModule } from 'src/reports/reports.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 300_000,
      maxRedirects: 3,
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
