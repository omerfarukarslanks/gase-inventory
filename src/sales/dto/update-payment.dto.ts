import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { PaymentMethod } from '../sale-payment.entity';
import { SupportedCurrency } from 'src/common/constants/currency.constants';

export class UpdatePaymentDto {
  @ApiPropertyOptional({ example: 200.0, description: 'Güncellenmiş ödeme tutarı' })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({
    example: PaymentMethod.CARD,
    description: 'Ödeme yöntemi',
    enum: PaymentMethod,
  })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ example: 'Güncellendi', description: 'Ödeme açıklaması' })
  @IsString()
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({
    example: '2026-02-22T10:00:00.000Z',
    description: 'Ödeme tarihi',
  })
  @IsDateString()
  @IsOptional()
  paidAt?: string;

  @ApiPropertyOptional({
    example: SupportedCurrency.USD,
    description: 'Ödemenin para birimi',
    enum: SupportedCurrency,
  })
  @IsEnum(SupportedCurrency)
  @IsOptional()
  currency?: SupportedCurrency;
}
