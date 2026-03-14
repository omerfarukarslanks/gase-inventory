import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReplenishmentController } from './replenishment.controller';
import { ReplenishmentService } from './replenishment.service';
import { ReplenishmentScheduler } from './replenishment.scheduler';
import { ReplenishmentRule } from './entities/replenishment-rule.entity';
import { ReplenishmentSuggestion } from './entities/replenishment-suggestion.entity';
import { ProcurementModule } from 'src/procurement/procurement.module';
import { ProductVariant } from 'src/product/product-variant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReplenishmentRule, ReplenishmentSuggestion, ProductVariant]),
    ProcurementModule,
  ],
  controllers: [ReplenishmentController],
  providers: [ReplenishmentService, ReplenishmentScheduler],
  exports: [ReplenishmentService],
})
export class ReplenishmentModule {}
