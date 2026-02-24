import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { PaymentMethod } from '../sale-payment.entity';

export class AddPaymentDto {
  @ApiProperty({ example: 150.0, description: 'Ödenen tutar' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({
    example: PaymentMethod.CASH,
    description: 'Ödeme yöntemi',
    enum: PaymentMethod,
    default: PaymentMethod.CASH,
  })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ example: 'İlk taksit', description: 'Ödeme açıklaması' })
  @IsString()
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({
    example: '2026-02-22T10:00:00.000Z',
    description: 'Ödeme tarihi (verilmezse şu an kullanılır)',
  })
  @IsDateString()
  @IsOptional()
  paidAt?: string;
}
