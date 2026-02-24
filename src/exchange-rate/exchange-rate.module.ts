import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ExchangeRate } from './exchange-rate.entity';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRateController } from './exchange-rate.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExchangeRate]),
    HttpModule,
  ],
  providers: [ExchangeRateService],
  controllers: [ExchangeRateController],
  exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
