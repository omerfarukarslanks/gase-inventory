import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListSaleReturnsDto {
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

  @ApiPropertyOptional({ example: '2026-03-01', description: 'Baslangic tarihi' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-03-31', description: 'Bitis tarihi' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Iade referansi, fis no, musteri veya not aramasi' })
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

export interface SaleReturnCustomerSummaryResponse {
  id: string;
  name: string | null;
  surname: string | null;
}

export interface SaleReturnCustomerDetailResponse extends SaleReturnCustomerSummaryResponse {
  phoneNumber: string | null;
  email: string | null;
}

export interface SaleReturnListItemResponse {
  id: string;
  returnNo: string | null;
  saleId: string;
  saleReference: string;
  returnedAt: Date;
  notes: string | null;
  lineCount: number;
  totalRefundAmount: string;
  store: {
    id: string;
    name: string | null;
  };
  customer: SaleReturnCustomerSummaryResponse | null;
}

export interface SaleReturnPackageVariantReturnResponse {
  productVariantId: string;
  productName: string | null;
  variantName: string | null;
  quantity: number;
}

export interface SaleReturnDetailLineResponse {
  id: string;
  saleLineId: string;
  quantity: string;
  refundAmount: string;
  packageVariantReturns: SaleReturnPackageVariantReturnResponse[] | null;
  saleLine: {
    id: string;
    productType: 'VARIANT' | 'PACKAGE';
    productId: string | null;
    productName: string | null;
    productVariantId: string | null;
    variantName: string | null;
    productPackageId: string | null;
    packageName: string | null;
    currency: string | null;
  };
}

export interface SaleReturnDetailResponse {
  id: string;
  returnNo: string | null;
  saleId: string;
  saleReference: string;
  returnedAt: Date;
  notes: string | null;
  totalRefundAmount: string;
  store: {
    id: string;
    name: string | null;
  };
  customer: SaleReturnCustomerDetailResponse | null;
  lines: SaleReturnDetailLineResponse[];
}

export interface PaginatedSaleReturnsResponse {
  data: SaleReturnListItemResponse[];
  meta?: {
    total: number;
    limit: number;
    page: number;
    totalPages: number;
  };
}
