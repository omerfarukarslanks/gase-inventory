import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePackageItemDto {
  @ApiPropertyOptional({ example: 'uuid', description: 'Paketteki variant ID\'si' })
  @IsUUID()
  productVariantId: string;

  @ApiPropertyOptional({ example: 10 })
  @IsNumber()
  @IsPositive()
  quantity: number;
}

export class UpdatePackageDto {
  @ApiPropertyOptional({ example: 'Kıyafet Paketi S/M/L' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'PKG-001' })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 150.0 })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  defaultSalePrice?: number;

  @ApiPropertyOptional({ example: 100.0 })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  defaultPurchasePrice?: number;

  @ApiPropertyOptional({ example: 18 })
  @IsNumber()
  @IsOptional()
  defaultTaxPercent?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsNumber()
  @IsOptional()
  defaultDiscountPercent?: number;

  @ApiPropertyOptional({ example: 'TRY' })
  @IsString()
  @IsOptional()
  defaultCurrency?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  /**
   * Gönderildiğinde mevcut item listesinin tamamı silinir,
   * yerine bu liste yazılır (full-replace semantics).
   */
  @ApiPropertyOptional({
    type: [UpdatePackageItemDto],
    description: 'Paketin içerdiği variant listesi — gönderilirse tüm liste değiştirilir',
  })
  @ValidateNested({ each: true })
  @Type(() => UpdatePackageItemDto)
  @ArrayMinSize(1)
  @IsOptional()
  items?: UpdatePackageItemDto[];
}
