import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class AdjustStockDto {
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
