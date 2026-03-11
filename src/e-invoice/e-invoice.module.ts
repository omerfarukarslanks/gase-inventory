import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { EInvoice } from './entities/e-invoice.entity';
import { EInvoiceService } from './e-invoice.service';
import { EInvoiceController } from './e-invoice.controller';
import { GibProvider } from './providers/gib.provider';
import { SalesModule } from 'src/sales/sales.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EInvoice]),
    HttpModule.register({ timeout: 30_000 }),
    SalesModule,
  ],
  providers: [EInvoiceService, GibProvider],
  controllers: [EInvoiceController],
  exports: [EInvoiceService],
})
export class EInvoiceModule {}
