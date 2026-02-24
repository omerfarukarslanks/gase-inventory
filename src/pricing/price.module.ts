import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreProductPrice } from './store-product-price.entity';
import { ProductVariant } from '../product/product-variant.entity';
import { PriceService } from './price.service';
import { AppContextService } from '../common/context/app-context.service';
import { StoreProductPricesController } from './store-product-prices.controller';
import { Store } from 'src/store/store.entity';
import { Product } from 'src/product/product.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([StoreProductPrice, ProductVariant, Store, Product]),
  ],
  controllers: [StoreProductPricesController],
  providers: [PriceService, AppContextService],
  exports: [PriceService],
})
export class PriceModule {}
