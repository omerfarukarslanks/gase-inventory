import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentMethod, SalePaymentStatus } from '../sale-payment.entity';

export class ListSalePaymentsDto {
  @ApiPropertyOptional({ minimum: 1, description: 'Sayfa numarasi (verilmezse tum kayitlar)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, description: 'Sayfa basina kayit' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Magaza ID filtresi' })
  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @ApiPropertyOptional({
    description: 'Odeme yontemi filtresi',
    enum: PaymentMethod,
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Odeme durum filtresi (verilmezse ACTIVE)',
    enum: SalePaymentStatus,
  })
  @IsOptional()
  @IsEnum(SalePaymentStatus)
  status?: SalePaymentStatus;

  @ApiPropertyOptional({ example: '2026-03-01', description: 'Odeme tarihi baslangici' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-03-31', description: 'Odeme tarihi bitisi' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Odeme referansi, satis referansi, musteri veya not aramasi',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  get hasPagination(): boolean {
    return this.page !== undefined || this.limit !== undefined;
  }

  get skip(): number {
    return ((this.page ?? 1) - 1) * (this.limit ?? 20);
  }
}

export interface SalePaymentListItemResponse {
  id: string;
  paymentReference: string;
  saleId: string;
  saleReference: string;
  customerName: string | null;
  store: {
    id: string;
    name: string | null;
  };
  paymentMethod: PaymentMethod;
  amount: string;
  currency: string | null;
  paidAt: Date;
  status: SalePaymentStatus;
  note: string | null;
}

export interface SalePaymentDetailResponse extends SalePaymentListItemResponse {
  exchangeRate: string;
  amountInBaseCurrency: string;
  cancelledAt: Date | null;
  cancelledById: string | null;
}

export interface PaginatedSalePaymentsResponse {
  data: SalePaymentListItemResponse[];
  meta?: {
    total: number;
    limit: number;
    page: number;
    totalPages: number;
  };
}
