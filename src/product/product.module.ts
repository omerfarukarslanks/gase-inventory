import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { ProductVariant } from './product-variant.entity';
import { Attribute } from 'src/attribute/entity/attribute.entity';
import { AttributeValue } from 'src/attribute/entity/attribute-value.entity';
import { Store } from 'src/store/store.entity';
import { StoreVariantStock } from 'src/inventory/store-variant-stock.entity';
import { StoreProductPrice } from 'src/pricing/store-product-price.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductVariant,
      Attribute,
      AttributeValue,
      Store,
      StoreVariantStock,
      StoreProductPrice,
    ]),
  ],
  providers: [ProductService],
  controllers: [ProductController],
  exports: [ProductService],
})
export class ProductModule {}
