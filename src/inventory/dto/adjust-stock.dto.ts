import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AdjustStockItemDto {
  @ApiProperty({ description: 'Stok düzeltmesi yapılacak mağaza ID' })
  @IsUUID('4')
  @IsNotEmpty()
  storeId: string;

  @ApiProperty({ description: 'Stok düzeltmesi yapılacak ürün varyant ID' })
  @IsUUID('4')
  @IsNotEmpty()
  productVariantId: string;

  @ApiProperty({ example: 32, description: 'Hedef stok miktarı' })
  @IsNumber()
  @Min(0)
  newQuantity: number;

  @ApiPropertyOptional({ example: 'COUNT-2025-001' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ example: { reason: 'Sayım farkı' } })
  @IsOptional()
  @IsObject()
  meta?: Record<string, any>;
}

export class AdjustStockDto {
  @ApiPropertyOptional({
    type: [AdjustStockItemDto],
    description: 'Mağaza bazlı toplu stok düzeltme satırları',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AdjustStockItemDto)
  items?: AdjustStockItemDto[];

  @ApiPropertyOptional({ description: 'Tek mağaza için stok düzeltme yapılacak mağaza ID' })
  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @ApiPropertyOptional({ description: 'Stok düzeltmesi yapılacak ürün varyant ID' })
  @ValidateIf((o) => !Array.isArray(o.items) || o.items.length === 0)
  @IsUUID('4')
  @IsNotEmpty()
  productVariantId?: string;

  @ApiPropertyOptional({ example: 32, description: 'Hedef stok miktarı' })
  @ValidateIf((o) => !Array.isArray(o.items) || o.items.length === 0)
  @IsNumber()
  @Min(0)
  newQuantity?: number;

  @ApiPropertyOptional({ example: 'COUNT-2025-001' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ example: { reason: 'Sayım farkı' } })
  @IsOptional()
  @IsObject()
  meta?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'true ise tenant içindeki tüm aktif mağazalara uygular',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  applyToAllStores?: boolean;
}
