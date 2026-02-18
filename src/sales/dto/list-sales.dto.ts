import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Sale } from '../sale.entity';

export class ListSalesForStoreQueryDto {
  @ApiPropertyOptional({ description: 'Tek mağaza filtresi (opsiyonel)' })
  @IsOptional()
  @IsUUID()
  storeId?: string;

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
