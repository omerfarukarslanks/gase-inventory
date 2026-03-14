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
import { InventoryMovement, MovementType } from '../inventory-movement.entity';

export class ListMovementsQueryDto {
  @ApiPropertyOptional({ description: 'Mağaza ID filtresi' })
  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @ApiPropertyOptional({ description: 'Ürün varyant ID filtresi' })
  @IsOptional()
  @IsUUID('4')
  productVariantId?: string;

  @ApiPropertyOptional({ description: 'Depo ID filtresi (lokasyon bagli hareketler icin)' })
  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @ApiPropertyOptional({ enum: MovementType, description: 'Hareket tipi filtresi' })
  @IsOptional()
  @IsEnum(MovementType)
  type?: MovementType;

  @ApiPropertyOptional({ description: 'Başlangıç tarihi', format: 'date-time' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Bitiş tarihi', format: 'date-time' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Magaza, urun, lokasyon veya meta aramasi' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}

export interface PaginatedMovementsResponse {
  data: InventoryMovementHistoryItemResponse[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export type InventoryMovementHistoryItemResponse = InventoryMovement & {
  productId: string | null;
  productName: string | null;
  locationName: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  reason: string | null;
};
