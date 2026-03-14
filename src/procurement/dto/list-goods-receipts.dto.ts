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

export class ListGoodsReceiptsDto {
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

  @ApiPropertyOptional({ description: 'Depo ID filtresi' })
  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @ApiPropertyOptional({ example: '2026-03-01', description: 'Baslangic tarihi' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-03-31', description: 'Bitis tarihi' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Not veya satin alma siparisi referansi aramasi' })
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
