import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from 'src/store/store.entity';
import { Sale } from 'src/sales/sale.entity';
import { SaleLine } from 'src/sales/sale-line.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { Product } from 'src/product/product.entity';
import { StoreVariantStock } from 'src/inventory/store-variant-stock.entity';
import { StoreProductPrice } from 'src/pricing/store-product-price.entity';
import { InventoryMovement } from 'src/inventory/inventory-movement.entity';
import { User } from 'src/user/user.entity';
import { StockTransfer } from 'src/transfer/stock-transfer.entity';
import { StockTransferLine } from 'src/transfer/stock-transfer-line.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StoreVariantStock,
      StoreProductPrice,
      Store,
      Sale,
      SaleLine,
      Product,
      ProductVariant,
      InventoryMovement,
      User,
      StockTransfer,
      StockTransferLine,
    ]),
  ],
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}
