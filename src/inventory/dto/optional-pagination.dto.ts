import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class OptionalPaginationQueryDto {
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

  @ApiPropertyOptional({ description: 'Tek mağaza filtresi' })
  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @ApiPropertyOptional({
    description: 'Çoklu mağaza filtresi',
    type: [String],
    example: [
      '9e4bc337-95f0-4ea2-afc4-f2d4f446d8b6',
      'f8cc8f2e-4207-4f1e-ad68-a711a2d70840',
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

  @ApiPropertyOptional({ description: 'Ürün/varyant/mağaza adına göre arama' })
  @IsOptional()
  @IsString()
  search?: string;

  get hasPagination(): boolean {
    return this.page !== undefined || this.limit !== undefined;
  }

  get resolvedPage(): number {
    return this.page ?? 1;
  }

  get resolvedLimit(): number {
    return this.limit ?? 10;
  }

  get skip(): number {
    return (this.resolvedPage - 1) * this.resolvedLimit;
  }
}
