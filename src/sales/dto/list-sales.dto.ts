import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Sale } from '../sale.entity';

export class ListSalesForStoreQueryDto {
  @ApiProperty({ description: 'Mağaza kimliği' })
  @IsUUID()
  @IsNotEmpty()
  storeId: string;

  @ApiPropertyOptional({ description: 'Sayfanın başlangıç offset değeri', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;

  @ApiPropertyOptional({ description: 'Döndürülecek kayıt sayısı', default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;

  @ApiPropertyOptional({ description: 'Satır (line) detaylarını dahil et' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeLines: boolean = false;
}

export interface PaginatedSalesResponse {
  data: Sale[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
