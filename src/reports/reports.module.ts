import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from 'src/store/store.entity';
import { Sale } from 'src/sales/sale.entity';
import { SaleLine } from 'src/sales/sale-line.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { StoreVariantStock } from 'src/inventory/store-variant-stock.entity';
import { InventoryMovement } from 'src/inventory/inventory-movement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StoreVariantStock,
      Store,
      Sale,
      SaleLine,
      ProductVariant,
      InventoryMovement,
    ]),
  ],
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}
