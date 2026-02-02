import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
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
  data: InventoryMovement[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
