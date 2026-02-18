import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class StockSummaryDto {
  @ApiPropertyOptional({
    description: 'Filtrelenecek mağaza ID listesi (context storeId yoksa kullanılır)',
    type: [String],
    example: [
      '08443723-dd00-49d2-969b-c27e579178dc',
      '1292efb0-ca75-4951-9641-8a75f47cf015',
    ],
  })
  @IsOptional()
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

  @ApiPropertyOptional({
    description: 'Ürün adı / varyant adı / varyant koduna göre arama',
    example: 'pantolon',
  })
  @IsOptional()
  @IsString()
  search?: string;

  get hasPagination(): boolean {
    return this.page !== undefined || this.limit !== undefined;
  }
}
