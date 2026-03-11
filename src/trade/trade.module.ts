import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerGroup } from './entities/customer-group.entity';
import { CustomerCreditLimit } from './entities/customer-credit-limit.entity';
import { PaymentTerm } from './entities/payment-term.entity';
import { PriceListEntry } from './entities/price-list-entry.entity';
import { TradeService } from './trade.service';
import { TradeController } from './trade.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerGroup,
      CustomerCreditLimit,
      PaymentTerm,
      PriceListEntry,
    ]),
  ],
  providers: [TradeService],
  controllers: [TradeController],
  exports: [TradeService],
})
export class TradeModule {}
