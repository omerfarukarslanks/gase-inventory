import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderLine } from './entities/purchase-order-line.entity';
import { GoodsReceipt } from './entities/goods-receipt.entity';
import { GoodsReceiptLine } from './entities/goods-receipt-line.entity';
import { InventoryModule } from 'src/inventory/inventory.module';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { OutboxModule } from 'src/outbox/outbox.module';
import { ProductVariant } from 'src/product/product-variant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PurchaseOrder,
      PurchaseOrderLine,
      GoodsReceipt,
      GoodsReceiptLine,
      ProductVariant,
    ]),
    InventoryModule,
    AuditLogModule,
    OutboxModule,
  ],
  controllers: [ProcurementController],
  providers: [ProcurementService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
