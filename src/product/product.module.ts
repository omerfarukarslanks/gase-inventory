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
import { Supplier } from 'src/supplier/supplier.entity';
import { ProductCategory } from './product-category.entity';
import { ProductCategoryService } from './product-category.service';
import { ProductCategoryController } from './product-category.controller';

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
      Supplier,
      ProductCategory,
    ]),
  ],
  providers: [ProductService, ProductCategoryService],
  controllers: [ProductController, ProductCategoryController],
  exports: [ProductService, ProductCategoryService],
})
export class ProductModule {}
