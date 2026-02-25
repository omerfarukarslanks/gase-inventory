import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreatePackageItemDto {
  @ApiProperty({ example: 'uuid', description: 'Paketteki variant ID\'si' })
  @IsUUID()
  productVariantId: string;

  @ApiProperty({ example: 10, description: 'Paket başına bu variantten kaç adet' })
  @IsNumber()
  @IsPositive()
  quantity: number;
}

export class CreatePackageDto {
  @ApiProperty({ example: 'Kıyafet Paketi S/M/L', description: 'Paket adı' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'PKG-001', description: 'Paket kodu (tenant içinde unique)' })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ example: 'S, M, L bedenlerinden birer adet içerir' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 150.0, description: 'Varsayılan satış fiyatı (paket başına)' })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  defaultSalePrice?: number;

  @ApiPropertyOptional({ example: 100.0, description: 'Varsayılan alış fiyatı (paket başına)' })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  defaultPurchasePrice?: number;

  @ApiPropertyOptional({ example: 18, description: 'Varsayılan vergi oranı (%)' })
  @IsNumber()
  @IsOptional()
  defaultTaxPercent?: number;

  @ApiPropertyOptional({ example: 10, description: 'Varsayılan indirim oranı (%)' })
  @IsNumber()
  @IsOptional()
  defaultDiscountPercent?: number;

  @ApiPropertyOptional({ example: 'TRY', description: 'Varsayılan para birimi' })
  @IsString()
  @IsOptional()
  defaultCurrency?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({
    type: [CreatePackageItemDto],
    description: 'Paketin içerdiği variant listesi (en az 1 adet)',
  })
  @ValidateNested({ each: true })
  @Type(() => CreatePackageItemDto)
  @ArrayMinSize(1)
  items: CreatePackageItemDto[];
}
