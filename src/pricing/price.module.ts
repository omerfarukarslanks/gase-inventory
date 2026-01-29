import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreProductPrice } from './store-product-price.entity';
import { ProductVariant } from '../product/product-variant.entity';
import { PriceService } from './price.service';
import { AppContextService } from '../common/context/app-context.service';
import { StoreProductPricesController } from './store-product-prices.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([StoreProductPrice, ProductVariant]),
  ],
  controllers: [StoreProductPricesController],
  providers: [PriceService, AppContextService],
  exports: [PriceService],
})
export class PriceModule {}
