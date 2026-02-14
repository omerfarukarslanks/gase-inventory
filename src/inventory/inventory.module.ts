import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryMovement } from './inventory-movement.entity';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { Store } from 'src/store/store.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { StoreVariantStock } from './store-variant-stock.entity';
import { StoreProductPrice } from 'src/pricing/store-product-price.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventoryMovement,
      Store,
      ProductVariant,
      StoreVariantStock,
      StoreProductPrice,
    ]),
  ],
  providers: [InventoryService],
  controllers: [InventoryController],
  exports: [InventoryService],
})
export class InventoryModule {}
