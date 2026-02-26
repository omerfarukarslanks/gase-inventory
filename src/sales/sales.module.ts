import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale } from './sale.entity';
import { SaleLine } from './sale-line.entity';
import { SalePayment } from './sale-payment.entity';
import { SaleReturn } from './sale-return.entity';
import { SaleReturnLine } from './sale-return-line.entity';
import { Customer } from 'src/customer/customer.entity';
import { Store } from 'src/store/store.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { InventoryModule } from 'src/inventory/inventory.module';
import { PriceModule } from 'src/pricing/price.module';
import { ExchangeRateModule } from 'src/exchange-rate/exchange-rate.module';
import { ProductPackageModule } from 'src/product-package/product-package.module';
import { SaleReceiptService } from './sale-receipt.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sale, SaleLine, SalePayment, SaleReturn, SaleReturnLine,
      Customer, Store, ProductVariant,
    ]),
    InventoryModule,
    PriceModule,
    ExchangeRateModule,
    ProductPackageModule,
  ],
  providers: [SalesService, SaleReceiptService],
  controllers: [SalesController],
  exports: [SalesService],
})
export class SalesModule {}
