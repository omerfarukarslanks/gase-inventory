import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProductPackage } from './product-package.entity';
import { ProductPackageItem } from './product-package-item.entity';
import { ProductPackageService } from './product-package.service';
import { ProductPackageController } from './product-package.controller';
import { InventoryModule } from 'src/inventory/inventory.module';
import { ProductVariant } from 'src/product/product-variant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProductPackage, ProductPackageItem, ProductVariant]),
    InventoryModule,
  ],
  providers: [ProductPackageService],
  controllers: [ProductPackageController],
  exports: [ProductPackageService],
})
export class ProductPackageModule {}
