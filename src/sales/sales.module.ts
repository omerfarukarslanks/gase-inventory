import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale } from './sale.entity';
import { SaleLine } from './sale-line.entity';
import { Store } from 'src/store/store.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { InventoryModule } from 'src/inventory/inventory.module';
import { PriceModule } from 'src/pricing/price.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale, SaleLine, Store, ProductVariant]),
    InventoryModule, // stok düşmek için
    PriceModule,    // fiyat hesaplamak için
  ],
  providers: [SalesService],
  controllers: [SalesController],
  exports: [SalesService],
})
export class SalesModule {}
