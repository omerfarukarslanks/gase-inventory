import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'Basic T-Shirt v2' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'TSHIRT-BASIC' })
  @IsString()
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional({ example: 'Pamuklu basic tshirt - güncellenmiş açıklama' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: true, description: 'Ürünün aktiflik durumu' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
  
  @ApiPropertyOptional({ example: 'https://example.com/image.jpg', description: 'Ürün resmi' })
  @IsString()
  @IsOptional()
  image?: string;
  // additionalImages?: string[];

  @ApiPropertyOptional({ example: 'TRY', default: 'TRY' })
  @IsString()
  @IsOptional()
  defaultCurrency?: string;

  @ApiPropertyOptional({ example: 299.9, description: 'Varsayılan satış fiyatı' })
  @IsNumber()
  @IsOptional()
  defaultSalePrice?: number;

  @ApiPropertyOptional({ example: 150, description: 'Varsayılan alış fiyatı (tedarik)' })
  @IsNumber()
  @IsOptional()
  defaultPurchasePrice?: number;

  @ApiPropertyOptional({ example: 20, description: 'Varsayılan vergi yüzdesi (KDV)' })
  @IsNumber()
  @IsOptional()
  defaultTaxPercent?: number;
}
