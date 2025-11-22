import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Product } from '../product.entity';

export class ListProductsQueryDto {
  @ApiPropertyOptional({ description: 'Liste başlangıç offset değeri', default: 0 })
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

  @ApiPropertyOptional({
    description: 'Belirtilen tarihten önce oluşturulan kayıtları getir (cursor pagination)',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  cursor?: string;
}

export interface PaginatedProductsResponse {
  data: Product[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    cursor?: string;
  };
}
