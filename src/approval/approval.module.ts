import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalRequest } from './entities/approval-request.entity';
import { ApprovalService } from './approval.service';
import { ApprovalController } from './approval.controller';
import { InventoryModule } from 'src/inventory/inventory.module';
import { PriceModule } from 'src/pricing/price.module';
import { AuditLogModule } from 'src/audit-log/audit-log.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApprovalRequest]),
    InventoryModule,
    PriceModule,
    AuditLogModule,
  ],
  providers: [ApprovalService],
  controllers: [ApprovalController],
  exports: [ApprovalService],
})
export class ApprovalModule {}
