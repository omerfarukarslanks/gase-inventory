import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Sale, SaleStatus } from '../sale.entity';

export class ListSalesForStoreQueryDto {
  @ApiPropertyOptional({
    description: 'Çoklu mağaza filtresi',
    type: [String],
    example: [
      '08443723-dd00-49d2-969b-c27e579178dc',
      '1292efb0-ca75-4951-9641-8a75f47cf015',
    ],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === '') {
      return undefined;
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => String(item).trim())
        .filter(Boolean);
    }

    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return undefined;
  })
  @IsArray()
  @IsUUID('4', { each: true })
  storeIds?: string[];

  @ApiPropertyOptional({ description: 'Sayfa numarası (1 tabanlı)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Sayfa başına kayıt', maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Satır (line) detaylarını dahil et' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeLines: boolean = false;

  @ApiPropertyOptional({ description: 'Fiş numarasına göre filtre', example: 'SF-20260218' })
  @IsOptional()
  @IsString()
  receiptNo?: string;

  @ApiPropertyOptional({ description: 'Müşteri adı filtresi', example: 'Ahmet' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Müşteri soyadı filtresi', example: 'Yılmaz' })
  @IsOptional()
  @IsString()
  surname?: string;

  @ApiPropertyOptional({ description: 'Satış durum filtresi', enum: SaleStatus })
  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @ApiPropertyOptional({ description: 'Toplam birim fiyat alt sınırı', example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minUnitPrice?: number;

  @ApiPropertyOptional({ description: 'Toplam birim fiyat üst sınırı', example: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxUnitPrice?: number;

  @ApiPropertyOptional({ description: 'Toplam lineTotal alt sınırı', example: 900 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minLineTotal?: number;

  @ApiPropertyOptional({ description: 'Toplam lineTotal üst sınırı', example: 6000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxLineTotal?: number;

  get hasPagination(): boolean {
    return this.page !== undefined || this.limit !== undefined;
  }
}

export interface PaginatedSalesResponse {
  data: Sale[];
  meta?: {
    total: number;
    limit: number;
    page: number;
    totalPages: number;
  };
}
