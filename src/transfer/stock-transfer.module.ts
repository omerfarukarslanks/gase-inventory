import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StockTransfer } from './stock-transfer.entity';
import { StockTransferLine } from './stock-transfer-line.entity';
import { StockTransferService } from './stock-transfer.service';
import { StockTransferController } from './stock-transfer.controller';
import { Store } from '../store/store.entity';
import { ProductVariant } from '../product/product-variant.entity';
import { InventoryModule } from '../inventory/inventory.module'; // InventoryService için
import { AppContextService } from '../common/context/app-context.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StockTransfer,
      StockTransferLine,
      Store,
      ProductVariant,
    ]),
    InventoryModule, // InventoryService'i kullanmak için
  ],
  providers: [StockTransferService, AppContextService],
  controllers: [StockTransferController],
  exports: [StockTransferService],
})
export class StockTransferModule {}
